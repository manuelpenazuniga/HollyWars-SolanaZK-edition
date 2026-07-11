// Loads services/attestor/src/passion/wars.json (the war_id -> detector table)
// and exposes a small lookup API. The file is committed with the service; the
// only thing read at runtime is the per-process Node module cache.
//
// Keeping the file format trivial (one JSON object) so a later T7x can swap
// in on-chain derived config (e.g. War.config_uri) without touching detectors.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DetectorName } from "./types.js";

export interface WarConfig {
  name: string;
  side_a: string;
  side_b: string;
  detector: DetectorName;
}

export interface WarsConfig {
  wars: Record<string, WarConfig>;
}

let cached: WarsConfig | null = null;

export function loadWarsConfig(): WarsConfig {
  if (cached) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "wars.json");
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as WarsConfig;
  if (!parsed.wars || typeof parsed.wars !== "object") {
    throw new Error("wars.json: missing 'wars' object");
  }
  cached = parsed;
  return parsed;
}

export function getWarConfig(warId: number): WarConfig {
  const cfg = loadWarsConfig().wars[String(warId)];
  if (!cfg) {
    throw new Error(`wars.json: unknown war_id ${warId}`);
  }
  return cfg;
}
