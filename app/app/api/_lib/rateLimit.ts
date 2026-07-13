export interface RateLimitOptions {
  capacity?: number;
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function makeRateLimiter(opts: RateLimitOptions = {}) {
  const capacity = opts.capacity ?? 5;
  const windowMs = opts.windowMs ?? 60_000;
  const hits = new Map<string, number[]>();

  function prune(now: number): void {
    const cutoff = now - windowMs;
    for (const [k, arr] of hits) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length === 0) hits.delete(k);
      else hits.set(k, kept);
    }
  }

  return function check(ip: string, now: number = Date.now()): RateLimitResult {
    prune(now);
    const arr = hits.get(ip) ?? [];
    const cutoff = now - windowMs;
    const recent = arr.filter((t) => t > cutoff);
    if (recent.length >= capacity) {
      const oldest = recent[0];
      hits.set(ip, recent);
      return { allowed: false, remaining: 0, resetMs: oldest + windowMs - now };
    }
    recent.push(now);
    hits.set(ip, recent);
    return { allowed: true, remaining: capacity - recent.length, resetMs: windowMs };
  };
}

export function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  if (req.ip && req.ip.length > 0) return req.ip;
  if (req.socket?.remoteAddress) return req.socket.remoteAddress;
  return "unknown";
}
