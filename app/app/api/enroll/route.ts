export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { initPoseidon, poseidon, feToBE32 } from "../_lib/poseidon";
import { githubHash, buildAttestationMessage } from "../_lib/attestation";
import { SolanaClient, BN254_R } from "../_lib/solana";
import { createOAuthClient, checkEligibility } from "../_lib/oauth";
import { createPassionScorer } from "../_lib/passion/index";
import { getCensusLeafCount, getCensusLeaves } from "../_lib/census";
import { MerkleTree } from "../_lib/merkle";
import { PublicKey } from "@solana/web3.js";

const KNOWN_WARS = new Set([1, 2, 3]);

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

function getSolanaClient(): SolanaClient {
  const rpcUrl = process.env.HELIUS_DEVNET_RPC ?? process.env.NEXT_PUBLIC_RPC ?? "https://api.devnet.solana.com";
  const programId = process.env.PROGRAM_ID ?? "FHj8baQvc17Qny8TvndTtkjh2iqKgu9ucQgynwD6J1WG";
  const raw = JSON.parse(getEnv("AUTHORITY_KEYPAIR")) as number[];
  return new SolanaClient(rpcUrl, programId, Uint8Array.from(raw));
}

let _initPoseidon: Promise<void> | null = null;
function ensurePoseidon(): Promise<void> {
  // LOW-1: don't cache a rejected init forever (it would brick the instance). Clear on failure.
  if (!_initPoseidon) {
    _initPoseidon = initPoseidon().catch((e) => {
      _initPoseidon = null;
      throw e;
    });
  }
  return _initPoseidon;
}

export async function POST(request: Request) {
  try {
    await ensurePoseidon();

    let body: { oauth_code?: unknown; war_id?: unknown; inner?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { oauth_code, war_id, inner } = body;

    if (!oauth_code || typeof oauth_code !== "string") {
      return NextResponse.json({ error: "Missing oauth_code" }, { status: 400 });
    }
    if (typeof war_id !== "number" || !Number.isInteger(war_id)) {
      return NextResponse.json({ error: "Invalid war_id" }, { status: 400 });
    }
    if (!KNOWN_WARS.has(war_id)) {
      return NextResponse.json({ error: "Unknown war_id" }, { status: 400 });
    }
    if (!inner || typeof inner !== "string") {
      return NextResponse.json({ error: "Missing inner" }, { status: 400 });
    }

    let innerFe: bigint;
    try {
      innerFe = BigInt("0x" + inner);
    } catch {
      return NextResponse.json({ error: "Invalid inner hex" }, { status: 400 });
    }

    if (innerFe >= BN254_R) {
      return NextResponse.json(
        { error: "inner must be < BN254 field order" },
        { status: 400 },
      );
    }

    const solana = getSolanaClient();

    const githubClientId = getEnv("GITHUB_CLIENT_ID");
    const githubClientSecret = getEnv("GITHUB_CLIENT_SECRET");
    const oauth = createOAuthClient(githubClientId, githubClientSecret);

    let githubUser: { id: number; login: string; created_at: string; public_repos: number };
    let publicEventsCount: number;
    try {
      const result = await oauth.verify(oauth_code as string);
      githubUser = result.user;
      publicEventsCount = result.publicEventsCount;
    } catch (err: any) {
      return NextResponse.json(
        { error: `OAuth failed: ${err.message}` },
        { status: 401 },
      );
    }

    const githubIdStr = String(githubUser.id);

    const eligibility = checkEligibility(
      { id: githubUser.id, login: githubUser.login, created_at: githubUser.created_at, public_repos: githubUser.public_repos },
      publicEventsCount,
    );
    if (!eligibility.eligible) {
      return NextResponse.json(
        { error: "Account does not meet eligibility requirements", reason: eligibility.reason },
        { status: 403 },
      );
    }

    const gh = githubHash(githubIdStr);
    const ghHex = gh.toString("hex");

    const exists = await solana.censusEntryExists(war_id as number, gh);
    if (exists) {
      return NextResponse.json(
        { error: "Already enrolled for this war" },
        { status: 409 },
      );
    }

    const scorer = createPassionScorer();

    let weight_a: number;
    let weight_b: number;
    try {
      const scores = await scorer.score(
        { id: githubIdStr, login: githubUser.login },
        war_id as number,
      );
      weight_a = scores.weight_a;
      weight_b = scores.weight_b;
    } catch (err: any) {
      return NextResponse.json(
        { error: `Scoring failed: ${err.message}` },
        { status: 500 },
      );
    }

    if (![1, 2, 3].includes(weight_a) || ![1, 2, 3].includes(weight_b)) {
      return NextResponse.json(
        { error: "Invalid weights from scorer" },
        { status: 500 },
      );
    }

    const commitment = poseidon([
      innerFe,
      BigInt(weight_a),
      BigInt(weight_b),
    ]);

    let leafIndex: number;
    let txSig: string;
    try {
      leafIndex = await getCensusLeafCount(
        solana.connection,
        solana.programId,
        war_id as number,
      );

      const message = buildAttestationMessage({
        commitment,
        githubId: githubIdStr,
        warId: war_id as number,
        leafIndex,
      });

      const signature = solana.signMessage(message);

      txSig = await solana.buildAndSendRegisterTx({
        warId: war_id as number,
        commitment,
        githubHash: ghHex,
        leafIndex,
        message,
        signature,
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: `Transaction failed: ${err.message}` },
        { status: 500 },
      );
    }

    // Post the new census root so the on-chain root matches the tree the browser will prove
    // against. HIGH-2: a lagging RPC could return the tree WITHOUT the just-registered leaf →
    // we'd post a stale root and strand this voter forever. So wait until our leaf is visible,
    // then post (with a retry), and report `root_posted` so the client can warn instead of
    // promising votability. Non-fatal: register already succeeded.
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let rootPosted = false;
    try {
      let leaves = await getCensusLeaves(
        solana.connection,
        solana.programId,
        war_id as number,
      );
      for (let a = 0; a < 5 && leaves.length < leafIndex + 1; a++) {
        await sleep(1500);
        leaves = await getCensusLeaves(
          solana.connection,
          solana.programId,
          war_id as number,
        );
      }
      if (leaves.length >= leafIndex + 1) {
        const tree = new MerkleTree();
        for (const l of leaves) tree.insert(BigInt("0x" + l.commitment));
        const root = tree.root();
        for (let a = 0; a < 3 && !rootPosted; a++) {
          try {
            await solana.postRoot(war_id as number, root);
            rootPosted = true;
          } catch {
            await sleep(1000);
          }
        }
      }
    } catch {
      // swallow — do not fail a successful enrollment on a root-post hiccup
    }

    return NextResponse.json({
      war_id,
      leaf_index: leafIndex,
      commitment: feToBE32(commitment).toString("hex"),
      github_hash: ghHex,
      tx_signature: txSig,
      weight_a,
      weight_b,
      root_posted: rootPosted,
    });
  } catch (err: any) {
    if (err instanceof Error && err.message.startsWith("Missing env:")) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    return NextResponse.json(
      { error: `Internal error: ${err.message}` },
      { status: 500 },
    );
  }
}
