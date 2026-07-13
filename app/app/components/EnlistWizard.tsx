"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VOTING_LIVE, GITHUB_CLIENT_ID, API, WAR_BY_SLUG } from "@/lib/config";
import {
  generateSecrets,
  computeInner,
  computeCommitment,
  feToHex,
  saveKit,
  type IdentityKit,
} from "@/lib/identity";

export const ENLISTED_KEY = "holywars_enlisted";

const MOCK_GITHUB = {
  username: "dev_soldier_42",
  accountAge: "3.2 years",
  commits: 1847,
  repos: 23,
};

const MOCK_WEIGHTS = [
  {
    war: "Tabs vs Spaces",
    sideA: "TABS",
    sideB: "SPACES",
    weightA: 1,
    weightB: 3,
    evidence: "87% of sampled lines indented with spaces, across 23 repos",
    hypocrisy: "Voting TABS would weigh 1/3 — the census remembers your spaces.",
  },
  {
    war: "Vim vs Emacs",
    sideA: "VIM",
    sideB: "EMACS",
    weightA: 2,
    weightB: 1,
    evidence: ".vimrc found — 214 lines, last touched 3 days ago",
    hypocrisy: null,
  },
  {
    war: "Dark vs Light",
    sideA: "DARK",
    sideB: "LIGHT",
    weightA: 3,
    weightB: 1,
    evidence: "every screenshot you ever committed has a dark background",
    hypocrisy: null,
  },
];

const OAUTH_STATE_KEY = "holywars_oauth_state";
const OAUTH_WAR_KEY = "holywars_oauth_war"; // warId
const OAUTH_SLUG_KEY = "holywars_oauth_slug";

// MEDIUM-1 recovery: if the census already has our leaf (a prior register landed), recover
// (weight_a, weight_b, leaf_index) by brute-forcing the 9 weight pairs against the leaves.
async function recoverKit(
  warId: number,
  inner: bigint,
): Promise<{
  weightA: number;
  weightB: number;
  leafIndex: number;
  commitment: string;
} | null> {
  const r = await fetch(API.leaves(warId));
  if (!r.ok) return null;
  const rows = (await r.json()) as { leaf_index: number; commitment: string }[];
  for (let wa = 1; wa <= 3; wa++) {
    for (let wb = 1; wb <= 3; wb++) {
      const c = feToHex(await computeCommitment(inner, wa, wb));
      const match = rows.find((row) => row.commitment.toLowerCase() === c);
      if (match) {
        return {
          weightA: wa,
          weightB: wb,
          leafIndex: match.leaf_index,
          commitment: c,
        };
      }
    }
  }
  return null;
}

