import type { DetectorName } from "./types";

export interface WarConfig {
  name: string;
  side_a: string;
  side_b: string;
  detector: DetectorName;
}

export interface WarsConfig {
  wars: Record<string, WarConfig>;
}

const CONFIG: WarsConfig = {
  wars: {
    "1": {
      name: "Tabs vs Spaces",
      side_a: "tabs",
      side_b: "spaces",
      detector: "tabs_spaces",
    },
    "2": {
      name: "Vim vs Emacs",
      side_a: "vim",
      side_b: "emacs",
      detector: "vim_emacs",
    },
    "3": {
      name: "Dark vs Light",
      side_a: "dark",
      side_b: "light",
      detector: "unsupported",
    },
  },
};

export function loadWarsConfig(): WarsConfig {
  return CONFIG;
}

export function getWarConfig(warId: number): WarConfig {
  const cfg = CONFIG.wars[String(warId)];
  if (!cfg) {
    throw new Error(`wars.json: unknown war_id ${warId}`);
  }
  return cfg;
}
