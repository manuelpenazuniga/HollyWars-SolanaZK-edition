const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

(async () => {
  console.log("=== Holy Wars — Vote Circuit Test Suite ===\n");

  const circuitsDir = path.join(__dirname, "..");
  const buildDir = path.join(circuitsDir, "build");
  const wasmPath = path.join(buildDir, "vote_js", "vote.wasm");
  const zkeyPath = path.join(buildDir, "vote_final.zkey");
  const vkPath = path.join(buildDir, "verification_key.json");

  const { buildPoseidon } = require("circomlibjs");
  const poseidon = await buildPoseidon();

  // Correct "VOTE" = 0x564F5445 = 1448039493
  const DOMAIN_VOTE = 1448039493n;

  function hashPoseidon(inputs) {
    return poseidon.F.toString(poseidon(inputs.map(x => BigInt(x))));
  }
  function poseidon2(a, b) { return BigInt(hashPoseidon([a, b])); }
  function poseidon3(a, b, c) { return BigInt(hashPoseidon([a, b, c])); }

  // ============================================================
  // INV-7: Poseidon test vectors
  // ============================================================
  const SEED = 12345678901234567890123456789012345678n;
  const TRAPDOOR = 98765432109876543210987654321098765432n;
  const WA = 2n;
  const WB = 3n;
  const WAR_ID = 1n;

  const inner = poseidon2(SEED, TRAPDOOR);
  const leaf = poseidon3(inner, WA, WB);
  const nullifier = poseidon3(SEED, WAR_ID, DOMAIN_VOTE);

  const poseidonVectors = {
    description: "Poseidon test vectors for Holy Wars circuits (bn254, circomlibjs). INV-7.",
    DOMAIN_VOTE: DOMAIN_VOTE.toString(),
    DOMAIN_VOTE_hex: "0x" + DOMAIN_VOTE.toString(16),
    vectors: {
      "Poseidon(nullifier_seed, trapdoor)": {
        inputs: [SEED.toString(), TRAPDOOR.toString()],
        output: inner.toString()
      },
      "Poseidon(inner, weight_a, weight_b)": {
        inputs: [inner.toString(), WA.toString(), WB.toString()],
        output: leaf.toString()
      },
      "Poseidon(nullifier_seed, war_id, DOMAIN_VOTE)": {
        inputs: [SEED.toString(), WAR_ID.toString(), DOMAIN_VOTE.toString()],
        output: nullifier.toString()
      }
    }
  };
  fs.writeFileSync(
    path.join(circuitsDir, "poseidon_vectors.json"),
    JSON.stringify(poseidonVectors, null, 2)
  );
  console.log("✓ poseidon_vectors.json written (INV-7) — DOMAIN_VOTE = 0x564F5445 = 1448039493");

  // ============================================================
  // Merkle tree helpers (depth 20)
  // ============================================================
  const DEPTH = 20;

  function zeroLeaf() { return poseidon2(0n, 0n); }
  const zeroLeaves = new Array(DEPTH + 1);
  zeroLeaves[0] = zeroLeaf();
  for (let i = 1; i <= DEPTH; i++) {
    zeroLeaves[i] = poseidon2(zeroLeaves[i - 1], zeroLeaves[i - 1]);
  }

  // Build a Merkle tree with a single leaf at index 0, rest zero.
  // Returns { root, merklePath, pathIndices }
  function buildMerkleTree(leafValue) {
    const pathIndices = [];
    const merklePath = [];
    let currentIndex = 0;
    let currentHash = leafValue;
    for (let i = 0; i < DEPTH; i++) {
      const isRight = currentIndex & 1;
      pathIndices.push(isRight);
      merklePath.push(zeroLeaves[i]);
      currentHash = isRight === 0
        ? poseidon2(currentHash, zeroLeaves[i])
        : poseidon2(zeroLeaves[i], currentHash);
      currentIndex = currentIndex >> 1;
    }
    return { root: currentHash, merklePath, pathIndices };
  }

  // ============================================================
  // Build valid Merkle tree for positive test
  // ============================================================
  const { root, merklePath, pathIndices } = buildMerkleTree(leaf);
  console.log(`  Merkle root (valid): ${root.toString().slice(0, 20)}...`);

  // ============================================================
  // Shared test helpers
  // ============================================================
  const side = 0n;
  const expectedWeight = WA;

  function makeInput(overrides) {
    return {
      trapdoor: TRAPDOOR.toString(),
      nullifier_seed: SEED.toString(),
      weight_a: WA.toString(),
      weight_b: WB.toString(),
      merkle_path: merklePath.map(x => x.toString()),
      path_indices: pathIndices.map(x => x.toString()),
      root: root.toString(),
      nullifier_hash: nullifier.toString(),
      war_id: WAR_ID.toString(),
      side: side.toString(),
      weight: expectedWeight.toString(),
      ...overrides
    };
  }

  function writeInput(filename, inputObj) {
    const p = path.join(buildDir, filename);
    fs.writeFileSync(p, JSON.stringify(inputObj, null, 2));
    return p;
  }

  function runProve(inputPath, proofName, publicName) {
    const proofP = path.join(buildDir, proofName);
    const pubP = path.join(buildDir, publicName);
    execSync(
      `npx snarkjs groth16 fullprove "${inputPath}" "${wasmPath}" "${zkeyPath}" "${proofP}" "${pubP}"`,
      { cwd: circuitsDir, stdio: "pipe" }
    );
    return { proofP, pubP };
  }

  function runVerify(proofP, pubP) {
    const res = execSync(
      `npx snarkjs groth16 verify "${vkPath}" "${pubP}" "${proofP}"`,
      { cwd: circuitsDir, stdio: "pipe" }
    );
    return res.toString().includes("OK");
  }

  // ============================================================
  // TEST 1: Valid proof (weight=2, side=0)
  // ============================================================
  console.log("\n--- TEST 1: Valid Proof ---");
  try {
    const inp = writeInput("input_valid.json", makeInput({}));
    const { pubP, proofP } = runProve(inp, "proof_valid.json", "public_valid.json");
    console.log("  Proof generated ✓");
    const ok = runVerify(proofP, pubP);
    console.log(`  Verification: ${ok ? "✓ VALID" : "✗ FAILED"}`);
    if (!ok) { console.error("  ERROR: Valid proof failed verification!"); process.exit(1); }
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    if (e.stderr) console.error(e.stderr.toString().slice(0, 500));
    process.exit(1);
  }

  // ============================================================
  // TEST 2: Negative — invalid weight (5), GENUINE range check
  //   Builds a CONSISTENT Merkle tree with weight_a=5 so the
  //   selector passes (weight == weight_a == 5) but the range
  //   check (5-1)(5-2)(5-3) ≠ 0 fails.
  // ============================================================
  console.log("\n--- TEST 2: Negative — Weight 5 (genuine range check) ---");
  {
    const badWeightA = 5n;
    const badLeaf = poseidon3(inner, badWeightA, WB);
    const badTree = buildMerkleTree(badLeaf);

    const badInput = makeInput({
      weight_a: badWeightA.toString(),
      weight: badWeightA.toString(),     // side=0 → weight == weight_a == 5
      merkle_path: badTree.merklePath.map(x => x.toString()),
      path_indices: badTree.pathIndices.map(x => x.toString()),
      root: badTree.root.toString(),
    });

    writeInput("input_invalid_weight.json", badInput);

    let passed = false;
    try {
      const { pubP, proofP } = runProve(
        path.join(buildDir, "input_invalid_weight.json"),
        "proof_invalid_weight.json", "public_invalid_weight.json"
      );
      passed = !runVerify(proofP, pubP);
      console.log(`  Verification: ${passed ? "✓ REJECTED" : "✗ UNEXPECTEDLY VALID"}`);
    } catch (e) {
      const s = (e.stderr || e.message || "").toString();
      passed = s.includes("Constraint") || s.includes("Error") || s.includes("assert") || s.includes("FAIL");
      console.log(passed ? "  Witness rejected by range constraint ✓" : `  Unexpected error: ${s.slice(0, 200)}`);
    }
    if (!passed) { console.error("  ERROR: Invalid weight (5) accepted!"); process.exit(1); }
  }

  // ============================================================
  // TEST 3: Negative — invalid Merkle path (wrong root)
  // ============================================================
  console.log("\n--- TEST 3: Negative — Invalid Merkle Path ---");
  {
    const wrongRoot = poseidon2(root, 1n);
    const badInput = makeInput({ root: wrongRoot.toString() });
    writeInput("input_invalid_path.json", badInput);

    let passed = false;
    try {
      const { pubP, proofP } = runProve(
        path.join(buildDir, "input_invalid_path.json"),
        "proof_invalid_path.json", "public_invalid_path.json"
      );
      passed = !runVerify(proofP, pubP);
      console.log(`  Verification: ${passed ? "✓ REJECTED" : "✗ UNEXPECTEDLY VALID"}`);
    } catch (e) {
      const s = (e.stderr || e.message || "").toString();
      passed = s.includes("Constraint") || s.includes("Error") || s.includes("assert") || s.includes("FAIL");
      console.log(passed ? "  Witness rejected as expected ✓" : `  Unexpected error: ${s.slice(0, 200)}`);
    }
    if (!passed) { console.error("  ERROR: Invalid path accepted!"); process.exit(1); }
  }

  // ============================================================
  console.log("\n=== ALL TESTS PASSED ===");
  console.log("  ✓ TEST 1: Valid proof — VERIFIED");
  console.log("  ✓ TEST 2: Invalid weight (5, genuine range check) — REJECTED");
  console.log("  ✓ TEST 3: Invalid Merkle path — REJECTED");
  console.log("  ✓ INV-7: poseidon_vectors.json generated");
})().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
