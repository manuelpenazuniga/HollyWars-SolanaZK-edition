import { HttpGitHubClient } from "./github";
import { Sampler } from "./sampler";
import { PassionCache } from "./cache";
import { computeScore } from "./score";
import type { PassionScore, PassionUser } from "./types";

export interface PassionScorer {
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

export type { PassionScore } from "./types";
