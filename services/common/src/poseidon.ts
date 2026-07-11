import { buildPoseidon } from "circomlibjs";
import { readFileSync } from "fs";

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

export function assertPoseidonMatches(vectorsPath: string): void {
  const raw = readFileSync(vectorsPath, "utf-8");
  const vectors = JSON.parse(raw);

  for (const [name, vec] of Object.entries(vectors.vectors) as [
    string,
    { inputs: string[]; output: string },
  ][]) {
    const inputs = vec.inputs.map(BigInt);
    const result = poseidon(inputs);
    const expected = BigInt(vec.output);
    if (result !== expected) {
      console.error(`Poseidon self-test FAILED: ${name}`);
      console.error(`  Expected: ${expected}`);
      console.error(`  Got:      ${result}`);
      process.exit(1);
    }
  }
  console.log("Poseidon self-test PASSED: all vectors match.");
}
