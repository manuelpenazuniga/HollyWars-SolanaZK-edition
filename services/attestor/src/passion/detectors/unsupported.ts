// War 3 (Dark vs Light): no reliable signal in public repos.
//
// The brief is explicit: this war is "unsupported" by design. The contract
// is that we return insufficient -> (1,1) regardless of what we scrape, and
// we document the gap in docs/proof-of-passion.md as an honest limit.
//
// We still need a function in the registry so the dispatch in score.ts can
// look it up by name; it just doesn't touch the context.

import type { Detector, DetectorContext, DetectorResult } from "../types.js";

export const unsupportedDetector: Detector = async (
  _ctx: DetectorContext,
): Promise<DetectorResult> => {
  return { affinity: 0, insufficient: true };
};
