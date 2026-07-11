export function bucketTs(tsMs: number, bucketMs = 5 * 60 * 1000): number {
  return Math.floor(tsMs / bucketMs) * bucketMs;
}

export function makeLog(out: (line: string) => void = (l) => console.log(l)) {
  return function log(event: { ts: number; status: number; war_id: string | number }): void {
    const tb = bucketTs(event.ts);
    out(JSON.stringify({ ts: tb, status: event.status, war_id: event.war_id }));
  };
}

export const noopLog = (): void => {};
