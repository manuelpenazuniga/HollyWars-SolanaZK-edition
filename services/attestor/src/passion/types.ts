// Internal types for the Proof of Passion module.
// Public surface (consumed by T7b) is the PassionScorer interface in index.ts.

export type Weight = 1 | 2 | 3;

export interface PassionScore {
  weight_a: Weight;
  weight_b: Weight;
}

export interface PassionUser {
  id: string;
  login?: string;
}

// ---- GitHub REST v3 response shapes (only the fields we read) ------------

export interface GhUserById {
  login: string;
  id: number;
  created_at: string;
  public_repos: number;
}

export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  fork: boolean;
  owner: { login: string; id: number };
  pushed_at: string;
  created_at: string;
  default_branch: string;
  size: number;
}

export interface GhTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url?: string;
}

export interface GhTreeResponse {
  sha: string;
  tree: GhTreeEntry[];
  truncated: boolean;
}

export interface GhContentResponse {
  type: "file" | "dir" | "symlink" | "submodule";
  encoding: "base64" | "utf-8";
  size: number;
  name: string;
  path: string;
  content?: string;
  sha: string;
}

// ---- Detector contracts --------------------------------------------------

export type DetectorName = "tabs_spaces" | "vim_emacs" | "unsupported";

export interface DetectorContext {
  user: PassionUser;
  repos: GhRepo[]; // already filtered: own + non-fork + >=3 months + sorted by pushed_at desc
  fileBlobs: Array<{ repo: GhRepo; path: string; content: string | null }>; // sampled source files
  treePaths: Array<{ repo: GhRepo; path: string; type: GhTreeEntry["type"]; size?: number }>; // ALL paths in the tree, for dotfile detection
}

export interface DetectorResult {
  // raw affinity toward side A in [0,1]; the scorer applies tier().
  affinity: number;
  // true if evidence is insufficient -> scorer returns (1,1).
  insufficient: boolean;
}

export type Detector = (ctx: DetectorContext) => Promise<DetectorResult>;

// ---- Cache ---------------------------------------------------------------

export interface CachedScore {
  ts: number;
  weight_a: Weight;
  weight_b: Weight;
}
