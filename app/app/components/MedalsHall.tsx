"use client";

import { MEDALS, type Medal } from "@/lib/mock";
import { PixelMedal, type SpriteName } from "@/components/PixelMedal";

const MEDAL_SPRITES: Record<string, SpriteName> = {
  "medal-tabs-veteran": "shield",
  "medal-vim-legend": "sword",
  "medal-dark-champion": "moon",
  "medal-enlisted": "medal",
  "medal-first-blood": "bolt",
  "medal-anonymous": "ghost",
};

const RARITY_TEXT: Record<Medal["rarity"], string> = {
  common: "text-bone/50",
  rare: "text-p2",
  epic: "text-arcane",
  legendary: "text-gold",
};

function MedalCard({ medal }: { medal: Medal }) {
  const sprite = MEDAL_SPRITES[medal.id] ?? "medal";
  return (
    <li
      className={`group panel p-5 flex flex-col items-center text-center transition-colors ${
        medal.claimed ? "border-gold/40" : "hover:border-bone/30"
      }`}
    >
      <PixelMedal
        sprite={sprite}
        rarity={medal.rarity}
        size={72}
        className={`transition-transform duration-200 ease-out-strong group-hover:scale-110 ${
          medal.claimed ? "" : "opacity-60"
        }`}
      />
      <h3 className="font-sans font-bold mt-4 mb-1">{medal.name}</h3>
      <p className="font-sans text-sm text-bone/50 mb-4 flex-1">
        {medal.description}
      </p>
      <div className="w-full flex items-center justify-between">
        <span
          className={`font-pixel text-[9px] uppercase tracking-widest ${RARITY_TEXT[medal.rarity]}`}
        >
          {medal.rarity}
        </span>
        {medal.claimed ? (
          <span className="font-mono text-[11px] text-gold">✓ CLAIMED</span>
        ) : (
          <span className="font-mono text-[11px] text-bone/30">
            PRÓXIMAMENTE
          </span>
        )}
      </div>
    </li>
  );
}

export function MedalsHall() {
  return (
    <div>
      <div className="mb-8">
        <span className="hud-label">Hall of medals</span>
        <h2 className="font-sans font-bold text-3xl md:text-4xl tracking-tight mt-2 mb-2">
          Scars are proof you fought
        </h2>
        <p className="font-sans text-sm text-bone/60 max-w-lg">
          Compressed NFTs, one per war. A medal proves you were censused as a
          combatant — never which side you chose, and not even whether you
          fired a shot. That&apos;s the second nullifier at work.
        </p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {MEDALS.map((medal) => (
          <MedalCard key={medal.id} medal={medal} />
        ))}
      </ul>

      <p className="font-mono text-xs text-bone/35 panel-inset p-4 mt-6">
        <span className="text-gold">▮</span> PRÓXIMAMENTE — cNFT minting via
        Bubblegum with state compression is not yet wired. These placeholders
        will become claimable on-chain medals (~0.00001 SOL each).
      </p>
    </div>
  );
}
