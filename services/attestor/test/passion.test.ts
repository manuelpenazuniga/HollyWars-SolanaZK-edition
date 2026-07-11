import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTier, tier } from "../src/passion/score.js";
import { tabsSpacesDetector } from "../src/passion/detectors/tabs_spaces.js";
import { unsupportedDetector } from "../src/passion/detectors/unsupported.js";
import type { DetectorContext, GhRepo } from "../src/passion/types.js";

const fakeRepo = { full_name: "u/r" } as unknown as GhRepo;
function ctxFromContent(content: string): DetectorContext {
  return {
    user: { id: "1" },
    repos: [fakeRepo],
    fileBlobs: [{ repo: fakeRepo, path: "src/a.ts", content }],
    treePaths: [],
  } as DetectorContext;
}
const lines = (indent: string, n: number) =>
  Array.from({ length: n }, () => `${indent}code`).join("\n");

test("tier thresholds {0.55, 0.80} → {1,2,3}", () => {
  assert.equal(tier(0.0), 1);
  assert.equal(tier(0.54), 1);
  assert.equal(tier(0.55), 2);
  assert.equal(tier(0.79), 2);
  assert.equal(tier(0.8), 3);
  assert.equal(tier(1.0), 3);
});

test("applyTier gives per-side weights in {1,2,3}", () => {
  assert.deepEqual(applyTier(0.9), { weight_a: 3, weight_b: 1 }); // A-strong
  assert.deepEqual(applyTier(0.1), { weight_a: 1, weight_b: 3 }); // B-strong
  assert.deepEqual(applyTier(0.5), { weight_a: 1, weight_b: 1 }); // no clear side
  for (const a of [0, 0.3, 0.55, 0.7, 0.85, 1]) {
    const w = applyTier(a);
    assert.ok([1, 2, 3].includes(w.weight_a) && [1, 2, 3].includes(w.weight_b));
  }
});

test("tabs/spaces: spaces-heavy code → affinity≈0 (tabs side loses)", async () => {
  const r = await tabsSpacesDetector(ctxFromContent(lines("    ", 250)));
  assert.equal(r.insufficient, false);
  assert.ok(r.affinity < 0.1);
  assert.deepEqual(applyTier(r.affinity), { weight_a: 1, weight_b: 3 }); // Tabs=1, Spaces=3
});

test("tabs/spaces: tab-heavy code → affinity≈1 (tabs side wins)", async () => {
  const r = await tabsSpacesDetector(ctxFromContent(lines("\t", 250)));
  assert.equal(r.insufficient, false);
  assert.ok(r.affinity > 0.9);
  assert.deepEqual(applyTier(r.affinity), { weight_a: 3, weight_b: 1 });
});

test("tabs/spaces: too few indented lines → detector reports insufficient", async () => {
  // N = 10 < MIN_INDENTED_LINES (200). computeScore turns `insufficient` into the
  // (1,1) base weight; here we assert the detector itself flags it.
  const r = await tabsSpacesDetector(ctxFromContent(lines("  ", 10)));
  assert.equal(r.insufficient, true);
});

test("unsupported war → insufficient (always base power)", async () => {
  const r = await unsupportedDetector(ctxFromContent(""));
  assert.equal(r.insufficient, true);
});
