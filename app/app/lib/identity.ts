"use client";
// Client-side census identity. The secrets (trapdoor, nullifier_seed) are generated here,
// NEVER leave the browser except as the derived `inner` (which reveals nothing), and are
// persisted in localStorage so the voter can come back and prove membership + claim a medal.
import { poseidon } from "./poseidon";

// BN254 scalar field order (r). Circuit inputs must be < r, so we reduce random bytes mod r.
export const BN254_R =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface IdentityKit {
  warId: number;
  trapdoor: string; // decimal string
  nullifierSeed: string; // decimal string
  weightA: number;
  weightB: number;
  leafIndex: number;
  commitment: string; // hex BE-32 — equals the on-chain census leaf
}

function randomFieldElement(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  return x % BN254_R;
}

export function generateSecrets(): { trapdoor: bigint; nullifierSeed: bigint } {
  return { trapdoor: randomFieldElement(), nullifierSeed: randomFieldElement() };
}

// inner = Poseidon(nullifier_seed, trapdoor). MUST match the circuit (inner_hash.inputs[0] =
// nullifier_seed, inputs[1] = trapdoor) and be what the attestor hashes into the commitment.
export async function computeInner(
  nullifierSeed: bigint,
  trapdoor: bigint,
): Promise<bigint> {
  return poseidon([nullifierSeed, trapdoor]);
}

// commitment = Poseidon(inner, weight_a, weight_b) — the census leaf.
export async function computeCommitment(
  inner: bigint,
  weightA: number,
  weightB: number,
): Promise<bigint> {
  return poseidon([inner, BigInt(weightA), BigInt(weightB)]);
}

export function feToHex(x: bigint): string {
  return x.toString(16).padStart(64, "0");
}

const kitKey = (warId: number) => `holywars_kit_war_${warId}`;

export function saveKit(kit: IdentityKit): void {
  localStorage.setItem(kitKey(kit.warId), JSON.stringify(kit));
}

export function loadKit(warId: number): IdentityKit | null {
  const raw = localStorage.getItem(kitKey(warId));
  return raw ? (JSON.parse(raw) as IdentityKit) : null;
}
