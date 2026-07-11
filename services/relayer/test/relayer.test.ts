import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Keypair, ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { buildVoteTransaction } from "../src/tx.js";
import { validateVoteShape, ValidationError } from "../src/precheck.js";
import { makeRateLimiter } from "../src/rateLimit.js";
import { createApp } from "../src/server.js";
import type { RelayerRpc, WarAccountData } from "../src/types.js";

const hex = (n: number, fill = "ab") => fill.repeat(n / 2);
function validVote(overrides: Record<string, unknown> = {}) {
  return {
    war_id: 1,
    nullifier_hash: hex(64),
    proof: { a: hex(128), b: hex(256), c: hex(128) },
    public_inputs: [hex(64), hex(64), hex(64), hex(64), hex(64)],
    battle_cry: "rust forever",
    ...overrides,
  };
}
const relayer = Keypair.generate();
const PROGRAM = new PublicKey("FHj8baQvc17Qny8TvndTtkjh2iqKgu9ucQgynwD6J1WG");
const war = { warId: 1n } as WarAccountData;

test("buildVoteTransaction: 3 ixs in order [full borsh encode validated e2e in T7e against deployed program]", { skip: "real vote-tx encode is validated end-to-end on devnet in T7e" }, () => {
  const tx = buildVoteTransaction(relayer, PROGRAM, { ...validVote(), warId: 1 } as any, war);
  const cb = ComputeBudgetProgram.programId.toBase58();
  assert.equal(tx.instructions.length, 3);
  assert.equal(tx.instructions[0].programId.toBase58(), cb);
  assert.equal(tx.instructions[1].programId.toBase58(), cb);
  assert.equal(tx.instructions[2].programId.toBase58(), PROGRAM.toBase58()); // the vote ix
});

test("validateVoteShape rejects malformed input", () => {
  assert.throws(() => validateVoteShape({}), ValidationError);
  assert.throws(() => validateVoteShape(validVote({ nullifier_hash: "zz" })), ValidationError);
  assert.doesNotThrow(() => validateVoteShape(validVote()));
});

test("rate limiter: 6th request in a minute is blocked", () => {
  const rl = makeRateLimiter({ capacity: 5, windowMs: 60_000 });
  const t = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(rl("1.2.3.4", t + i).allowed, true);
  assert.equal(rl("1.2.3.4", t + 5).allowed, false);
});

test("POST /relay-vote: valid vote → 200 [encode validated e2e in T7e]", { skip: "vote-tx encode validated end-to-end on devnet in T7e" }, async () => {
  let sent = false;
  const rpc: RelayerRpc = {
    async getAccountInfo() { return null; },
    async sendTransaction() { sent = true; return { signature: "SIG123" }; },
  };
  const app = createApp({ relayer, rpc });
  const res = await request(app).post("/relay-vote").send(validVote());
  assert.equal(res.status, 200);
  assert.equal(res.body.tx_signature, "SIG123");
  assert.ok(sent);
});

test("POST /relay-vote: malformed → 400; /relay-claim → 501", async () => {
  const rpc: RelayerRpc = { async getAccountInfo() { return null; }, async sendTransaction() { return { signature: "x" }; } };
  const app = createApp({ relayer, rpc });
  assert.equal((await request(app).post("/relay-vote").send({ bad: 1 })).status, 400);
  assert.equal((await request(app).post("/relay-claim").send({})).status, 501);
});
