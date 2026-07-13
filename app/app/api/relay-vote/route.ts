export const runtime = "nodejs";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { buildVoteTransaction } from "../_lib/tx";
import { validateVoteShape, ValidationError } from "../_lib/precheck";
import { makeRateLimiter } from "../_lib/rateLimit";
import { makeLog } from "../_lib/log";
import { PROGRAM_ID } from "../_lib/idl";
import type { KeypairLike, WarAccountData } from "../_lib/types";

const programIdPk = new PublicKey(PROGRAM_ID);
const limiter = makeRateLimiter();
const log = makeLog();

function getRelayerKeypair(): { kp: Keypair; like: KeypairLike } {
  const raw = JSON.parse(process.env.RELAYER_KEYPAIR!) as number[];
  const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
  return {
    kp,
    like: {
      publicKey: kp.publicKey,
      secretKey: kp.secretKey,
    },
  };
}

export async function POST(request: Request) {
  const now = Date.now();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const rl = limiter(ip, now);
  if (!rl.allowed) {
    log({ ts: now, status: 429, war_id: -1 });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let input: any;
  try {
    validateVoteShape(body);
    input = body;
  } catch (e) {
    const msg = e instanceof ValidationError ? e.message : "invalid_request";
    log({ ts: now, status: 400, war_id: -1 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const warId = Number(input.war_id);

  try {
    if (!process.env.RELAYER_KEYPAIR) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { kp, like } = getRelayerKeypair();
    const war = { warId: BigInt(warId) } as WarAccountData;
    const tx = buildVoteTransaction(like, programIdPk, { ...input, warId }, war);

    const rpcUrl = process.env.HELIUS_DEVNET_RPC ?? process.env.NEXT_PUBLIC_RPC ?? "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.sign(kp);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });

    log({ ts: now, status: 200, war_id: warId });
    return NextResponse.json({ tx_signature: signature });
  } catch (e: any) {
    // HIGH-1: surface distinguishable failures so the client can self-heal. The most common
    // race is the census root moving under a voter mid-proof (every enroll posts a new root);
    // return a "root mismatch" the client retry recognizes, and a clear 409 for a burnt nullifier.
    const text = [
      e?.message,
      ...(Array.isArray(e?.logs) ? e.logs : []),
    ]
      .filter(Boolean)
      .join(" ");
    if (/root mismatch|RootMismatch|census root/i.test(text)) {
      log({ ts: now, status: 409, war_id: warId });
      return NextResponse.json(
        { error: "root mismatch — census moved, regenerate proof" },
        { status: 409 },
      );
    }
    if (/already in use|already been processed|Nullifier/i.test(text)) {
      log({ ts: now, status: 409, war_id: warId });
      return NextResponse.json(
        { error: "already voted in this war (nullifier burned)" },
        { status: 409 },
      );
    }
    log({ ts: now, status: 500, war_id: warId });
    return NextResponse.json({ error: "relay_failed" }, { status: 500 });
  }
}
