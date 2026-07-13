"use client";

import type { War } from "@/lib/mock";

/* ── The signature element ──────────────────────────────────────────────
   The tally is a battlefront: a strip of discrete pixel blocks. Each side
   holds solid territory; where they meet, the ground is contested — drawn
   with dither checkers, the pixel-art way of saying "uncertain". A bone
   cursor blinks at the exact front line. When a block changes hands it
   flickers, like a captured tile in an old strategy game. */

const BLOCKS = 36;

type BlockState = "p1" | "p2" | "c1" | "c2" | "c3";

function blockStates(pctA: number): BlockState[] {
  const exact = (pctA / 100) * BLOCKS;
  const frontier = Math.round(exact);
  return Array.from({ length: BLOCKS }, (_, i) => {
    if (i < frontier - 2) return "p1";
    if (i === frontier - 2) return "c1";
    if (i === frontier - 1) return "c2";
    if (i === frontier) return "c3";
    return "p2";
  });
}

const BLOCK_CLASS: Record<BlockState, string> = {
  p1: "bg-p1",
  p2: "bg-p2",
  c1: "dither-25",
  c2: "dither-50",
  c3: "dither-75",
};

export function PixelDigits({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      key={value}
      className={`inline-block font-pixel tabular-nums animate-tick-up ${className}`}
    >
      {value.toLocaleString("en-US")}
    </span>
  );
}

export function Battlefront({
  war,
  variant = "card",
}: {
  war: War;
  variant?: "hero" | "card";
}) {
  const total = war.tallyA + war.tallyB;
  const pctA = total > 0 ? (war.tallyA / total) * 100 : 50;
  const states = blockStates(pctA);
  const barHeight = variant === "hero" ? "h-8 md:h-10" : "h-5";

  return (
    <div>
      {variant === "hero" && (
        <div className="flex items-end justify-between mb-3">
          <div>
            <span className="hud-label text-p1">{war.sideA}</span>
            <div className="mt-1">
              <PixelDigits
                value={war.tallyA}
                className="text-p1 text-3xl md:text-5xl"
              />
            </div>
          </div>
          <span className="font-pixel text-bone/25 text-sm md:text-lg pb-1.5">
            VS
          </span>
          <div className="text-right">
            <span className="hud-label text-p2">{war.sideB}</span>
            <div className="mt-1">
              <PixelDigits
                value={war.tallyB}
                className="text-p2 text-3xl md:text-5xl"
              />
            </div>
          </div>
        </div>
      )}

      <div
        className={`relative flex gap-px ${barHeight} bg-void border border-panel-edge p-px`}
        role="img"
        aria-label={`${war.sideA} ${war.tallyA} votes versus ${war.sideB} ${war.tallyB} votes`}
      >
        {states.map((s, i) => (
          <div
            key={`${i}-${s}`}
            className={`flex-1 animate-capture ${BLOCK_CLASS[s]}`}
          />
        ))}
        {/* Full-width rail moved with translateX(%) so the cursor marches
            (GPU transform) instead of teleporting when the tally shifts. */}
        <div
          className="absolute inset-0 pointer-events-none transition-transform duration-500 ease-in-out-strong"
          style={{ transform: `translateX(${pctA}%)` }}
          aria-hidden
        >
          <div className="absolute top-0 bottom-0 -left-0.5 w-1 bg-bone animate-cursor-blink" />
        </div>
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="font-mono text-[11px] text-p1/80">
          {pctA.toFixed(1)}%
        </span>
        {variant === "card" && (
          <span className="font-mono text-[11px] text-bone/40">
            {war.sideA} {war.tallyA.toLocaleString("en-US")} ·{" "}
            {war.tallyB.toLocaleString("en-US")} {war.sideB}
          </span>
        )}
        <span className="font-mono text-[11px] text-p2/80">
          {(100 - pctA).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/* Live indicator: a blinking pixel, not a pulsing dot */
export function LivePixel({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 bg-p1 animate-live-blink" aria-hidden />
      <span className="hud-label text-bone/70">{label}</span>
    </span>
  );
}