function StepIndicator({ current }: { current: number }) {
  const steps = ["Wallet", "GitHub", "Passion"];
  return (
    <ol className="flex items-center justify-center gap-3 mb-8">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                className={`w-8 h-8 flex items-center justify-center font-pixel text-xs border transition-colors ${
                  state === "done"
                    ? "bg-arcane text-void border-arcane"
                    : state === "active"
                      ? "border-arcane text-arcane"
                      : "border-panel-edge text-bone/30"
                }`}
              >
                {state === "done" ? "✓" : n}
              </span>
              <span
                className={`hidden sm:inline font-sans text-sm ${
                  state === "todo" ? "text-bone/30" : "text-bone/80"
                }`}
              >
                {label}
              </span>
            </span>
            {n < steps.length && (
              <span
                className={`w-8 h-px transition-colors duration-300 ${n < current ? "bg-arcane" : "bg-panel-edge"}`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function WeightGauge({
  label,
  weight,
  tone,
}: {
  label: string;
  weight: number;
  tone: "p1" | "p2";
}) {
  const toneClass = tone === "p1" ? "bg-p1" : "bg-p2";
  const textClass = tone === "p1" ? "text-p1" : "text-p2";
  return (
    <div className="flex items-center gap-2">
      <span className={`hud-label w-14 ${textClass}`}>{label}</span>
      <div className="flex gap-px" aria-label={`weight ${weight} of 3`}>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`w-3 h-3 ${n <= weight ? toneClass : "bg-panel-edge"}`}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] text-bone/40">×{weight}</span>
    </div>
  );
}

interface LiveWeights {
  war: string;
  sideA: string;
  sideB: string;
  weightA: number;
  weightB: number;
}

export function EnlistWizard() {
  const search = useSearchParams();
  const warSlug =
    search.get("war") && WAR_BY_SLUG[search.get("war")!]
      ? search.get("war")!
      : "tabs-vs-spaces";
  const warEntry = WAR_BY_SLUG[warSlug];

  const { publicKey } = useWallet();
  const [step, setStep] = useState(1);
  const [githubConnected, setGithubConnected] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveWeights, setLiveWeights] = useState<LiveWeights | null>(null);
  // MEDIUM-3: the war the user actually enrolled in (recovered from sessionStorage on the
  // OAuth callback), NOT the URL's warSlug (which resets to the default after the redirect).
  const [enrolledSlug, setEnrolledSlug] = useState<string>(warSlug);

  const canGoLive = VOTING_LIVE && !!GITHUB_CLIENT_ID;

  // ── OAuth callback: exchange code → enroll → save identity kit ──
  const handleCallback = useCallback(
    async (code: string, state: string) => {
      setBusy(true);
      setEnrollError(null);
      try {
        const expected = sessionStorage.getItem(OAUTH_STATE_KEY);
        if (!expected || expected !== state) {
          throw new Error("OAuth state mismatch — restart enlistment");
        }
        const warId = Number(sessionStorage.getItem(OAUTH_WAR_KEY));
        const slug = sessionStorage.getItem(OAUTH_SLUG_KEY) || warSlug;
        if (!Number.isInteger(warId)) throw new Error("missing war context");
        setEnrolledSlug(slug); // MEDIUM-3: display + CTA follow the war we actually enrolled in

        // MEDIUM-1: reuse persisted secrets if a prior attempt was interrupted (register may
        // have landed but the response was lost), else mint fresh — and persist BEFORE the
        // network call so a lost response can never orphan an on-chain enrollment.
        const pendingKey = `holywars_pending_${warId}`;
        let trapdoor: bigint, nullifierSeed: bigint;
        const pending = localStorage.getItem(pendingKey);
        if (pending) {
          const p = JSON.parse(pending) as { trapdoor: string; nullifierSeed: string };
          trapdoor = BigInt(p.trapdoor);
          nullifierSeed = BigInt(p.nullifierSeed);
        } else {
          ({ trapdoor, nullifierSeed } = generateSecrets());
          localStorage.setItem(
            pendingKey,
            JSON.stringify({
              trapdoor: trapdoor.toString(),
              nullifierSeed: nullifierSeed.toString(),
            }),
          );
        }
        const inner = await computeInner(nullifierSeed, trapdoor);

        const finalize = (
          weightA: number,
          weightB: number,
          leafIndex: number,
          commitment: string,
        ) => {
          const kit: IdentityKit = {
            warId,
            trapdoor: trapdoor.toString(),
            nullifierSeed: nullifierSeed.toString(),
            weightA,
            weightB,
            leafIndex,
            commitment,
          };
          saveKit(kit);
          localStorage.setItem(ENLISTED_KEY, "1");
          localStorage.removeItem(pendingKey);
          setLiveWeights({ war: slug, sideA: "SIDE A", sideB: "SIDE B", weightA, weightB });
          setGithubConnected(true);
          setStep(3);
        };

        const res = await fetch(API.enroll, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oauth_code: code,
            war_id: warId,
            inner: feToHex(inner),
          }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as {
            error?: string;
            reason?: string;
          };
          // MEDIUM-1 recovery: already enrolled (a prior attempt's register landed). Recover
          // the kit by brute-forcing the 9 weight pairs against the census leaves.
          if (res.status === 409) {
            const recovered = await recoverKit(warId, inner);
            if (recovered) {
              finalize(
                recovered.weightA,
                recovered.weightB,
                recovered.leafIndex,
                recovered.commitment,
              );
              return;
            }
          }
          throw new Error(b.reason || b.error || `enroll failed (${res.status})`);
        }
        const data = (await res.json()) as {
          leaf_index: number;
          commitment: string;
          weight_a: number;
          weight_b: number;
        };
        finalize(data.weight_a, data.weight_b, data.leaf_index, data.commitment);
      } catch (e) {
        setEnrollError(e instanceof Error ? e.message : "enrollment failed");
      } finally {
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        setBusy(false);
        // strip ?code&state from the URL so a refresh doesn't re-post a spent code
        window.history.replaceState({}, "", `/enlist?war=${warSlug}`);
      }
    },
    [warSlug],
  );

  useEffect(() => {
    const code = search.get("code");
    const state = search.get("state");
    if (canGoLive && code && state) {
      setStep(2);
      void handleCallback(code, state);
    }
  }, [search, canGoLive, handleCallback]);

  // ── start GitHub OAuth (live) ──
  const startOAuth = () => {
    if (!warEntry) return;
    const state =
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : String(Math.random()).slice(2);
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    sessionStorage.setItem(OAUTH_WAR_KEY, String(warEntry.warId));
    sessionStorage.setItem(OAUTH_SLUG_KEY, warSlug);
    const redirectUri = `${window.location.origin}/enlist?war=${warSlug}`;
    const url =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=read:user&state=${encodeURIComponent(state)}`;
    window.location.href = url;
  };

  // ── demo-mode advance (unchanged behavior) ──
  const advanceDemo = () => setStep((s) => Math.min(s + 1, 3));

  useEffect(() => {
    if (!canGoLive && step === 3) localStorage.setItem(ENLISTED_KEY, "1");
  }, [step, canGoLive]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <span className="hud-label">Enlistment office</span>
        <h2 className="font-sans font-bold text-3xl md:text-4xl tracking-tight mt-2 mb-2">
          Answer the call
        </h2>
        <p className="font-sans text-sm text-bone/60 max-w-lg">
          Three steps between you and the eternal census. Your GitHub gets you
          in; your commit history sets your weight; your secrets never leave
          this browser.
        </p>
        {canGoLive ? (
          <p className="font-mono text-xs text-arcane mt-3">
            ▮ LIVE — enlisting for{" "}
            <span className="text-bone">{warSlug}</span> on devnet
          </p>
        ) : (
          <p className="font-mono text-xs text-gold mt-3">
            ▮ DEMO MODE — enrollment not yet enabled here
          </p>
        )}
      </div>

      <StepIndicator current={step} />

      <div className="panel p-6 md:p-8">
        {step === 1 && (
          <div className="space-y-6 animate-rise">
            <div>
              <h3 className="font-sans font-bold text-xl mb-1">
                Connect your wallet
              </h3>
              <p className="font-sans text-sm text-bone/60">
                Optional — only used to receive your medal later. The ballot box
                never sees it, and you can skip and vote without one.
              </p>
            </div>

            {publicKey ? (
              <div className="space-y-3">
                <div className="panel-inset p-4 font-mono text-sm">
                  <p className="text-gold">✓ WALLET CONNECTED</p>
                  <p className="text-bone/50 mt-1 break-all">
                    {publicKey.toBase58()} · devnet
                  </p>
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="btn-primary w-full"
                >
                  Continue →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* real wallet-adapter connect (Phantom / Solflare via Wallet Standard) */}
                <div className="[&_.wallet-adapter-button]:!w-full [&_.wallet-adapter-button]:!justify-center">
                  <WalletMultiButton />
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="btn-ghost w-full"
                >
                  Skip — I&apos;ll add a wallet for the medal later →
                </button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-rise">
            <div>
              <h3 className="font-sans font-bold text-xl mb-1">
                Connect your GitHub
              </h3>
              <p className="font-sans text-sm text-bone/60">
                One aged, active GitHub account = one census entry per war. A
                thousand wallets won&apos;t get you a second ballot.
              </p>
            </div>

            {enrollError && (
              <p className="font-mono text-xs text-p1">{enrollError}</p>
            )}

            {canGoLive ? (
              <button
                onClick={startOAuth}
                disabled={busy}
                className="btn-primary w-full disabled:opacity-50"
              >
                {busy ? "Enlisting…" : "Authorize GitHub →"}
              </button>
            ) : githubConnected ? (
              <div className="space-y-3">
                <div className="panel-inset p-4 font-mono text-sm space-y-1">
                  <p className="text-gold">✓ GITHUB VERIFIED</p>
                  <p className="text-bone/50">user: {MOCK_GITHUB.username}</p>
                  <p className="text-bone/50">
                    account age: {MOCK_GITHUB.accountAge} · commits:{" "}
                    {MOCK_GITHUB.commits.toLocaleString("en-US")} · repos:{" "}
                    {MOCK_GITHUB.repos}
                  </p>
                </div>
                <button onClick={advanceDemo} className="btn-arcane w-full">
                  Measure my passion →
                </button>
              </div>
            ) : (
              <button
                onClick={() => setGithubConnected(true)}
                className="btn-primary w-full"
              >
                Authorize GitHub
              </button>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-rise">
            <div>
              <h3 className="font-sans font-bold text-xl mb-1">
                Your passion, weighed
              </h3>
              <p className="font-sans text-sm text-bone/60">
                The attestor read your repos. These are your ballot weights —
                per side, because what you vote is your secret.
              </p>
            </div>

            {canGoLive && liveWeights ? (
              <ul className="space-y-3">
                <li className="panel-inset p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-sans font-medium">
                      {liveWeights.war}
                    </span>
                    <span className="hud-label">weighed</span>
                  </div>
                  <div className="flex flex-wrap gap-x-8 gap-y-2">
                    <WeightGauge
                      label={liveWeights.sideA}
                      weight={liveWeights.weightA}
                      tone="p1"
                    />
                    <WeightGauge
                      label={liveWeights.sideB}
                      weight={liveWeights.weightB}
                      tone="p2"
                    />
                  </div>
                  <p className="font-mono text-[11px] text-bone/40">
                    signed by the attestor · your leaf is in the census tree
                  </p>
                </li>
              </ul>
            ) : (
              <ul className="space-y-3">
                {MOCK_WEIGHTS.map((w) => (
                  <li key={w.war} className="panel-inset p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-sans font-medium">{w.war}</span>
                      <span className="hud-label">weighed</span>
                    </div>
                    <div className="flex flex-wrap gap-x-8 gap-y-2">
                      <WeightGauge label={w.sideA} weight={w.weightA} tone="p1" />
                      <WeightGauge label={w.sideB} weight={w.weightB} tone="p2" />
                    </div>
                    <p className="font-mono text-[11px] text-bone/40">
                      evidence: {w.evidence}
                    </p>
                    {w.hypocrisy && (
                      <p className="font-mono text-[11px] text-gold border-t border-panel-edge pt-2">
                        ⚠ HYPOCRISY ADVISORY — {w.hypocrisy}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="border border-arcane/40 bg-arcane/10 p-5 text-center space-y-2 animate-stamp [animation-delay:180ms]">
              <p className="font-pixel text-sm text-arcane">YOU ARE CENSUSED</p>
              <p className="font-sans text-sm text-bone/70">
                The attestor signed your weights without ever learning your
                secrets — it cannot connect your future vote to your name.
              </p>
            </div>

            <Link
              href={canGoLive ? `/war/${enrolledSlug}` : "/"}
              className="btn-primary w-full text-center"
            >
              {canGoLive ? "Cast your vote →" : "Enter the War Room →"}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
