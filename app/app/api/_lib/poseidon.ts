import { buildPoseidon } from "circomlibjs";

let _poseidon: Awaited<ReturnType<typeof buildPoseidon>> | null = null;

export async function initPoseidon(): Promise<void> {
  if (!_poseidon) {
    _poseidon = await buildPoseidon();
  }
}

export function poseidon(inputs: bigint[]): bigint {
  if (!_poseidon) throw new Error("Poseidon not initialized. Call initPoseidon() first.");
  return BigInt(_poseidon.F.toString(_poseidon(inputs.map((x) => x))));
}

export function feToBE32(x: bigint): Buffer {
  const hex = x.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

export function be32ToFe(b: Buffer): bigint {
  return BigInt("0x" + b.toString("hex"));
}
