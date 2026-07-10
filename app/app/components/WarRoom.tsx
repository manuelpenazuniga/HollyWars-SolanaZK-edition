"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { WARS, BATTLE_CRIES, simulateTallyUpdate, type War, type BattleCry } from "@/lib/mock";

function TallyBar({ war }: { war: War }) {
  const total = war.tallyA + war.tallyB;
  const pctA = total > 0 ? (war.tallyA / total) * 100 : 50;
  const pctB = 100 - pctA;

  return (
    <div className="relative w-full h-8 rounded-sm overflow-hidden bg-war-black border border-cream/20">
      <div
        className="tally-bar side-a-bg absolute left-0 top-0 bottom-0"
        style={{ width: `${pctA}%` }}
      />
      <div
        className="tally-bar side-b-bg absolute right-0 top-0 bottom-0"
        style={{ width: `${pctB}%` }}
      />
      <div
        className="frontier-line"
        style={{ left: `${pctA}%` }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-3 z-20">
        <span className="font-mono text-xs font-bold text-cream drop-shadow-lg">
          {war.sideA} {war.tallyA}
        </span>
        <span className="font-mono text-xs font-bold text-cream drop-shadow-lg">
          {war.tallyB} {war.sideB}
        </span>
      </div>
    </div>
  );
}

function WarCard({ war }: { war: War }) {
  return (
    <Link href={`/war/${war.id}`} className="block group">
      <div className="war-card p-6 transition-all duration-300 hover:border-war-red/60 hover:shadow-lg hover:shadow-war-red/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{war.emoji}</span>
            <div>
              <h3 className="font-stencil text-lg tracking-wider text-cream group-hover:text-war-red transition-colors">
                {war.title.toUpperCase()}
              </h3>
              <span className="font-mono text-[10px] text-war-red tracking-widest uppercase">
                ● ACTIVE — VOTING OPEN
              </span>
            </div>
          </div>
          <span className="font-mono text-xs text-cream/40">
            {war.tallyA + war.tallyB} votes
          </span>
        </div>

        <TallyBar war={war} />

        <div className="flex items-center justify-between mt-3">
          <span className="font-mono text-xs text-cream/50">
            {((war.tallyA / (war.tallyA + war.tallyB)) * 100).toFixed(1)}%
          </span>
          <span className="font-mono text-xs text-cream/50">
            {((war.tallyB / (war.tallyA + war.tallyB)) * 100).toFixed(1)}%
          </span>
        </div>

        <div className="mt-4 text-center">
          <span className="font-stencil text-xs tracking-wider text-cream/40 group-hover:text-war-red transition-colors">
            ENTER THE TRENCHES →
          </span>
        </div>
      </div>
    </Link>
  );
}

function BattleCryTicker({ cries }: { cries: BattleCry[] }) {
  return (
    <div className="border-2 border-cream/20 bg-war-black/80 overflow-hidden">
      <div className="border-b border-cream/20 px-4 py-2 flex items-center gap-2">
        <span className="text-war-red text-glow">●</span>
        <span className="font-stencil text-xs tracking-widest text-cream/70">
          BATTLE CRIES — LIVE FEED
        </span>
      </div>
      <div className="overflow-hidden relative h-40">
        <div className="absolute inset-0 flex flex-col gap-1 p-3 overflow-y-auto">
          {cries.map((cry) => (
            <div
              key={cry.id}
              className="flex items-start gap-2 text-sm font-mono animate-pulse-slow"
            >
              <span
                className={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold ${
                  cry.side === "a"
                    ? "bg-war-red/20 text-war-red"
                    : "bg-war-green/20 text-war-green"
                }`}
              >
                {cry.side === "a" ? "A" : "B"}
              </span>
              <span className="text-cream/50 shrink-0">{cry.author}:</span>
              <span className="text-cream/80">{cry.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WarRoom() {
  const [wars, setWars] = useState<War[]>(WARS);
  const [cries, setCries] = useState<BattleCry[]>(BATTLE_CRIES);

  useEffect(() => {
    const interval = setInterval(() => {
      setWars((prev) => prev.map(simulateTallyUpdate));
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCries((prev) => {
        const newCry: BattleCry = {
          id: `cry-${Date.now()}`,
          warId: wars[Math.floor(Math.random() * wars.length)].id,
          author: `anon_${Math.random().toString(36).slice(2, 8)}`,
          text: BATTLE_CRIES[Math.floor(Math.random() * BATTLE_CRIES.length)].text,
          side: Math.random() > 0.5 ? "a" : "b",
          timestamp: Date.now(),
        };
        return [newCry, ...prev.slice(0, 9)];
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [wars]);

  return (
    <div className="space-y-8">
      <div className="text-center space-y-3">
        <div className="stamp inline-block mb-2">YOUR CODEBASE NEEDS YOU</div>
        <h2 className="propaganda-title text-3xl md:text-5xl">
          THE WAR ROOM
        </h2>
        <p className="terminal-text max-w-xl mx-auto">
          Three wars rage eternal. The scoreboard never forgets.
          Choose your side. Cast your vote. Claim your scar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {wars.map((war) => (
          <WarCard key={war.id} war={war} />
        ))}
      </div>

      <BattleCryTicker cries={cries} />
    </div>
  );
}
