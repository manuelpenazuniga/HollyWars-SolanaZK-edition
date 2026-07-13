// GitHub REST v3 client. The only consumer in this module is the scorer
// pipeline; tests inject a fixture-backed implementation through
// createPassionScorerWithClient (see index.ts).
//
// Endpoints used (all real REST v3 routes):
//   GET https://api.github.com/user/{account_id}        -> GhUserById
//   GET https://api.github.com/users/{login}/repos      -> GhRepo[]  (type=owner, sort=pushed)
//   GET https://api.github.com/repos/{o}/{r}/git/trees/{ref}?recursive=1
//   GET https://api.github.com/repos/{o}/{r}/contents/{path}   (base64 blob)
//
// Rate-limit handling: when the response carries `X-RateLimit-Remaining: 0`
// and a `X-RateLimit-Reset` Unix epoch, we back off until that instant plus
// a small jitter. On 403/429 with the same headers we do the same.
//
// The base URL is `https://api.github.com` (no version segment; GitHub pins
// v3 as the current version on that host).

import type {
  GhContentResponse,
  GhRepo,
  GhTreeResponse,
  GhUserById,
} from "./types";

const GITHUB_API = "https://api.github.com";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_PAGES = 5;

export interface GitHubClient {
  getUserById(id: string): Promise<GhUserById | null>;
  listOwnerRepos(login: string): Promise<GhRepo[]>;
  getRepoTree(owner: string, repo: string, ref?: string): Promise<GhTreeResponse>;
  getFileContent(owner: string, repo: string, path: string): Promise<string | null>;
}

export interface HttpGitHubClientOpts {
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class HttpGitHubClient implements GitHubClient {
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: HttpGitHubClientOpts = {}) {
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? 3;
    this.sleep =
      opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async getUserById(id: string): Promise<GhUserById | null> {
    const path = `/user/${encodeURIComponent(id)}`;
    const res = await this.request(path, { allow404: true });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`github /user/${id} -> ${res.status}`);
    }
    return (await res.json()) as GhUserById;
  }

  async listOwnerRepos(login: string): Promise<GhRepo[]> {
    const out: GhRepo[] = [];
    for (let page = 1; page <= DEFAULT_MAX_PAGES; page++) {
      const qs = new URLSearchParams({
        type: "owner",
        sort: "pushed",
        direction: "desc",
        per_page: "100",
        page: String(page),
      });
      const res = await this.request(
        `/users/${encodeURIComponent(login)}/repos?${qs.toString()}`,
      );
      if (!res.ok) {
        throw new Error(`github /users/${login}/repos -> ${res.status}`);
      }
      const batch = (await res.json()) as GhRepo[];
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  }

  async getRepoTree(
    owner: string,
    repo: string,
    ref: string = "HEAD",
  ): Promise<GhTreeResponse> {
    const qs = new URLSearchParams({ recursive: "1" });
    const res = await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo,
      )}/git/trees/${encodeURIComponent(ref)}?${qs.toString()}`,
    );
    if (res.status === 404) {
      throw new Error(`github tree ${owner}/${repo}@${ref}: not found`);
    }
    if (res.status === 403) {
      throw new Error(`github tree ${owner}/${repo}@${ref}: forbidden`);
    }
    if (!res.ok) {
      throw new Error(`github tree ${owner}/${repo}@${ref} -> ${res.status}`);
    }
    return (await res.json()) as GhTreeResponse;
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
  ): Promise<string | null> {
    const res = await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo,
      )}/contents/${path
        .split("/")
        .map((p) => encodeURIComponent(p))
        .join("/")}`,
      { allow404: true },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`github contents ${owner}/${repo}/${path} -> ${res.status}`);
    }
    const body = (await res.json()) as GhContentResponse;
    if (body.type !== "file" || !body.content) return null;
    return Buffer.from(body.content, "base64").toString("utf-8");
  }

  private async request(
    path: string,
    opts: { allow404?: boolean } = {},
  ): Promise<Response> {
    const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
    let attempt = 0;
    let lastErr: unknown = null;
    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = {
          accept: "application/vnd.github+json",
          "user-agent": "holy-wars-attestor/1.0",
          "x-github-api-version": "2022-11-28",
        };
        if (this.token) headers["authorization"] = `Bearer ${this.token}`;
        const res = await this.fetchImpl(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        if (res.status === 404 && opts.allow404) {
          return res;
        }

        if (res.status === 403 || res.status === 429) {
          const remaining = res.headers.get("x-ratelimit-remaining");
          const reset = res.headers.get("x-ratelimit-reset");
          if (remaining === "0" && reset) {
            const waitMs = await this.backoffFor(reset);
            await this.sleep(waitMs);
            attempt++;
            continue;
          }
        }

        if (res.status >= 500 && res.status < 600 && attempt < this.maxRetries) {
          attempt++;
          await this.sleep(2 ** attempt * 250);
          continue;
        }

        return res;
      } catch (e) {
        lastErr = e;
        if (attempt >= this.maxRetries) break;
        await this.sleep(2 ** attempt * 250);
        attempt++;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(
      `github ${url}: exhausted retries (${(lastErr as Error)?.message ?? "unknown"})`,
    );
  }

  private async backoffFor(resetHeader: string): Promise<number> {
    const resetEpoch = Number(resetHeader);
    if (!Number.isFinite(resetEpoch)) return 60_000;
    const delta = resetEpoch * 1000 - Date.now();
    const capped = Math.max(1_000, Math.min(delta + Math.random() * 2000, 300_000));
    return capped;
  }
}
