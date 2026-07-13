import type { Detector, DetectorContext, DetectorResult } from "../types";

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
        tabs++;
      } else if (c0 === 0x20) {
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
