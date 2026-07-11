// In-memory TTL cache for PassionScorer results.
//
// INVARIANTS (from INV-1 / INV-14 / brief):
// - Lives in process memory only. NEVER written to disk, logs, or network.
// - Keyed by github_id (string) per the brief. Per-war sub-keyed inside.
// - TTL 24h; entries auto-expire on read (and a sweeper drops them).
// - The cached value is the *final* (weight_a, weight_b) tuple — the only
//   identity-derived data the attestor is allowed to hold. The intermediate
//   (repo list, file contents, raw affinity) is recomputed on miss and
//   discarded as soon as the tier() reduction is done.

import type { CachedScore, PassionScore, Weight } from "./types.js";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface Entry {
  ts: number;
  scores: Map<number, CachedScore>;
}

export class PassionCache {
  private readonly store: Map<string, Entry> = new Map();
  private readonly now: () => number;

  constructor(opts?: { now?: () => number }) {
    this.now = opts?.now ?? (() => Date.now());
  }

  get(githubId: string, warId: number): PassionScore | null {
    const entry = this.store.get(githubId);
    if (!entry) return null;
    if (this.now() - entry.ts > TTL_MS) {
      this.store.delete(githubId);
      return null;
    }
    const hit = entry.scores.get(warId);
    if (!hit) return null;
    if (this.now() - hit.ts > TTL_MS) {
      entry.scores.delete(warId);
      return null;
    }
    return { weight_a: hit.weight_a, weight_b: hit.weight_b };
  }

  set(githubId: string, warId: number, score: PassionScore): void {
    let entry = this.store.get(githubId);
    if (!entry || this.now() - entry.ts > TTL_MS) {
      entry = { ts: this.now(), scores: new Map() };
      this.store.set(githubId, entry);
    }
    entry.scores.set(warId, {
      ts: this.now(),
      weight_a: score.weight_a,
      weight_b: score.weight_b,
    });
  }

  // Test-only: peek at internal state. Not part of the public surface.
  _size(): number {
    return this.store.size;
  }

  // Test-only: clear all entries.
  _clear(): void {
    this.store.clear();
  }
}

// Re-export for ergonomics
export type { Weight };
