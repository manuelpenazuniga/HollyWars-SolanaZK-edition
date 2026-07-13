import type { CachedScore, PassionScore, Weight } from "./types";

const TTL_MS = 24 * 60 * 60 * 1000;

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

  _size(): number {
    return this.store.size;
  }

  _clear(): void {
    this.store.clear();
  }
}

export type { Weight };
