import { PublicKey } from "@solana/web3.js";
// Inlined (relayer stays dependency-light and isolated): 32 big-endian bytes → field element.
function be32ToFe(b: Uint8Array): bigint {
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x;
}
import type { Hex32, Hex5x32, PrecheckOutcome, RelayerRpc, WarAccountData } from "./types.js";
import { PROGRAM_ID } from "./idl.js";

const HEX32_RE = /^[0-9a-fA-F]{64}$/;
const HEX64_RE = /^[0-9a-fA-F]{128}$/;
const HEX128_RE = /^[0-9a-fA-F]{256}$/;
const WAR_ACCOUNT_SIZE = 8 + 8 + (4 + 64) + (4 + 32) + (4 + 32) + 8 + 8 + 32 + 1 + 8 + 8 + 32 + 1;

export class ValidationError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string) {
    super(reason);
    this.status = status;
    this.reason = reason;
  }
}

export function validateVoteShape(input: unknown): asserts input is {
  war_id: number;
  nullifier_hash: Hex32;
  proof: { a: string; b: string; c: string };
  public_inputs: Hex5x32;
  battle_cry?: string;
} {
  if (!input || typeof input !== "object") {
    throw new ValidationError(400, "body must be a JSON object");
  }
  const body = input as Record<string, unknown>;
  const warIdRaw = body.war_id;
  let war_id: number;
  if (typeof warIdRaw === "number" && Number.isInteger(warIdRaw) && warIdRaw >= 0) {
    war_id = warIdRaw;
  } else if (typeof warIdRaw === "string" && /^\d+$/.test(warIdRaw)) {
    war_id = Number(warIdRaw);
    if (!Number.isSafeInteger(war_id)) throw new ValidationError(400, "war_id out of range");
  } else {
    throw new ValidationError(400, "war_id missing or not a non-negative integer");
  }

  const nh = body.nullifier_hash;
  if (typeof nh !== "string" || !HEX32_RE.test(nh)) {
    throw new ValidationError(400, "nullifier_hash must be 32-byte hex (64 chars)");
  }

  const p = body.proof as { a?: unknown; b?: unknown; c?: unknown } | undefined;
  if (!p || typeof p !== "object") throw new ValidationError(400, "proof required");
  if (typeof p.a !== "string" || !HEX64_RE.test(p.a)) {
    throw new ValidationError(400, "proof.a must be 64-byte hex (128 chars)");
  }
  if (typeof p.b !== "string" || !HEX128_RE.test(p.b)) {
    throw new ValidationError(400, "proof.b must be 128-byte hex (256 chars)");
  }
  if (typeof p.c !== "string" || !HEX64_RE.test(p.c)) {
    throw new ValidationError(400, "proof.c must be 64-byte hex (128 chars)");
  }

  const pi = body.public_inputs;
  if (!Array.isArray(pi) || pi.length !== 5) {
    throw new ValidationError(400, "public_inputs must be an array of 5 32-byte hex strings");
  }
  for (let i = 0; i < 5; i++) {
    if (typeof pi[i] !== "string" || !HEX32_RE.test(pi[i] as string)) {
      throw new ValidationError(400, `public_inputs[${i}] must be 32-byte hex`);
    }
  }

  const bc = body.battle_cry;
  if (bc !== undefined) {
    if (typeof bc !== "string") {
      throw new ValidationError(400, "battle_cry must be a string");
    }
    if (Buffer.byteLength(bc, "utf8") > 140) {
      throw new ValidationError(400, "battle_cry must be ≤140 bytes (UTF-8)");
    }
  }
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function warPda(programId: PublicKey, warId: number): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(warId));
  return PublicKey.findProgramAddressSync([Buffer.from("war"), buf], programId)[0];
}

export function nullifierPda(programId: PublicKey, warId: number, nullifierHash: Uint8Array): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(warId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("null"), buf, Buffer.from(nullifierHash)],
    programId,
  )[0];
}

export function decodeWarAccount(data: Buffer): WarAccountData {
  if (data.length < WAR_ACCOUNT_SIZE) {
    throw new ValidationError(502, "war account data too short");
  }
  let off = 8;
  const warId = data.readBigUInt64LE(off); off += 8;
  const topicLen = data.readUInt32LE(off); off += 4;
  const topic = data.slice(off, off + topicLen).toString("utf8"); off += topicLen;
  const sideALen = data.readUInt32LE(off); off += 4;
  const sideA = data.slice(off, off + sideALen).toString("utf8"); off += sideALen;
  const sideBLen = data.readUInt32LE(off); off += 4;
  const sideB = data.slice(off, off + sideBLen).toString("utf8"); off += sideBLen;
  const tallyA = data.readBigUInt64LE(off); off += 8;
  const tallyB = data.readBigUInt64LE(off); off += 8;
  const censusRoot = data.slice(off, off + 32); off += 32;
  const status = data.readUInt8(off); off += 1;
  const opensAt = data.readBigInt64LE(off); off += 8;
  const closesAt = data.readBigInt64LE(off); off += 8;
  const medalTree = data.slice(off, off + 32); off += 32;
  const bump = data.readUInt8(off);
  return { warId, topic, sideA, sideB, tallyA, tallyB, censusRoot, status, opensAt, closesAt, medalTree, bump };
}

export async function precheckVote(
  rpc: RelayerRpc,
  programId: PublicKey,
  input: {
    war_id: number;
    nullifier_hash: string;
    public_inputs: Hex5x32;
  },
): Promise<PrecheckOutcome> {
  const pi0 = hexToBytes(input.public_inputs[0]);
  const pi1 = hexToBytes(input.public_inputs[1]);
  const pi3 = hexToBytes(input.public_inputs[3]);
  const pi4 = hexToBytes(input.public_inputs[4]);

  if (!bytesEqual(pi1, hexToBytes(input.nullifier_hash))) {
    return { kind: "reject", status: 400, reason: "nullifier_hash must equal public_inputs[1]" };
  }

  for (let i = 0; i < 31; i++) {
    if (pi3[i] !== 0) return { kind: "reject", status: 400, reason: "side must be 0 or 1" };
    if (pi4[i] !== 0) return { kind: "reject", status: 400, reason: "weight must be 1, 2 or 3" };
  }
  const side = pi3[31];
  const weight = pi4[31];
  if (side > 1) return { kind: "reject", status: 400, reason: "side must be 0 or 1" };
  if (weight < 1 || weight > 3) {
    return { kind: "reject", status: 400, reason: "weight must be 1, 2 or 3" };
  }

  const warKey = warPda(programId, input.war_id);
  const warInfo = await rpc.getAccountInfo(warKey);
  if (!warInfo) {
    return { kind: "reject", status: 404, reason: "war not found" };
  }
  const war = decodeWarAccount(warInfo.data);

  if (!bytesEqual(war.censusRoot, pi0)) {
    return { kind: "reject", status: 409, reason: "regenerá la proof: root mismatch" };
  }

  const nullKey = nullifierPda(programId, input.war_id, pi1);
  const nullInfo = await rpc.getAccountInfo(nullKey);
  if (nullInfo !== null) {
    return { kind: "reject", status: 409, reason: "ya votó: nullifier exists" };
  }

  return { kind: "ok", war };
}

export function programIdPk(): PublicKey {
  return new PublicKey(PROGRAM_ID);
}

export function assertBe32Roundtrip(h: Hex32, label: string): void {
  try {
    be32ToFe(hexToBytes(h));
  } catch {
    throw new ValidationError(400, `${label} is not a valid field element`);
  }
}
