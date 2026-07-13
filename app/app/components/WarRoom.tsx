"use client";

import Link from "next/link";
import { useLiveWars } from "@/hooks/useLiveWars";
import { WARS, BATTLE_CRIES, type War, type BattleCry } from "@/lib/mock";
import { Battlefront, LivePixel } from "@/components/Battlefront";

function warNumber(war: War, allWars: War[]): string {
  return String(allWars.findIndex((w) => w.id === war.id) + 1).padStart(3, "0");
}

// Always-on data-origin indicator so live devnet reads are never confused with the
// mock sample shown on RPC failure (AUD-11).
function DataOriginBadge({
  healthy,
  loading,
}: {
  healthy: boolean;
  loading: boolean;
}) {
  if (loading && !healthy) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-bone/25 bg-bone/5">
        <span className="w-1.5 h-1.5 bg-bone/40 animate-live-blink" aria-hidden />
        <span className="hud-label text-bone/50">CONNECTING · devnet</span>
      </span>
    );
  }
  if (healthy) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-arcane/40 bg-arcane/10">
        <span className="w-1.5 h-1.5 bg-arcane animate-live-blink" aria-hidden />
        <span className="hud-label text-arcane">LIVE · reading devnet</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-gold/50 bg-gold/10">
      <span className="w-1.5 h-1.5 bg-gold" aria-hidden />
      <span className="hud-label text-gold">
        DEMO DATA · devnet unreachable — sample tallies
      </span>
    </span>
  );
}

function FlagshipWar({
  war,
  allWars,
}: {
  war: War;
  allWars: War[];
}) {
  return (
    <section className="panel p-6 md:p-10">
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div className="flex items-center gap-4">
          <span className="hud-label">
            War Nº {warNumber(war, allWars)}
          </span>
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

function WarCard({
  war,
  allWars,
}: {
  war: War;
  allWars: War[];
}) {
  return (
    <Link href={`/war/${war.id}`} className="block group">
      <div className="panel p-5 transition-[border-color,transform] duration-150 ease-out-strong group-hover:border-bone/30 group-hover:-translate-y-0.5 group-active:translate-y-0 h-full">
        <div className="flex items-center justify-between mb-4">
          <span className="hud-label">
            War Nº {warNumber(war, allWars)}
          </span>
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
        {cries.map((cry, i) => (
          <li
            key={cry.id}
            className="flex items-baseline gap-2.5 font-mono text-[13px] animate-feed-in"
            style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
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
  const { wars, healthy, loading, cries } = useLiveWars();

  const displayWars = wars.length > 0 ? wars : WARS;
  const displayCries = cries.length > 0 ? cries : BATTLE_CRIES;
  const [flagship, ...rest] = displayWars;

  return (
    <div className="space-y-6 stagger">
      <div className="flex items-center gap-3">
        <DataOriginBadge healthy={healthy} loading={loading} />
      </div>

      <FlagshipWar war={flagship} allWars={displayWars} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rest.map((war) => (
          <WarCard key={war.id} war={war} allWars={displayWars} />
        ))}
      </div>

      <FieldComms cries={displayCries} />
    </div>
  );
}
