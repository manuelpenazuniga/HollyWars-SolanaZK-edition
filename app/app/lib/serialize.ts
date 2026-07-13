// INV-10 serializer: snarkjs proof -> groth16-solana byte format (hex), matching EXACTLY the
// serialization proven on-chain in scripts/e2e-devnet.ts. Pure (no snarkjs/browser deps) so it
// is golden-tested in node against a recorded proof. DO NOT freehand-edit: the on-chain verify
// fails SILENTLY if a byte is wrong.
//
// Rules (the two that cost hours): proof A is NEGATED (y -> q - y over the BN254 base field);
// every G2 point has its Fp2 coordinates SWAPPED to imaginary-first (c1, c0). Field elements
// are 32-byte big-endian. (NOTE: circuits/spike/serialize.ts has a STALE comment #4 claiming no
// swap — its code does swap; this and scripts/e2e-devnet.ts are the authority.)

// BN254 base field prime q (for G1 y-negation). NOT the scalar field r.
const Q = BigInt(
  "0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47",
);

function be(dec: string): string {
  return BigInt(dec).toString(16).padStart(64, "0");
}
function negY(dec: string): string {
  return ((Q - (BigInt(dec) % Q)) % Q).toString(16).padStart(64, "0");
}

export interface SnarkProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}

export interface SerializedVote {
  proof: { a: string; b: string; c: string }; // hex: 128 / 256 / 128 chars
  public_inputs: string[]; // 5 x 64-hex, order [root, nullifier_hash, war_id, side, weight]
  nullifier_hash: string; // = public_inputs[1]
}

export function serializeProof(
  proof: SnarkProof,
  publicSignals: string[],
): SerializedVote {
  const a = be(proof.pi_a[0]) + negY(proof.pi_a[1]); // -A
  const b =
    be(proof.pi_b[0][1]) +
    be(proof.pi_b[0][0]) +
    be(proof.pi_b[1][1]) +
    be(proof.pi_b[1][0]); // G2 Fp2 swap (c1,c0)
  const c = be(proof.pi_c[0]) + be(proof.pi_c[1]);
  const public_inputs = publicSignals.map(be);
  return { proof: { a, b, c }, public_inputs, nullifier_hash: public_inputs[1] };
}
