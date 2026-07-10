"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { WARS, BATTLE_CRIES, simulateTallyUpdate, type War, type BattleCry } from "@/lib/mock";
import { Battlefront, LivePixel } from "@/components/Battlefront";

function warNumber(war: War): string {
  return String(WARS.findIndex((w) => w.id === war.id) + 1).padStart(3, "0");
}

/* The flagship war IS the hero. The page opens on a live scoreboard,
   not on a slogan. */
function FlagshipWar({ war }: { war: War }) {
  return (
    <section className="panel p-6 md:p-10">
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div className="flex items-center gap-4">
          <span className="hud-label">War Nº {warNumber(war)}</span>
          <LivePixel />
        </div>
        <span className="font-mono text-xs text-bone/40">
          {(war.tallyA + war.tallyB).toLocaleString("en-US")} votes · anonymous
          · weighted
        </span>
      </div>

      <h2 className="font-sans font-bold text-3xl md:text-5xl tracking-tight mb-6 md:mb-8">
        {war.title}
      </h2>

      <Battlefront war={war} variant="hero" />

      <div className="mt-6 md:mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <p className="font-sans text-sm text-bone/60 max-w-md">
          Every ballot is a zero-knowledge proof, weighted by the voter&apos;s
          own commit history. Nobody — not even us — knows who pushed the line.
        </p>
        <Link href={`/war/${war.id}`} className="btn-primary shrink-0">
          Cast your vote →
        </Link>
      </div>
    </section>
  );
}

function WarCard({ war }: { war: War }) {
  return (
    <Link href={`/war/${war.id}`} className="block group">
      <div className="panel p-5 transition-colors duration-150 group-hover:border-bone/30 h-full">
        <div className="flex items-center justify-between mb-4">
          <span className="hud-label">War Nº {warNumber(war)}</span>
          <LivePixel />
        </div>
        <h3 className="font-sans font-bold text-xl tracking-tight mb-4 group-hover:text-arcane transition-colors">
          {war.title}
        </h3>
        <Battlefront war={war} variant="card" />
        <div className="mt-4 font-mono text-xs text-bone/40 group-hover:text-bone/70 transition-colors">
          Enter the war →
        </div>
      </div>
    </Link>
  );
}

function FieldComms({ cries }: { cries: BattleCry[] }) {
  return (
    <section className="panel crt overflow-hidden">
      <div className="border-b border-panel-edge px-4 py-2.5 flex items-center justify-between">
        <LivePixel label="FIELD COMMS" />
        <span className="font-mono text-[11px] text-bone/30">
          anonymous battle cries · 140 bytes max
        </span>
      </div>
      <ul className="p-4 space-y-2 h-44 overflow-y-auto console-scroll">
        {cries.map((cry) => (
          <li
            key={cry.id}
            className="flex items-baseline gap-2.5 font-mono text-[13px] animate-feed-in"
          >
            <span
              className={`shrink-0 px-1.5 font-pixel text-[9px] leading-4 ${
                cry.side === "a" ? "chip-p1" : "chip-p2"
              }`}
            >
              {cry.side === "a" ? "P1" : "P2"}
            </span>
            <span className="text-bone/35 shrink-0">{cry.author}</span>
            <span className="text-bone/80">{cry.text}</span>
          </li>
        ))}
      </ul>
    </section>
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
          text: BATTLE_CRIES[Math.floor(Math.random() * BATTLE_CRIES.length)]
            .text,
          side: Math.random() > 0.5 ? "a" : "b",
          timestamp: Date.now(),
        };
        return [newCry, ...prev.slice(0, 9)];
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [wars]);

  const [flagship, ...rest] = wars;

  return (
    <div className="space-y-6">
      <FlagshipWar war={flagship} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rest.map((war) => (
          <WarCard key={war.id} war={war} />
        ))}
      </div>

      <FieldComms cries={cries} />
    </div>
  );
}
