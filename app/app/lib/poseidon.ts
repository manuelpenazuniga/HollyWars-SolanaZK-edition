"use client";
// Browser Poseidon over BN254, via circomlibjs. buildPoseidon() is async (loads a wasm),
// but the returned hasher P() is SYNCHRONOUS — so we build once and reuse. Field elements
// are bigints; P.F.toString gives the canonical decimal (matches scripts/e2e-devnet.ts).
import { buildPoseidon } from "circomlibjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _p: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPoseidon(): Promise<any> {
  if (!_p) _p = await buildPoseidon();
  return _p;
}

// poseidon([a, b, ...]) -> bigint. Matches the Node `poseidon` in @holywars/common and the
// circuit's Poseidon components exactly.
export async function poseidon(inputs: bigint[]): Promise<bigint> {
  const P = await getPoseidon();
  return BigInt(P.F.toString(P(inputs)));
}
