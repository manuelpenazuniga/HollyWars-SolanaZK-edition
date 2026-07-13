// Hard verification of the browser crypto libs (T1/T2/T3) against the known-good, on-chain-proven
// values. Run: npx tsx scripts/verify-browser-crypto.ts
import { serializeProof } from "../app/app/lib/serialize";
import { buildProof } from "../app/app/lib/census-tree";
import { poseidon } from "../app/app/lib/poseidon";
import * as fs from "fs";

async function main() {
  const g = JSON.parse(
    fs.readFileSync("app/app/lib/__fixtures__/serialize-golden.json", "utf8"),
  );
  let fail = 0;

  // 1) INV-10 serializer byte-match
  const s = serializeProof(g.proof, g.publicSignals);
  const check = (name: string, got: string, want: string) => {
    const ok = got === want;
    console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n   got  ${got}\n   want ${want}`}`);
    if (!ok) fail++;
  };
  check("serialize proof.a", s.proof.a, g.expected.proof_a);
  check("serialize proof.b", s.proof.b, g.expected.proof_b);
  check("serialize proof.c", s.proof.c, g.expected.proof_c);
  check("serialize public_inputs", JSON.stringify(s.public_inputs), JSON.stringify(g.expected.public_inputs));
  check("serialize nullifier_hash", s.nullifier_hash, g.expected.nullifier_hash);

  // 2) identity: inner + commitment reproduce the census leaf from the fixture input
  const inp = g.input;
  const inner = await poseidon([BigInt(inp.nullifier_seed), BigInt(inp.trapdoor)]);
  const commitment = await poseidon([inner, BigInt(inp.weight_a), BigInt(inp.weight_b)]);

  // 3) census-tree: single-leaf tree (as the e2e used) reproduces the on-chain root + path
  const { root, pathElements, pathIndices } = await buildProof([commitment], 0);
  const rootHex = root.toString(16).padStart(64, "0");
  check("census root == on-chain root (public_inputs[0])", rootHex, g.expected.public_inputs[0]);

  const pathDecMatch =
    JSON.stringify(pathElements.map(String)) === JSON.stringify(inp.merkle_path);
  console.log(`${pathDecMatch ? "✓" : "✗"} merkle path == fixture path_elements`);
  if (!pathDecMatch) fail++;
  const idxMatch = JSON.stringify(pathIndices) === JSON.stringify(inp.path_indices.map(Number));
  console.log(`${idxMatch ? "✓" : "✗"} path indices == fixture path_indices`);
  if (!idxMatch) fail++;

  console.log(fail === 0 ? "\n✅ ALL BROWSER-CRYPTO CHECKS PASS" : `\n❌ ${fail} CHECK(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
