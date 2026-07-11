import { initPoseidon, poseidon, feToBE32, be32ToFe, assertPoseidonMatches } from "../src/poseidon.js";
import { githubHash, buildAttestationMessage } from "../src/attestation.js";
import { MerkleTree } from "../src/merkle.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectorsPath = resolve(__dirname, "..", "..", "..", "circuits", "poseidon_vectors.json");

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  OK  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function main(): Promise<void> {
  await initPoseidon();

  // ========================================================
  // TEST SUITE 1: Poseidon self-test (INV-7 gate)
  // ========================================================
  console.log("\n=== Poseidon self-test ===");
  try {
    assertPoseidonMatches(vectorsPath);
    check("Poseidon vectors match", true);
  } catch (e: any) {
    check("Poseidon vectors match", false, e.message);
  }

  // feToBE32 / be32ToFe roundtrip
  const fe = 9364894797331556293216751547586939774017621471814492286642786513003087871360n;
  const be = feToBE32(fe);
  check("feToBE32 length 32", be.length === 32);
  check("be32ToFe roundtrip", be32ToFe(be) === fe);

  // ========================================================
  // TEST SUITE 2: Merkle tree fixture (3 leaves)
  // ========================================================
  console.log("\n=== Merkle tree fixture ===");
  const fixture = JSON.parse(
    readFileSync(resolve(__dirname, "merkle-fixture.json"), "utf-8"),
  );

  const tree = new MerkleTree();
  check("empty tree size 0", tree.size === 0);
  check("empty root = zero[20]", tree.root() !== 0n); // not zero since precomputed

  for (const c of fixture.commitments) {
    tree.insert(BigInt(c));
  }
  check("size === 3", tree.size === 3);

  const expectedRoot = BigInt(fixture.root);
  const computedRoot = tree.root();
  check("root matches fixture", computedRoot === expectedRoot,
    `expected=${expectedRoot} got=${computedRoot}`);

  // Verify proofs for all leaves
  for (let i = 0; i < 3; i++) {
    const leaf = BigInt(fixture.commitments[i]);
    const prf = tree.proof(i);
    const recovered = MerkleTree.verifyProof(leaf, prf);
    check(`proof leaf[${i}] verifies`, recovered === computedRoot,
      `expected=${computedRoot} got=${recovered}`);
  }

  // Proof for non-existent leaf throws
  try {
    tree.proof(99);
    check("proof OOB throws", false);
  } catch {
    check("proof OOB throws", true);
  }

  // Cross-check: single leaf at index 0 matches test-vote.js buildMerkleTree convention
  const singleTree = new MerkleTree();
  const leafVal = BigInt(fixture.commitments[0]);
  singleTree.insert(leafVal);
  const singleProof = singleTree.proof(0);
  check("single leaf proof length 20", singleProof.pathElements.length === 20);
  check("single leaf proof indices all 0", singleProof.pathIndices.every((v) => v === 0));
  const recoveredSingle = MerkleTree.verifyProof(leafVal, singleProof);
  check("single leaf verify", recoveredSingle === singleTree.root());

  // ========================================================
  // TEST SUITE 3: Attestation message (80 bytes)
  // ========================================================
  console.log("\n=== Attestation message ===");

  // githubHash
  const gh = githubHash("12345");
  check("githubHash length 32", gh.length === 32);
  const gh2 = githubHash("12345");
  check("githubHash deterministic", gh.equals(gh2));
  const gh3 = githubHash("99999");
  check("githubHash different for diff ids", !gh.equals(gh3));

  // buildAttestationMessage
  const msg = buildAttestationMessage({
    commitment: 111n,
    githubId: "12345",
    warId: 1,
    leafIndex: 0,
  });
  check("message length 80", msg.length === 80);

  // Check offsets
  // Bytes 0-31: commitment BE
  const extractedCommitment = msg.subarray(0, 32);
  check("commitment offset 0-31", be32ToFe(extractedCommitment) === 111n);

  // Bytes 32-63: github_hash
  const extractedGh = msg.subarray(32, 64);
  check("github_hash offset 32-63", extractedGh.equals(githubHash("12345")));

  // Bytes 64-71: war_id LE
  const extractedWarId = Number(msg.readBigUInt64LE(64));
  check("war_id offset 64-71 LE", extractedWarId === 1);

  // Bytes 72-79: leaf_index LE
  const extractedLeafIndex = Number(msg.readBigUInt64LE(72));
  check("leaf_index offset 72-79 LE", extractedLeafIndex === 0);

  // Cross-check: bigger values
  const msg2 = buildAttestationMessage({
    commitment: 9187245463509822132219689215865959707708306697898521869320259946547613416394n,
    githubId: "999999999",
    warId: 0xdead,
    leafIndex: 123456,
  });
  check("message2 length 80", msg2.length === 80);

  const extractedCommitment2 = be32ToFe(msg2.subarray(0, 32));
  check("message2 commitment roundtrip",
    extractedCommitment2 === 9187245463509822132219689215865959707708306697898521869320259946547613416394n);

  const extractedWarId2 = Number(msg2.readBigUInt64LE(64));
  check("message2 war_id 0xdead", extractedWarId2 === 0xdead);

  const extractedLeafIndex2 = Number(msg2.readBigUInt64LE(72));
  check("message2 leaf_index 123456", extractedLeafIndex2 === 123456);

  // ========================================================
  // Summary
  // ========================================================
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) {
    console.error("SOME TESTS FAILED");
    process.exit(1);
  }
  console.log("ALL TESTS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
