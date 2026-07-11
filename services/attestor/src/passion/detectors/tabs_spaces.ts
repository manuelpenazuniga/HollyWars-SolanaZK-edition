// War 1: Tabs vs Spaces.
//
// Contract (from docs/proof-of-passion.md, publicable):
//   - We count *indented* lines across the sampled source files.
//   - A line counts as a tab  iff its first non-newline character is '\t'.
//   - A line counts as space iff it begins with at least 2 spaces (a single
//     leading space is treated as a continuation / wrap artifact and is
//     ignored — anti-noise for prose-style files).
//   - N = number of indented lines (tab + space). If N < 200, the sample
//     is too small to be meaningful: insufficient -> (1,1).
//   - Otherwise, a = tabs / N (affinity toward the tabs side, side A).
//
// The detector returns the raw affinity; tier() and the (1,1) override live
// in score.ts so the contract is centralized.

import type { Detector, DetectorContext, DetectorResult } from "../types.js";

const MIN_INDENTED_LINES = 200;

export const tabsSpacesDetector: Detector = async (
  ctx: DetectorContext,
): Promise<DetectorResult> => {
  let tabs = 0;
  let spaces = 0;

  for (const blob of ctx.fileBlobs) {
    if (blob.content == null) continue;
    for (const line of blob.content.split(/\r\n|\r|\n/)) {
      if (line.length === 0) continue;
      const c0 = line.charCodeAt(0);
      if (c0 === 0x09) {
        // '\t'
        tabs++;
      } else if (c0 === 0x20) {
        // first char is a space; require at least 2 leading spaces
        if (line.length >= 2 && line.charCodeAt(1) === 0x20) {
          spaces++;
        }
      }
    }
  }

  const N = tabs + spaces;
  if (N < MIN_INDENTED_LINES) {
    return { affinity: 0, insufficient: true };
  }
  return { affinity: tabs / N, insufficient: false };
};
