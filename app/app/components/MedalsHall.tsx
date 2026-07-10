"use client";

import { MEDALS, type Medal } from "@/lib/mock";

const RARITY_COLORS: Record<Medal["rarity"], string> = {
  common: "border-cream/30 text-cream/60",
  rare: "border-blue-400/50 text-blue-400",
  epic: "border-purple-400/50 text-purple-400",
  legendary: "border-war-gold/50 text-war-gold",
};

const RARITY_LABELS: Record<Medal["rarity"], string> = {
  common: "COMMON",
  rare: "RARE",
  epic: "EPIC",
  legendary: "LEGENDARY",
};

function MedalCard({ medal }: { medal: Medal }) {
  return (
    <div
      className={`medal-card ${medal.claimed ? "medal-claimed" : ""}`}
    >
      <div className="text-4xl mb-3">
        {medal.rarity === "legendary" ? "🏆" : medal.rarity === "epic" ? "🎖" : medal.rarity === "rare" ? "⭐" : "🔰"}
      </div>
      <h3 className="font-stencil text-sm tracking-wider text-cream mb-1">
        {medal.name.toUpperCase()}
      </h3>
      <p className="font-mono text-xs text-cream/50 mb-3">
        {medal.description}
      </p>
      <div className="flex items-center justify-between">
        <span
          className={`font-mono text-[10px] tracking-widest ${RARITY_COLORS[medal.rarity]}`}
        >
          {RARITY_LABELS[medal.rarity]}
        </span>
        {medal.claimed ? (
          <span className="font-mono text-[10px] text-war-green">
            ✓ CLAIMED
          </span>
        ) : (
          <button className="font-mono text-[10px] text-war-red hover:text-war-red-dark transition-colors tracking-wider">
            CLAIM →
          </button>
        )}
      </div>
    </div>
  );
}

export function MedalsHall() {
  return (
    <div>
      <div className="text-center space-y-3 mb-8">
        <div className="stamp inline-block">YOUR SCARS</div>
        <h2 className="propaganda-title text-3xl md:text-4xl">
          HALL OF MEDALS
        </h2>
        <p className="terminal-text max-w-lg mx-auto">
          Compressed NFTs forged in the fires of battle. Each medal proves you
          fought — not which side you chose.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MEDALS.map((medal) => (
          <MedalCard key={medal.id} medal={medal} />
        ))}
      </div>

      <div className="mt-8 border border-cream/10 p-4">
        <p className="font-mono text-xs text-cream/40">
          <span className="text-war-red">⚠</span> MOCK MODE — Medals shown are
          placeholders. In production, these are cNFTs minted via the Bubblegum
          standard on Solana, stored with state compression for minimal cost.
        </p>
      </div>
    </div>
  );
}
