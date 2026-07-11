// Express app for the relayer. Dependencies (rpc, relayer keypair, rate limiter,
// log) are injected so the server is testable with mocks — no real devnet needed.
import express, { type Request, type Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { buildVoteTransaction } from "./tx.js";
import { validateVoteShape, ValidationError } from "./precheck.js";
import { makeRateLimiter, clientIp } from "./rateLimit.js";
import { makeLog } from "./log.js";
import { PROGRAM_ID } from "./idl.js";
import type { KeypairLike, RelayerRpc, WarAccountData } from "./types.js";

export interface AppDeps {
  relayer: KeypairLike;
  rpc: RelayerRpc;
  programId?: PublicKey;
  rateLimiter?: ReturnType<typeof makeRateLimiter>;
  log?: ReturnType<typeof makeLog>;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.use(express.json({ limit: "32kb" }));
  const programId = deps.programId ?? new PublicKey(PROGRAM_ID);
  const limiter = deps.rateLimiter ?? makeRateLimiter();
  // INV-2: log ONLY {5-min-bucketed ts, status, war_id} — never IP + nullifier together.
  const log = deps.log ?? makeLog();

  app.post("/relay-vote", async (req: Request, res: Response) => {
    const now = Date.now();
    const ip = clientIp(req);
    const rl = limiter(ip, now);
    if (!rl.allowed) {
      log({ ts: now, status: 429, war_id: -1 });
      return res.status(429).json({ error: "rate_limited" });
    }
    let input: any;
    try {
      validateVoteShape(req.body);
      input = req.body;
    } catch (e) {
      const msg = e instanceof ValidationError ? e.message : "invalid_request";
      log({ ts: now, status: 400, war_id: -1 });
      return res.status(400).json({ error: msg });
    }
    const warId = Number(input.war_id);
    try {
      const war = { warId: BigInt(warId) } as WarAccountData;
      const tx = buildVoteTransaction(deps.relayer, programId, { ...input, warId }, war);
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      // relayer signs + sends; on-chain program is the source of truth for all checks.
      const { signature } = await deps.rpc.sendTransaction(serialized, { skipPreflight: false });
      log({ ts: now, status: 200, war_id: warId });
      return res.json({ tx_signature: signature });
    } catch (e) {
      log({ ts: now, status: 500, war_id: warId });
      return res.status(500).json({ error: "relay_failed" });
    }
  });

  // claim_medal does not exist yet.
  app.post("/relay-claim", (_req, res) =>
    res.status(501).json({ error: "not_implemented" }),
  );

  app.get("/health", (_req, res) => res.json({ ok: true }));
  return app;
}
