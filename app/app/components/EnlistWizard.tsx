"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/* Mock enlistment flag. In production this isn't app state — it's whether
   you hold the secrets (seed/trapdoor) of a leaf in the census tree. */
export const ENLISTED_KEY = "holywars_enlisted";

const MOCK_GITHUB = {
  username: "dev_soldier_42",
  accountAge: "3.2 years",
  commits: 1847,
  repos: 23,
};

/* The Proof of Passion reveal — the attestor has read your repos and
   weighed your soul. Weights are per side (you might vote either way),
   coarse on purpose: a fine-grained weight is a fingerprint. */
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

function StepIndicator({ current }: { current: number }) {
  const steps = ["Wallet", "GitHub", "Passion"];
  return (
    <ol className="flex items-center justify-center gap-3 mb-8">
      {steps.map((label, i) => {
        const n = i + 1;
        const state =
          n < current ? "done" : n === current ? "active" : "todo";
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
                className={`w-8 h-px ${n < current ? "bg-arcane" : "bg-panel-edge"}`}
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

export function EnlistWizard() {
  const [step, setStep] = useState(1);
  const [walletConnected, setWalletConnected] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);

  const advance = () => setStep((s) => Math.min(s + 1, 3));

  useEffect(() => {
    if (step === 3) localStorage.setItem(ENLISTED_KEY, "1");
  }, [step]);

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
      </div>

      <StepIndicator current={step} />

      <div className="panel p-6 md:p-8">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="font-sans font-bold text-xl mb-1">
                Connect your wallet
              </h3>
              <p className="font-sans text-sm text-bone/60">
                Only used to receive your medal later — the ballot box will
                never see it.
              </p>
            </div>

            {walletConnected ? (
              <div className="space-y-3">
                <div className="panel-inset p-4 font-mono text-sm">
                  <p className="text-gold">✓ WALLET CONNECTED</p>
                  <p className="text-bone/50 mt-1">7xKp…3VmN · devnet</p>
                </div>
                <button onClick={advance} className="btn-primary w-full">
                  Continue →
                </button>
              </div>
            ) : (
              <button
                onClick={() => setWalletConnected(true)}
                className="btn-primary w-full"
              >
                Connect wallet
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="font-sans font-bold text-xl mb-1">
                Connect your GitHub
              </h3>
              <p className="font-sans text-sm text-bone/60">
                One aged, active GitHub account = one census entry per war.
                A thousand wallets won&apos;t get you a second ballot.
              </p>
            </div>

            {githubConnected ? (
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
                <button onClick={advance} className="btn-arcane w-full">
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
          <div className="space-y-6">
            <div>
              <h3 className="font-sans font-bold text-xl mb-1">
                Your passion, weighed
              </h3>
              <p className="font-sans text-sm text-bone/60">
                The attestor read your repos. These are your ballot weights —
                per side, because what you vote is your secret.
              </p>
            </div>

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

            <div className="border border-arcane/40 bg-arcane/10 p-5 text-center space-y-2">
              <p className="font-pixel text-sm text-arcane">YOU ARE CENSUSED</p>
              <p className="font-sans text-sm text-bone/70">
                The attestor signed your weights without ever learning your
                secrets — it cannot connect your future vote to your name.
              </p>
            </div>

            <Link href="/" className="btn-primary w-full text-center">
              Enter the War Room →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
