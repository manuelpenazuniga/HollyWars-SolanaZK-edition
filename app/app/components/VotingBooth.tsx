"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { getWarById } from "@/lib/mock";

const FORGE_MESSAGES = [
  "forjando tu voto en conocimiento-cero…",
  "generando prueba Groth16…",
  "ocultando tu identidad en el circuito…",
  "sellando tu papeleta anónima…",
  "enviando al relayer…",
];

export function VotingBooth() {
  const params = useParams();
  const warId = params.id as string;
  const war = getWarById(warId);

  const [selectedSide, setSelectedSide] = useState<"a" | "b" | null>(null);
  const [battleCry, setBattleCry] = useState("");
  const [isForging, setIsForging] = useState(false);
  const [forgeMessage, setForgeMessage] = useState("");
  const [voteComplete, setVoteComplete] = useState(false);

  if (!war) {
    return (
      <div className="text-center space-y-4">
        <h2 className="propaganda-title text-3xl">WAR NOT FOUND</h2>
        <p className="terminal-text">This battlefield does not exist.</p>
      </div>
    );
  }

  const handleForge = () => {
    if (!selectedSide) return;
    setIsForging(true);
    setVoteComplete(false);

    let idx = 0;
    setForgeMessage(FORGE_MESSAGES[0]);
    const interval = setInterval(() => {
      idx++;
      if (idx < FORGE_MESSAGES.length) {
        setForgeMessage(FORGE_MESSAGES[idx]);
      } else {
        clearInterval(interval);
        setIsForging(false);
        setVoteComplete(true);
      }
    }, 1200);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center space-y-3 mb-8">
        <span className="text-5xl">{war.emoji}</span>
        <h2 className="propaganda-title text-3xl md:text-4xl">
          {war.title.toUpperCase()}
        </h2>
        <p className="terminal-text">
          Choose your side. Shout your cry. Forge your vote.
        </p>
      </div>

      <div className="war-card p-8 space-y-6">
        <div>
          <h3 className="font-stencil text-sm tracking-widest text-cream/70 mb-4">
            CHOOSE YOUR BANNER
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setSelectedSide("a")}
              className={`border-2 p-6 text-center transition-all duration-200 ${
                selectedSide === "a"
                  ? "border-war-red bg-war-red/20 scale-105"
                  : "border-cream/20 hover:border-cream/40"
              }`}
            >
              <span className="font-stencil text-xl tracking-wider text-cream">
                {war.sideA}
              </span>
              {selectedSide === "a" && (
                <p className="text-war-red text-xs mt-2 font-mono">
                  ✓ SELECTED
                </p>
              )}
            </button>
            <button
              onClick={() => setSelectedSide("b")}
              className={`border-2 p-6 text-center transition-all duration-200 ${
                selectedSide === "b"
                  ? "border-war-green bg-war-green/20 scale-105"
                  : "border-cream/20 hover:border-cream/40"
              }`}
            >
              <span className="font-stencil text-xl tracking-wider text-cream">
                {war.sideB}
              </span>
              {selectedSide === "b" && (
                <p className="text-war-green text-xs mt-2 font-mono">
                  ✓ SELECTED
                </p>
              )}
            </button>
          </div>
        </div>

        <div>
          <h3 className="font-stencil text-sm tracking-widest text-cream/70 mb-2">
            BATTLE CRY (≤140 chars)
          </h3>
          <textarea
            value={battleCry}
            onChange={(e) => setBattleCry(e.target.value.slice(0, 140))}
            placeholder="SHOUT INTO THE VOID..."
            rows={3}
            className="input-war resize-none"
            disabled={isForging}
          />
          <p className="font-mono text-xs text-cream/40 mt-1 text-right">
            {battleCry.length}/140
          </p>
        </div>

        {voteComplete && (
          <div className="border-2 border-war-gold/50 bg-war-gold/10 p-4 text-center">
            <p className="font-stencil text-sm tracking-wider text-war-gold">
              ⚔ YOUR VOTE HAS BEEN FORGED ⚔
            </p>
            <p className="font-mono text-xs text-cream/50 mt-1">
              Anonymous. Immutable. Eternal.
            </p>
          </div>
        )}

        {isForging && (
          <div className="border-2 border-war-red/50 bg-war-red/10 p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 border-4 border-war-red/30 border-t-war-red rounded-full animate-forge-spin" />
            </div>
            <p className="font-mono text-sm text-war-red animate-pulse">
              {forgeMessage}
            </p>
          </div>
        )}

        {!isForging && !voteComplete && (
          <button
            onClick={handleForge}
            disabled={!selectedSide}
            className={`btn-primary w-full ${
              !selectedSide ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            ⚔ FORGE VOTE ⚔
          </button>
        )}

        {voteComplete && (
          <button
            onClick={() => {
              setSelectedSide(null);
              setBattleCry("");
              setVoteComplete(false);
            }}
            className="btn-secondary w-full"
          >
            CAST ANOTHER VOTE
          </button>
        )}
      </div>

      <div className="mt-6 border border-cream/10 p-4">
        <p className="font-mono text-xs text-cream/40">
          <span className="text-war-red">⚠</span> MOCK MODE — No real proof is
          being generated. In production, this button triggers a Groth16 proof
          via snarkjs, submitted through a relayer to protect your anonymity.
        </p>
      </div>
    </div>
  );
}
