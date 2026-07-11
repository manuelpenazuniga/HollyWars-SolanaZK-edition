import Fastify, { type FastifyInstance } from "fastify";
import {
  initPoseidon,
  poseidon,
  feToBE32,
  githubHash,
  buildAttestationMessage,
} from "@holywars/common";
import type { SolanaClient } from "./solana.js";
import type { OAuthClient } from "./oauth.js";
import { checkEligibility } from "./oauth.js";
import type { PassionScorer } from "./passion/index.js";
import type { CensusManager } from "./census.js";
import { BN254_R } from "./solana.js";

export interface AppDeps {
  solana: SolanaClient;
  oauth: OAuthClient;
  scorer: PassionScorer;
  census: CensusManager;
}

// Wars this attestor serves. A register tx for an uninitialized war would fail
// on-chain; reject early to avoid signing + an orphan transaction attempt.
const KNOWN_WARS = new Set([1, 2, 3]);

// Per-war mutex: serializes the read-leaf_index → sign → send → enroll critical
// section so concurrent enrolls for the same war never claim the same leaf_index
// (the on-chain CensusLeafMarker also enforces uniqueness, but this avoids the
// wasted tx and keeps the off-chain tree consistent). (Gemini audit T7b.)
const warLocks = new Map<number, Promise<unknown>>();
function withWarLock<T>(warId: number, fn: () => Promise<T>): Promise<T> {
  const prev = warLocks.get(warId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  warLocks.set(
    warId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  await initPoseidon();

  const app = Fastify({ logger: false });

  // ── POST /enroll ──

  app.post<{
    Body: { oauth_code: string; war_id: number; inner: string };
  }>("/enroll", async (request, reply) => {
    const { oauth_code, war_id, inner } = request.body;

    if (!oauth_code || typeof oauth_code !== "string") {
      return reply.status(400).send({ error: "Missing oauth_code" });
    }
    if (typeof war_id !== "number" || !Number.isInteger(war_id)) {
      return reply.status(400).send({ error: "Invalid war_id" });
    }
    if (!KNOWN_WARS.has(war_id)) {
      return reply.status(400).send({ error: "Unknown war_id" });
    }
    if (!inner || typeof inner !== "string") {
      return reply.status(400).send({ error: "Missing inner" });
    }

    let innerFe: bigint;
    try {
      innerFe = BigInt("0x" + inner);
    } catch {
      return reply.status(400).send({ error: "Invalid inner hex" });
    }

    if (innerFe >= BN254_R) {
      return reply.status(400).send({
        error: "inner must be < BN254 field order",
      });
    }

    // a. OAuth + eligibility data
    let githubUser: { id: number; login: string; created_at: string; public_repos: number };
    let publicEventsCount: number;
    try {
      const result = await deps.oauth.verify(oauth_code);
      githubUser = result.user;
      publicEventsCount = result.publicEventsCount;
    } catch (err: any) {
      return reply.status(401).send({
        error: `OAuth failed: ${err.message}`,
      });
    }

    const githubIdStr = String(githubUser.id);

    // b. Eligibility check
    const eligibility = checkEligibility(
      { id: githubUser.id, login: githubUser.login, created_at: githubUser.created_at, public_repos: githubUser.public_repos },
      publicEventsCount,
    );
    if (!eligibility.eligible) {
      return reply.status(403).send({
        error: "Account does not meet eligibility requirements",
        reason: eligibility.reason,
      });
    }

    // c. github_hash & pre-check duplicate
    const gh = githubHash(githubIdStr);
    const ghHex = gh.toString("hex");

    const exists = await deps.solana.censusEntryExists(war_id, gh);
    if (exists) {
      return reply.status(409).send({
        error: "Already enrolled for this war",
      });
    }

    // d. Score
    let weight_a: number;
    let weight_b: number;
    try {
      const scores = await deps.scorer.score(
        { id: githubIdStr, login: githubUser.login },
        war_id,
      );
      weight_a = scores.weight_a;
      weight_b = scores.weight_b;
    } catch (err: any) {
      return reply.status(500).send({
        error: `Scoring failed: ${err.message}`,
      });
    }

    if (![1, 2, 3].includes(weight_a) || ![1, 2, 3].includes(weight_b)) {
      return reply.status(500).send({
        error: "Invalid weights from scorer",
      });
    }

    // e. Compute commitment
    const commitment = await poseidon([
      innerFe,
      BigInt(weight_a),
      BigInt(weight_b),
    ]);

    // f+g. leaf_index → sign → send → enroll, serialized per war (see withWarLock).
    let leafIndex: number;
    let txSig: string;
    try {
      ({ leafIndex, txSig } = await withWarLock(war_id, async () => {
        const li = deps.census.getLeafCount(war_id);
        const message = buildAttestationMessage({
          commitment,
          githubId: githubIdStr,
          warId: war_id,
          leafIndex: li,
        });
        const signature = deps.solana.signMessage(message);
        const sig = await deps.solana.buildAndSendRegisterTx({
          warId: war_id,
          commitment,
          githubHash: ghHex,
          leafIndex: li,
          message,
          signature,
        });
        await deps.census.enroll(war_id, commitment);
        return { leafIndex: li, txSig: sig };
      }));
    } catch (err: any) {
      return reply.status(500).send({
        error: `Transaction failed: ${err.message}`,
      });
    }

    // h. Response — weights NOT included (INV-1)
    return reply.status(200).send({
      war_id,
      leaf_index: leafIndex,
      commitment: feToBE32(commitment).toString("hex"),
      github_hash: ghHex,
      tx_signature: txSig,
    });
  });

  // ── GET /census/:war_id/leaves ──

  app.get<{ Params: { war_id: string } }>(
    "/census/:war_id/leaves",
    async (request, reply) => {
      const warId = parseInt(request.params.war_id, 10);
      if (isNaN(warId)) {
        return reply.status(400).send({ error: "Invalid war_id" });
      }

      const leaves = deps.census.getLeaves(warId);
      return reply.status(200).send(leaves);
    },
  );

  return app;
}
