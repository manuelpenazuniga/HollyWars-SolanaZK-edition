"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useSingleWar } from "@/hooks/useSingleWar";
import { Battlefront } from "@/components/Battlefront";
import { VOTING_LIVE, API, WAR_BY_SLUG } from "@/lib/config";
import { connection } from "@/lib/solana";
import { decodeWarAccount } from "@/lib/decode";
import { loadKit } from "@/lib/identity";
import { waitForConsistentRoot } from "@/lib/census-tree";
import { poseidon } from "@/lib/poseidon";
import { generateVoteProof, DOMAIN_VOTE } from "@/lib/prove";

const FORGE_STAGES = [
  "loading census tree — depth 20, room for 1,048,576 devs",
  "building merkle path to your secret leaf",
  "forging groth16 proof — 12,131 constraints",
  "proof ready — 256 bytes of pure alibi",
  "relaying anonymously — your wallet stays home",
  "vote landed on-chain — nullifier burned",
] as const;

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function fetchOnChainRootHex(pda: import("@solana/web3.js").PublicKey): Promise<string> {
  const info = await connection.getAccountInfo(pda);
  if (!info) throw new Error("war account not found on-chain");
  return bytesToHex(decodeWarAccount(info.data).censusRoot);
}

function ForgeTerminal({ stage, done }: { stage: number; done: boolean }) {
  return (
    <div className="panel-inset crt border-arcane/40 p-5 animate-rise">
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`w-2 h-2 bg-arcane ${done ? "" : "animate-live-blink"}`}
          aria-hidden
        />
        <span className="hud-label text-arcane">ZK Forge</span>
      </div>
      <ol className="space-y-1.5 font-mono text-[13px]">
        {FORGE_STAGES.slice(0, stage + 1).map((line, i) => (
          <li key={line} className="animate-feed-in">
            <span
              className={done || i === stage ? "text-arcane" : "text-arcane/65"}
            >
              {done || i < stage ? "  ✓" : "  ▸"} {line}
              {!done && i === stage && (
                <span className="animate-cursor-blink" aria-hidden>
                  _
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <div
        className="mt-4 flex gap-px h-2"
        role="progressbar"
        aria-valuenow={stage + 1}
        aria-valuemin={0}
        aria-valuemax={FORGE_STAGES.length}
      >
        {FORGE_STAGES.map((s, i) => (
          <div
            key={s}
            className={`flex-1 transition-colors duration-300 ${i <= stage ? "bg-arcane" : "bg-panel-edge"}`}
          />
        ))}
      </div>
    </div>
  );
}

export function VotingBooth() {
  const params = useParams();
  const warSlug = params.id as string;
  const { war, loading } = useSingleWar(warSlug);

  const [selectedSide, setSelectedSide] = useState<"a" | "b" | null>(null);
  const [battleCry, setBattleCry] = useState("");
  const [forgeStage, setForgeStage] = useState<number | null>(null);
  const [voteComplete, setVoteComplete] = useState(false);
  const [enlisted, setEnlisted] = useState<boolean | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [voteSig, setVoteSig] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const warEntry = WAR_BY_SLUG[warSlug];

  useEffect(() => {
    // Enlisted for THIS war iff an identity kit exists in localStorage. In demo mode we
    // keep the legacy behavior (any prior "enlist" click) so the demo UX is unbroken.
    if (VOTING_LIVE && warEntry) {
      setEnlisted(loadKit(warEntry.warId) !== null);
    } else {
      setEnlisted(localStorage.getItem("holywars_enlisted") === "1");
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [warEntry]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto panel p-10 text-center space-y-3">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-panel-edge w-48 mx-auto" />
          <div className="h-5 bg-panel-edge w-full" />
          <div className="h-5 bg-panel-edge w-3/4 mx-auto" />
        </div>
      </div>
    );
  }

  if (!war) {
    return (
      <div className="max-w-2xl mx-auto panel p-10 text-center space-y-3 animate-rise">
        <Image
          src="/img/green.png"
          alt=""
          width={67}
          height={64}
          unoptimized
          className="pixelated select-none mx-auto opacity-80"
          aria-hidden
        />
        <h2 className="font-pixel text-xl text-bone">404 — NO SUCH WAR</h2>
        <p className="font-sans text-sm text-bone/60">
          This battlefield does not exist. Pick a real fight instead.
        </p>
        <Link href="/" className="btn-ghost">
          ← Back to the War Room
        </Link>
      </div>
    );
  }

  const isForging = forgeStage !== null && !voteComplete;

  // Real ZK vote: census snapshot consistent with the on-chain root → merkle path →
  // in-browser Groth16 proof → relayer. Retries the whole snapshot once if the root moved
  // under us (someone enrolled between proof and tx).
  const forgeRealVote = async (): Promise<void> => {
    if (!warEntry) throw new Error("unknown war");
    const kit = loadKit(warEntry.warId);
    if (!kit) {
      setEnlisted(false);
      throw new Error("no census identity for this war — enlist first");
    }
    // LOW-3: the chain enforces 140 UTF-8 bytes; fail fast rather than after ~20s of proving.
    if (new TextEncoder().encode(battleCry).length > 140) {
      throw new Error("battle cry exceeds 140 bytes — shorten it");
    }
    const side = selectedSide === "a" ? 0 : 1;
    const weight = side === 0 ? kit.weightA : kit.weightB;

    const attempt = async (): Promise<string> => {
      setForgeStage(0);
      const snap = await waitForConsistentRoot(
        async () => {
          const r = await fetch(API.leaves(warEntry.warId));
          if (!r.ok) throw new Error(`census fetch failed (${r.status})`);
          // CRITICAL-1: the route returns {leaf_index, commitment}[] — extract commitments.
          const rows = (await r.json()) as {
            leaf_index: number;
            commitment: string;
          }[];
          return rows.map((l) => l.commitment);
        },
        () => fetchOnChainRootHex(warEntry.pda),
        kit.leafIndex,
        { expectedLeafHex: kit.commitment },
      );
      setForgeStage(1);
      const nullifier = await poseidon([
        BigInt(kit.nullifierSeed),
        BigInt(warEntry.warId),
        DOMAIN_VOTE,
      ]);
      setForgeStage(2);
      const vote = await generateVoteProof({
        trapdoor: kit.trapdoor,
        nullifier_seed: kit.nullifierSeed,
        weight_a: kit.weightA,
        weight_b: kit.weightB,
        merkle_path: snap.proof.pathElements.map(String),
        path_indices: snap.proof.pathIndices,
        root: snap.proof.root.toString(),
        nullifier_hash: nullifier.toString(),
        war_id: warEntry.warId,
        side,
        weight,
      });
      setForgeStage(3);
      setForgeStage(4);
      const res = await fetch(API.relayVote, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          war_id: warEntry.warId,
          nullifier_hash: vote.nullifier_hash,
          proof: vote.proof,
          public_inputs: vote.public_inputs,
          battle_cry: battleCry,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `relay failed (${res.status})`);
      }
      const body = (await res.json()) as { tx_signature: string };
      return body.tx_signature;
    };

    try {
      const sig = await attempt();
      setVoteSig(sig);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/root|stale|mismatch/i.test(msg)) {
        const sig = await attempt(); // one retry on a moved census root
        setVoteSig(sig);
      } else {
        throw e;
      }
    }
    setForgeStage(5);
    setVoteComplete(true);
  };

  const handleForge = async () => {
    if (!selectedSide || !enlisted) return;
    setRelayError(null);

    if (VOTING_LIVE) {
      try {
        await forgeRealVote();
      } catch (err) {
        setRelayError(err instanceof Error ? err.message : "vote failed");
        setForgeStage(null);
      }
      return;
    }

    // Demo mode: theatrical forge, no network. (Automatic fallback when the backend gate is off.)
    setForgeStage(0);
    let idx = 0;
    timer.current = setInterval(() => {
      idx++;
      if (idx < FORGE_STAGES.length) {
        setForgeStage(idx);
      } else {
        if (timer.current) clearInterval(timer.current);
        setVoteComplete(true);
      }
    }, 1100);
  };

  const reset = () => {
    setSelectedSide(null);
    setBattleCry("");
    setForgeStage(null);
    setVoteComplete(false);
    setRelayError(null);
    setVoteSig(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/"
          className="font-mono text-xs text-bone/40 hover:text-bone transition-colors"
        >
          ← War Room
        </Link>
        <h2 className="font-sans font-bold text-3xl md:text-4xl tracking-tight mt-2 mb-5">
          {war.title}
        </h2>
        <Battlefront war={war} variant="card" />
      </div>

      {enlisted === false && (
        <div className="panel border-gold/40 p-6 md:p-8 space-y-4 animate-rise">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-gold animate-live-blink" aria-hidden />
            <span className="hud-label text-gold">Census check</span>
          </div>
          <div className="flex items-start gap-5">
            <Image
              src="/img/green.png"
              alt=""
              width={59}
              height={56}
              unoptimized
              className="pixelated select-none hidden sm:block shrink-0 mt-1"
              aria-hidden
            />
            <div className="space-y-4">
              <p className="font-pixel text-sm text-bone">
                THE CENSUS DOESN&apos;T KNOW YOU
              </p>
              <p className="font-sans text-sm text-bone/70 max-w-lg">
                Voting here isn&apos;t gated by a login — it&apos;s gated by
                mathematics. The zero-knowledge proof needs the Merkle path to
                <em> your</em> leaf in the census tree. No enlistment, no leaf;
                no leaf, no proof; no proof, no vote.
              </p>
            </div>
          </div>
          <Link
            href={`/enlist?war=${warSlug}`}
            className="btn-primary"
          >
            Enlist first →
          </Link>
        </div>
      )}

      <div
        className={`panel p-6 md:p-8 space-y-6 transition-opacity duration-300 ${
          enlisted ? "" : "opacity-40 pointer-events-none select-none"
        }`}
        aria-disabled={!enlisted}
      >
        <fieldset disabled={!enlisted || isForging || voteComplete}>
          <legend className="hud-label mb-4">Choose your banner</legend>
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
            <button
              onClick={() => setSelectedSide("a")}
              aria-pressed={selectedSide === "a"}
              className={`press p-5 md:p-6 border text-center ${
                selectedSide === "a"
                  ? "border-p1 bg-p1/10"
                  : "border-panel-edge hover:border-p1/50"
              }`}
            >
              <span className="hud-label text-p1 block mb-1.5">P1</span>
              <span className="font-sans font-bold text-lg md:text-xl">
                {war.sideA}
              </span>
            </button>
            <span className="font-pixel text-bone/25 text-sm self-center">
              VS
            </span>
            <button
              onClick={() => setSelectedSide("b")}
              aria-pressed={selectedSide === "b"}
              className={`press p-5 md:p-6 border text-center ${
                selectedSide === "b"
                  ? "border-p2 bg-p2/10"
                  : "border-panel-edge hover:border-p2/50"
              }`}
            >
              <span className="hud-label text-p2 block mb-1.5">P2</span>
              <span className="font-sans font-bold text-lg md:text-xl">
                {war.sideB}
              </span>
            </button>
          </div>
        </fieldset>

        <div>
          <label htmlFor="battle-cry" className="hud-label block mb-2">
            Battle cry — optional, anonymous
          </label>
          <textarea
            id="battle-cry"
            value={battleCry}
            onChange={(e) => setBattleCry(e.target.value.slice(0, 140))}
            placeholder="Shout into the void…"
            rows={2}
            className="input-console resize-none"
            disabled={!enlisted || isForging || voteComplete}
          />
          <p className="font-mono text-[11px] text-bone/30 mt-1 text-right">
            {new TextEncoder().encode(battleCry).length}/140 bytes
          </p>
        </div>

        {forgeStage !== null && (
          <ForgeTerminal
            stage={voteComplete ? FORGE_STAGES.length - 1 : forgeStage}
            done={voteComplete}
          />
        )}

        {relayError && (
          <div className="border border-p1/40 bg-p1/10 p-4 text-center animate-rise">
            <p className="font-mono text-sm text-p1">
              VOTE ERROR: {relayError}
            </p>
          </div>
        )}

        {voteComplete && (
          <div className="border border-gold/40 bg-gold/10 p-5 text-center space-y-2 animate-stamp">
            <Image
              src="/img/purple.png"
              alt=""
              width={56}
              height={48}
              unoptimized
              className="pixelated select-none mx-auto"
              aria-hidden
            />
            <p className="font-pixel text-sm text-gold">VOTE FORGED</p>
            <p className="font-sans text-sm text-bone/70">
              Anonymous. Weighted. Eternal. Your nullifier is burned — voting
              twice is no longer against the rules, it&apos;s against
              mathematics.
            </p>
            {voteSig && (
              <a
                href={`https://explorer.solana.com/tx/${voteSig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-arcane underline break-all"
              >
                view tx on explorer ↗
              </a>
            )}
          </div>
        )}

        {!isForging && !voteComplete && (
          <button
            onClick={handleForge}
            disabled={!selectedSide || !enlisted}
            className="btn-arcane w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Forge zero-knowledge vote
          </button>
        )}

        {voteComplete && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={reset} className="btn-ghost">
              {VOTING_LIVE ? "Done" : "Reset demo"}
            </button>
            <Link href="/medals" className="btn-primary text-center">
              Claim your medal →
            </Link>
          </div>
        )}
      </div>

      <p className="font-mono text-xs text-bone/35 panel-inset p-4">
        <span className="text-gold">▮</span>{" "}
        {VOTING_LIVE
          ? "LIVE — this button runs snarkjs in your browser and hands the proof to a relayer, so your wallet never touches the ballot box."
          : "DEMO MODE — voting not yet enabled here. In production this button runs snarkjs-wasm in your browser and hands the proof to a relayer, so your wallet never touches the ballot box."}
      </p>
    </div>
  );
}
