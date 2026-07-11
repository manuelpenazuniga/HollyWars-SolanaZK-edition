// Proof of Passion — public surface consumed by the attestor (T7b).
// Wires the GitHub client + repo sampler + detectors + tier scoring behind a
// single interface. Cache is in-memory only (TTL 24h) — identity data is never
// persisted (INV-14 / INV-1).
import { HttpGitHubClient } from "./github.js";
import { Sampler } from "./sampler.js";
import { PassionCache } from "./cache.js";
import { computeScore } from "./score.js";
import type { PassionScore, PassionUser } from "./types.js";

export interface PassionScorer {
  /** Returns the vote weights for both sides of `warId`, each in {1,2,3}. */
  score(
    githubUser: { id: string; login?: string },
    warId: number,
  ): Promise<PassionScore>;
}

export function createPassionScorer(opts?: { token?: string }): PassionScorer {
  const client = new HttpGitHubClient({ token: opts?.token });
  const sampler = new Sampler({ client });
  const cache = new PassionCache();
  return {
    async score(githubUser, warId) {
      const cached = cache.get(githubUser.id, warId);
      if (cached) return cached;
      return computeScore(githubUser as PassionUser, warId, { sampler, cache });
    },
  };
}

export type { PassionScore } from "./types.js";
