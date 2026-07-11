// Central scorer: dispatch by war_id, run the detector, apply the tier
// formula, and enforce the hard assert that the returned weight is in {1,2,3}.
//
// Formula (publicable, see docs/proof-of-passion.md):
//
//     tier(x) = 3 if x >= 0.80
//             | 2 if x >= 0.55
//             | 1 otherwise
//
//     weight_a = tier(a)
//     weight_b = tier(1 - a)
//
//     insufficient evidence -> (1, 1)
//
// The formula is symmetric around a = 0.5 by construction: if a is large,
// (1 - a) is small, so the "side A advocate" and the "side B advocate"
// cases map cleanly to (3, 1) and (1, 3). For a user who is roughly
// balanced, both tiers are 2 -> (2, 2).

import { PassionCache } from "./cache.js";
import { getWarConfig } from "./config.js";
import { tabsSpacesDetector } from "./detectors/tabs_spaces.js";
import { vimEmacsDetector } from "./detectors/vim_emacs.js";
import { unsupportedDetector } from "./detectors/unsupported.js";
import { Sampler, type SampleResult } from "./sampler.js";
import type {
  Detector,
  PassionScore,
  PassionUser,
  Weight,
} from "./types.js";

const TIER_HIGH = 0.8;
const TIER_MID = 0.55;

const DETECTORS: Record<string, Detector> = {
  tabs_spaces: tabsSpacesDetector,
  vim_emacs: vimEmacsDetector,
  unsupported: unsupportedDetector,
};

export function tier(x: number): Weight {
  if (x >= TIER_HIGH) return 3;
  if (x >= TIER_MID) return 2;
  return 1;
}

function isWeight(n: number): n is Weight {
  return n === 1 || n === 2 || n === 3;
}

function assertWeight(label: string, n: number): Weight {
  if (!isWeight(n)) {
    throw new Error(
      `PoP invariant violated: ${label}=${n} is not in {1,2,3} ` +
        `(this is a bug in the scorer, not user input)`,
    );
  }
  return n;
}

export function applyTier(affinity: number): PassionScore {
  // Defensive clamp: detectors are expected to return a in [0,1], but a
  // buggy detector could drift; we round at the boundary to keep the tier
  // function total. NaN is treated as 0.
  const a = Number.isFinite(affinity) ? Math.max(0, Math.min(1, affinity)) : 0;
  return {
    weight_a: assertWeight("weight_a", tier(a)),
    weight_b: assertWeight("weight_b", tier(1 - a)),
  };
}

export interface ScoreDeps {
  sampler: Sampler;
  cache: PassionCache;
}

export async function computeScore(
  user: PassionUser,
  warId: number,
  deps: ScoreDeps,
): Promise<PassionScore> {
  const cfg = getWarConfig(warId);
  const detector = DETECTORS[cfg.detector];
  if (!detector) {
    throw new Error(`PoP: no detector registered for "${cfg.detector}"`);
  }

  // Cheap, always-insufficient war: skip the network round-trip entirely.
  // (We still cache the result so repeated calls for the same user stay
  // cheap, and so cache size reflects real cost.)
  if (cfg.detector === "unsupported") {
    const out: PassionScore = { weight_a: 1, weight_b: 1 };
    deps.cache.set(user.id, warId, out);
    return out;
  }

  const sample: SampleResult = await deps.sampler.sample(user);
  const ctx = {
    user,
    repos: sample.repos.map((r) => r.repo),
    fileBlobs: sample.repos.flatMap((r) =>
      r.sampledFiles.map((f) => ({ repo: r.repo, path: f.path, content: f.content })),
    ),
    treePaths: sample.allTreePaths,
  };

  const det = await detector(ctx);
  if (det.insufficient) {
    const out: PassionScore = { weight_a: 1, weight_b: 1 };
    deps.cache.set(user.id, warId, out);
    return out;
  }

  const out = applyTier(det.affinity);
  deps.cache.set(user.id, warId, out);
  return out;
}
