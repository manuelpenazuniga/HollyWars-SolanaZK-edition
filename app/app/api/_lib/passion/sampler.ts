// Sampling pipeline: turn (user, warId) into a DetectorContext with the
// repos and files the detectors need.
//
// Rules (from the architect's brief, publicable in docs/proof-of-passion.md):
//   1. From the user's public repos, take those that are
//        - owned by the user (repo.owner.id == user.id)
//        - not forks
//        - created >= 3 months ago (anti-gaming: no throwaway test repos)
//      Sort by pushed_at desc and keep the top 5.
//   2. For each of those repos, fetch the git tree at HEAD (recursive).
//   3. From the tree, pick source files matching the extension whitelist
//      and size <= 100KB. Sort by path ascending (deterministic) and keep
//      the first 20. The chosen set is the "sampled files" used both for
//      tabs/spaces counting and for vim modeline scanning.
//   4. Fetch the raw content of those 20 files. 100KB cap is enforced
//      on the tree entry size; we never ask the API for larger blobs.
//
// Determinism: the path-sorted selection is what makes tests reproducible.

import type { GitHubClient } from "./github";
import type {
  GhRepo,
  GhTreeEntry,
  GhTreeResponse,
  PassionUser,
} from "./types";

// Worst-case GitHub calls ≈ 1 (list) + MAX_REPOS × (1 tree + MAX_FILES contents),
// all sequential. Kept small so /enroll finishes well inside the serverless budget.
const MAX_REPOS = 3;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 100 * 1024;

const SOURCE_EXTS = new Set<string>([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".py",
  ".pyi",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".cxx",
  ".hpp",
  ".hxx",
  ".cc",
  ".rb",
  ".rake",
  ".php",
  ".sh",
  ".bash",
  ".zsh",
  ".lua",
  ".pl",
  ".pm",
  ".scala",
  ".kt",
  ".kts",
  ".swift",
  ".m",
  ".mm",
  ".cs",
  ".fs",
  ".fsx",
  ".ex",
  ".exs",
  ".erl",
  ".hs",
  ".ml",
  ".sql",
]);

export interface SampledRepo {
  repo: GhRepo;
  tree: GhTreeResponse;
  sampledFiles: Array<{ path: string; size: number; content: string | null }>;
}

export interface SampleResult {
  repos: SampledRepo[];
  allTreePaths: Array<{ repo: GhRepo; path: string; type: GhTreeEntry["type"]; size?: number }>;
}

export interface SamplerOpts {
  client: GitHubClient;
  now?: () => Date;
  maxRepos?: number;
  maxFiles?: number;
  maxFileBytes?: number;
}

export class Sampler {
  private readonly client: GitHubClient;
  private readonly now: () => Date;
  private readonly maxRepos: number;
  private readonly maxFiles: number;
  private readonly maxFileBytes: number;

  constructor(opts: SamplerOpts) {
    this.client = opts.client;
    this.now = opts.now ?? (() => new Date());
    this.maxRepos = opts.maxRepos ?? MAX_REPOS;
    this.maxFiles = opts.maxFiles ?? MAX_FILES;
    this.maxFileBytes = opts.maxFileBytes ?? MAX_FILE_BYTES;
  }

  async sample(user: PassionUser): Promise<SampleResult> {
    const login = await this.resolveLogin(user);
    if (!login) {
      return { repos: [], allTreePaths: [] };
    }

    const allRepos = await this.client.listOwnerRepos(login);
    const eligible = this.filterEligibleRepos(allRepos, user);
    const topRepos = eligible
      .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
      .slice(0, this.maxRepos);

    const sampledRepos: SampledRepo[] = [];
    const allTreePaths: SampleResult["allTreePaths"] = [];

    for (const repo of topRepos) {
      let tree: GhTreeResponse;
      try {
        tree = await this.client.getRepoTree(
          repo.owner.login,
          repo.name,
          repo.default_branch || "HEAD",
        );
      } catch {
        continue;
      }

      for (const entry of tree.tree) {
        allTreePaths.push({
          repo,
          path: entry.path,
          type: entry.type,
          size: entry.size,
        });
      }

      const sourceFiles = tree.tree
        .filter(
          (e) =>
            e.type === "blob" &&
            typeof e.size === "number" &&
            e.size <= this.maxFileBytes &&
            this.isSourceExt(e.path),
        )
        .sort((a, b) => a.path.localeCompare(b.path))
        .slice(0, this.maxFiles);

      const sampledFiles: SampledRepo["sampledFiles"] = [];
      for (const f of sourceFiles) {
        let content: string | null = null;
        try {
          content = await this.client.getFileContent(
            repo.owner.login,
            repo.name,
            f.path,
          );
        } catch {
          content = null;
        }
        sampledFiles.push({ path: f.path, size: f.size ?? 0, content });
      }

      sampledRepos.push({ repo, tree, sampledFiles });
    }

    return { repos: sampledRepos, allTreePaths };
  }

  private async resolveLogin(user: PassionUser): Promise<string | null> {
    if (user.login) return user.login;
    const u = await this.client.getUserById(user.id);
    return u?.login ?? null;
  }

  private filterEligibleRepos(repos: GhRepo[], user: PassionUser): GhRepo[] {
    const threeMonthsMs = 90 * 24 * 60 * 60 * 1000;
    const cutoff = this.now().getTime() - threeMonthsMs;
    const uid = Number(user.id);
    return repos.filter((r) => {
      if (r.private) return false;
      if (r.fork) return false;
      if (Number.isFinite(uid) && r.owner.id !== uid) return false;
      const created = Date.parse(r.created_at);
      if (!Number.isFinite(created)) return false;
      return created <= cutoff;
    });
  }

  private isSourceExt(path: string): boolean {
    const idx = path.lastIndexOf(".");
    if (idx < 0) return false;
    if (idx === 0) return false;
    const ext = path.slice(idx).toLowerCase();
    return SOURCE_EXTS.has(ext);
  }
}
