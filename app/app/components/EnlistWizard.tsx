"use client";

import { useState } from "react";

const STEPS = [
  {
    id: 1,
    title: "CONNECT YOUR WALLET",
    subtitle: "Your identity on the chain. Your soul on the line.",
    icon: "🔗",
  },
  {
    id: 2,
    title: "CONNECT YOUR GITHUB",
    subtitle: "We need to measure your passion. Your commit history speaks.",
    icon: "🐙",
  },
  {
    id: 3,
    title: "YOUR PASSION WEIGHT",
    subtitle: "The attester has weighed your soul. This is your burden.",
    icon: "⚖",
  },
];

const MOCK_GITHUB = {
  username: "dev_soldier_42",
  accountAge: "3.2 years",
  commits: 1847,
  repos: 23,
};

const MOCK_WEIGHTS = [
  { war: "Tabs vs Spaces", weightA: 2, weightB: 3, coherent: "spaces" },
  { war: "Vim vs Emacs", weightA: 1, weightB: 2, coherent: "emacs" },
  { war: "Dark vs Light", weightA: 3, weightB: 1, coherent: "dark" },
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center">
          <div
            className={`w-10 h-10 border-2 flex items-center justify-center font-stencil text-sm transition-all duration-300 ${
              i + 1 <= current
                ? "border-war-red bg-war-red/20 text-war-red"
                : "border-cream/30 text-cream/30"
            }`}
          >
            {i + 1 <= current ? "✓" : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`w-12 h-0.5 transition-colors duration-300 ${
                i + 1 < current ? "bg-war-red" : "bg-cream/20"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function EnlistWizard() {
  const [step, setStep] = useState(1);
  const [walletConnected, setWalletConnected] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);

  const handleNext = () => {
    if (step === 1) setWalletConnected(true);
    if (step === 2) setGithubConnected(true);
    if (step < 3) setStep(step + 1);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center space-y-3 mb-8">
        <div className="stamp inline-block">ENLIST NOW</div>
        <h2 className="propaganda-title text-3xl md:text-4xl">
          ANSWER THE CALL
        </h2>
        <p className="terminal-text">
          Three steps between you and eternity. No turning back.
        </p>
      </div>

      <StepIndicator current={step} total={STEPS.length} />

      <div className="war-card p-8">
        {step === 1 && (
          <div className="text-center space-y-6">
            <span className="text-5xl">{STEPS[0].icon}</span>
            <div>
              <h3 className="font-stencil text-xl tracking-wider text-cream mb-2">
                {STEPS[0].title}
              </h3>
              <p className="terminal-text text-sm">{STEPS[0].subtitle}</p>
            </div>

            {walletConnected ? (
              <div className="space-y-3">
                <div className="border-2 border-war-green/50 bg-war-green/10 p-4 font-mono text-sm">
                  <p className="text-war-green">✓ WALLET CONNECTED</p>
                  <p className="text-cream/60 mt-1">
                    Address: 7xKp...3VmN (devnet)
                  </p>
                </div>
                <button onClick={handleNext} className="btn-primary w-full">
                  PROCEED →
                </button>
              </div>
            ) : (
              <button onClick={handleNext} className="btn-primary w-full">
                CONNECT WALLET
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="text-center space-y-6">
            <span className="text-5xl">{STEPS[1].icon}</span>
            <div>
              <h3 className="font-stencil text-xl tracking-wider text-cream mb-2">
                {STEPS[1].title}
              </h3>
              <p className="terminal-text text-sm">{STEPS[1].subtitle}</p>
            </div>

            {githubConnected ? (
              <div className="space-y-3">
                <div className="border-2 border-war-green/50 bg-war-green/10 p-4 font-mono text-sm text-left">
                  <p className="text-war-green">✓ GITHUB VERIFIED</p>
                  <div className="mt-2 space-y-1 text-cream/60">
                    <p>User: {MOCK_GITHUB.username}</p>
                    <p>Account age: {MOCK_GITHUB.accountAge}</p>
                    <p>Total commits: {MOCK_GITHUB.commits}</p>
                    <p>Public repos: {MOCK_GITHUB.repos}</p>
                  </div>
                </div>
                <button onClick={handleNext} className="btn-primary w-full">
                  CALCULATE PASSION →
                </button>
              </div>
            ) : (
              <button onClick={handleNext} className="btn-primary w-full">
                CONNECT GITHUB
              </button>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="text-center space-y-6">
            <span className="text-5xl">{STEPS[2].icon}</span>
            <div>
              <h3 className="font-stencil text-xl tracking-wider text-cream mb-2">
                {STEPS[2].title}
              </h3>
              <p className="terminal-text text-sm">{STEPS[2].subtitle}</p>
            </div>

            <div className="space-y-3 text-left">
              {MOCK_WEIGHTS.map((w) => (
                <div
                  key={w.war}
                  className="border border-cream/20 p-3 flex items-center justify-between"
                >
                  <span className="font-mono text-sm text-cream/80">
                    {w.war}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-cream/50">
                      A:{w.weightA} / B:{w.weightB}
                    </span>
                    <span className="font-mono text-xs text-war-green">
                      {w.coherent}-coherent ✓
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-2 border-war-gold/50 bg-war-gold/10 p-4">
              <p className="font-stencil text-sm tracking-wider text-war-gold">
                YOU ARE CENSUSED. YOU ARE READY.
              </p>
              <p className="font-mono text-xs text-cream/50 mt-1">
                Your entries are recorded. Your anonymity is guaranteed.
              </p>
            </div>

            <button className="btn-primary w-full" onClick={() => setStep(1)}>
              RETURN TO WAR ROOM
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
