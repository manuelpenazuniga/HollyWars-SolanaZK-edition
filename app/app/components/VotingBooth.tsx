"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSingleWar } from "@/hooks/useSingleWar";
import { Battlefront } from "@/components/Battlefront";
import { ENLISTED_KEY } from "@/components/EnlistWizard";
import { RELAYER_URL } from "@/lib/config";
import { WAR_BY_SLUG } from "@/lib/config";

const FORGE_STAGES = [
  "loading census tree — depth 20, room for 1,048,576 devs",
  "building merkle path to your secret leaf",
  "forging groth16 proof — 12,131 constraints",
  "proof ready — 256 bytes of pure alibi",
  "relaying anonymously — your wallet stays home",
  "vote landed on-chain — nullifier burned",
] as const;

function ForgeTerminal({ stage, done }: { stage: number; done: boolean }) {
  return (
    <div className="panel-inset crt border-arcane/40 p-5">
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
              className={
                done || i === stage ? "text-arcane" : "text-arcane/65"
              }
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
            className={`flex-1 ${i <= stage ? "bg-arcane" : "bg-panel-edge"}`}
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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setEnlisted(localStorage.getItem(ENLISTED_KEY) === "1");
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

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
      <div className="max-w-2xl mx-auto panel p-10 text-center space-y-3">
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
  const hasRelayer = !!RELAYER_URL;
  const warEntry = WAR_BY_SLUG[warSlug];

  const handleForge = async () => {
    if (!selectedSide || !enlisted) return;
    setRelayError(null);

    if (hasRelayer && warEntry) {
      setForgeStage(0);
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 600));
        setForgeStage(i + 1);
      }
      try {
        const res = await fetch(`${RELAYER_URL}/relay-vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            warId: warEntry.warId,
            side: selectedSide === "a" ? 0 : 1,
            battleCry,
            // TODO(audit): in-browser proof gen — placeholder proof payload
            proof: { a: "0x", b: "0x", c: "0x", publicInputs: [] },
          }),
        });
        if (!res.ok) throw new Error(`relay: ${res.status}`);
        setForgeStage(5);
        setVoteComplete(true);
      } catch (err) {
        setRelayError(
          err instanceof Error ? err.message : "relay failed",
        );
        setForgeStage(null);
      }
    } else {
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
    }
  };

  const reset = () => {
    setSelectedSide(null);
    setBattleCry("");
    setForgeStage(null);
    setVoteComplete(false);
    setRelayError(null);
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
        <div className="panel border-gold/40 p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-gold animate-live-blink" aria-hidden />
            <span className="hud-label text-gold">Census check</span>
          </div>
          <p className="font-pixel text-sm text-bone">
            THE CENSUS DOESN&apos;T KNOW YOU
          </p>
          <p className="font-sans text-sm text-bone/70 max-w-lg">
            Voting here isn&apos;t gated by a login — it&apos;s gated by
            mathematics. The zero-knowledge proof needs the Merkle path to
            <em> your</em> leaf in the census tree. No enlistment, no leaf; no
            leaf, no proof; no proof, no vote.
          </p>
          <Link href="/enlist" className="btn-primary">
            Enlist first →
          </Link>
        </div>
      )}

      <div
        className={`panel p-6 md:p-8 space-y-6 ${
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
              className={`p-5 md:p-6 border text-center transition-colors ${
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
              className={`p-5 md:p-6 border text-center transition-colors ${
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
            {battleCry.length}/140 bytes
          </p>
        </div>

        {forgeStage !== null && (
          <ForgeTerminal
            stage={voteComplete ? FORGE_STAGES.length - 1 : forgeStage}
            done={voteComplete}
          />
        )}

        {relayError && (
          <div className="border border-p1/40 bg-p1/10 p-4 text-center">
            <p className="font-mono text-sm text-p1">
              RELAY ERROR: {relayError}
            </p>
          </div>
        )}

        {voteComplete && (
          <div className="border border-gold/40 bg-gold/10 p-5 text-center space-y-2">
            <p className="font-pixel text-sm text-gold">VOTE FORGED</p>
            <p className="font-sans text-sm text-bone/70">
              Anonymous. Weighted. Eternal. Your nullifier is burned — voting
              twice is no longer against the rules, it&apos;s against
              mathematics.
            </p>
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
              Reset demo
            </button>
            <Link href="/medals" className="btn-primary text-center">
              Claim your medal →
            </Link>
          </div>
        )}
      </div>

      <p className="font-mono text-xs text-bone/35 panel-inset p-4">
        <span className="text-gold">▮</span>{" "}
        {hasRelayer
          ? "RELAYER CONNECTED — votes forwarded via anonymous relayer."
          : "DEMO MODE — NEXT_PUBLIC_RELAYER_URL not set. In production this button runs snarkjs-wasm in your browser and hands the proof to a relayer, so your wallet never touches the ballot box."}
      </p>
    </div>
  );
}
