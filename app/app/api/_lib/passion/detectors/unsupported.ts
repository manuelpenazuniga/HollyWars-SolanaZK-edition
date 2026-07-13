import type { Detector, DetectorContext, DetectorResult } from "../types";

export const unsupportedDetector: Detector = async (
  _ctx: DetectorContext,
): Promise<DetectorResult> => {
  return { affinity: 0, insufficient: true };
};
