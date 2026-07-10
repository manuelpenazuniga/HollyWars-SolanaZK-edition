import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction, Keypair, ComputeBudgetProgram } from "@solana/web3.js";
import { expect } from "chai";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

const { unstringifyBigInts, leInt2Buff } = require("ffjavascript").utils;
const { buildPoseidon } = require("circomlibjs");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BN254_FQ = BigInt(
  "0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47"
);

function bnToBufferBe(val: any, len = 32): Buffer {
  const le = leInt2Buff(unstringifyBigInts(val), len);
  return Buffer.from(le).reverse();
}

function negateG1(xBuf: Buffer, yBuf: Buffer) {
  const y = BigInt("0x" + yBuf.toString("hex"));
  const negY = BN254_FQ - y;
  const negYHex = negY.toString(16).padStart(64, "0");
  return { x: xBuf, y: Buffer.from(negYHex, "hex") };
}

function serializeProof(proofJson: string) {
  const proof = JSON.parse(fs.readFileSync(proofJson));
  const pi_a_x = bnToBufferBe(proof.pi_a[0]);
  const pi_a_y = bnToBufferBe(proof.pi_a[1]);
  const neg_a = negateG1(pi_a_x, pi_a_y);
  const proofA = Buffer.concat([neg_a.x, neg_a.y]);

  const pi_b_x_c0 = bnToBufferBe(proof.pi_b[0][0]);
  const pi_b_x_c1 = bnToBufferBe(proof.pi_b[0][1]);
  const pi_b_y_c0 = bnToBufferBe(proof.pi_b[1][0]);
  const pi_b_y_c1 = bnToBufferBe(proof.pi_b[1][1]);
  const proofB = Buffer.concat([pi_b_x_c1, pi_b_x_c0, pi_b_y_c1, pi_b_y_c0]);

  const pi_c_x = bnToBufferBe(proof.pi_c[0]);
  const pi_c_y = bnToBufferBe(proof.pi_c[1]);
  const proofC = Buffer.concat([pi_c_x, pi_c_y]);

  return {
    proofA: Array.from(proofA) as number[],
    proofB: Array.from(proofB) as number[],
    proofC: Array.from(proofC) as number[],
  };
}

function serializePublicInputs(publicJson: string) {
  const pubs = JSON.parse(fs.readFileSync(publicJson));
  return pubs.map((val: any) => Array.from(bnToBufferBe(val)) as number[]);
}

describe("holy-wars-vote", () => {
  // SECURITY: a degenerate Groth16 setup (no real phase-2 contribution) has
  // vk_gamma_2 == vk_delta_2 == G2 generator, which lets an attacker forge valid
  // proofs for ANY public inputs without a witness. Guard against a regression of
  // circuits/scripts/setup.sh dropping the phase-2 contribution/beacon. (GPT-5.5 audit.)
  it("SECURITY: trusted setup is non-degenerate (vk_gamma_2 != vk_delta_2)", () => {
    const vk = require("../circuits/verification_key.json");
    expect(JSON.stringify(vk.vk_gamma_2)).to.not.equal(JSON.stringify(vk.vk_delta_2));
  });

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.HolyWars as anchor.Program;

  const attestorKeypair = Keypair.generate();
  const voterKeypair = Keypair.generate();

  let configPda: PublicKey;
  let configBump: number;

  const DOMAIN_VOTE = 1448039493n;
  const SEED = 12345678901234567890123456789012345678n;
  const TRAPDOOR = 98765432109876543210987654321098765432n;
  const WA = 2n;
  const WB = 3n;
  const DEPTH = 20;

  let poseidon: any;

  const ROOT_DIR = process.cwd();
  const BUILD_DIR = path.join(ROOT_DIR, "circuits", "build");
  const WASM_PATH = path.join(BUILD_DIR, "vote_js", "vote.wasm");
  const ZKEY_PATH = path.join(BUILD_DIR, "vote_final.zkey");

  function hashPoseidon(inputs: any[]) {
    return poseidon.F.toString(poseidon(inputs.map((x) => BigInt(x))));
  }
  function poseidon2(a: bigint, b: bigint) {
    return BigInt(hashPoseidon([a, b]));
  }
  function poseidon3(a: bigint, b: bigint, c: bigint) {
    return BigInt(hashPoseidon([a, b, c]));
  }

  function buildMerkleTree(leafValue: bigint) {
    const zeroLeaves: bigint[] = new Array(DEPTH + 1);
    zeroLeaves[0] = poseidon2(0n, 0n);
    for (let i = 1; i <= DEPTH; i++) {
      zeroLeaves[i] = poseidon2(zeroLeaves[i - 1], zeroLeaves[i - 1]);
    }
    const pathIndices: number[] = [];
    const merklePath: bigint[] = [];
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

  function generateProof(
    warId: bigint,
    side: bigint
  ): {
    root: bigint;
    nullifierHash: bigint;
    proofA: number[];
    proofB: number[];
    proofC: number[];
    publicInputs: number[][];
    censusRootArray: number[];
  } {
    const inner = poseidon2(SEED, TRAPDOOR);
    const leaf = poseidon3(inner, WA, WB);
    const nullifierHash = poseidon3(SEED, warId, DOMAIN_VOTE);
    const { root, merklePath, pathIndices } = buildMerkleTree(leaf);
    const weight = side === 0n ? WA : WB;

    const ts = Date.now();
    const inputFile = path.join(BUILD_DIR, `genpf_in_${ts}.json`);
    const proofFile = path.join(BUILD_DIR, `genpf_pr_${ts}.json`);
    const pubFile = path.join(BUILD_DIR, `genpf_pu_${ts}.json`);

    const input = {
      trapdoor: TRAPDOOR.toString(),
      nullifier_seed: SEED.toString(),
      weight_a: WA.toString(),
      weight_b: WB.toString(),
      merkle_path: merklePath.map((x) => x.toString()),
      path_indices: pathIndices.map((x) => x.toString()),
      root: root.toString(),
      nullifier_hash: nullifierHash.toString(),
      war_id: warId.toString(),
      side: side.toString(),
      weight: weight.toString(),
    };

    fs.writeFileSync(inputFile, JSON.stringify(input, null, 2));

    execSync(
      `npx snarkjs groth16 fullprove "${inputFile}" "${WASM_PATH}" "${ZKEY_PATH}" "${proofFile}" "${pubFile}"`,
      { cwd: BUILD_DIR, stdio: "pipe" }
    );

    const serProof = serializeProof(proofFile);
    const pubInputs = serializePublicInputs(pubFile);
    const censusRootArray = pubInputs[0];

    fs.unlinkSync(inputFile);
    fs.unlinkSync(proofFile);
    fs.unlinkSync(pubFile);

    return {
      root,
      nullifierHash,
      proofA: serProof.proofA,
      proofB: serProof.proofB,
      proofC: serProof.proofC,
      publicInputs: pubInputs,
      censusRootArray,
    };
  }

  function configPdaFn(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );
  }

  function warPda(warId: anchor.BN): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(warId.toString()));
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("war"), buf],
      program.programId
    );
    return pda;
  }

  function nullifierPda(warId: anchor.BN, nullifierHash: number[]): PublicKey {
    const warBuf = Buffer.alloc(8);
    warBuf.writeBigUInt64LE(BigInt(warId.toString()));
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("null"), warBuf, Buffer.from(nullifierHash)],
      program.programId
    );
    return pda;
  }

  // Helpers to spin up a fresh war (own PDA → own nullifier namespace). The circuit's
  // nullifier is poseidon3(SEED, warId, DOMAIN) — independent of `side` — so a single
  // identity can vote a given war only once. Handler-reaching negative/positive tests
  // therefore each need their OWN war id, otherwise the Nullifier PDA `init` collides
  // (System error 0x0) before the handler's require! checks ever run.
  async function createWarTx(warId: bigint, opensAt: number, closesAt: number) {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx.add(
      await program.methods
        .createWar(
          new anchor.BN(warId.toString()),
          "Topic",
          "A",
          "B",
          new anchor.BN(opensAt),
          new anchor.BN(closesAt)
        )
        .accounts({
          config: configPda,
          war: warPda(new anchor.BN(warId.toString())),
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );
    await provider.sendAndConfirm(tx);
  }

  async function postRootTx(warId: bigint, rootArray: number[]) {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx.add(
      await program.methods
        .postRoot(new anchor.BN(warId.toString()), rootArray)
        .accounts({
          config: configPda,
          war: warPda(new anchor.BN(warId.toString())),
          attestor: attestorKeypair.publicKey,
        })
        .signers([attestorKeypair])
        .instruction()
    );
    await provider.sendAndConfirm(tx, [attestorKeypair]);
  }

  before(async () => {
    poseidon = await buildPoseidon();
    [configPda, configBump] = configPdaFn();
    const airdropSig = await provider.connection.requestAirdrop(
      voterKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
    await sleep(500);
  });

  // ── Setup ──
  it("Setup: initialize + create wars + post roots", async () => {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx.add(
      await program.methods
        .initialize(attestorKeypair.publicKey)
        .accounts({
          config: configPda,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );
    await provider.sendAndConfirm(tx);

    const now = Math.floor(Date.now() / 1000);

    // War 1: opens now, closes in 1h
    const tx1 = new Transaction();
    tx1.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx1.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx1.add(
      await program.methods
        .createWar(new anchor.BN(1), "Rust vs Go", "Rust", "Go", new anchor.BN(now), new anchor.BN(now + 3600))
        .accounts({
          config: configPda,
          war: warPda(new anchor.BN(1)),
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );
    await provider.sendAndConfirm(tx1);

    // War 2
    const tx2 = new Transaction();
    tx2.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx2.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx2.add(
      await program.methods
        .createWar(new anchor.BN(2), "Py vs JS", "Py", "JS", new anchor.BN(now), new anchor.BN(now + 3600))
        .accounts({
          config: configPda,
          war: warPda(new anchor.BN(2)),
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );
    await provider.sendAndConfirm(tx2);

    // War 3: closes in 2s (window test)
    const tx3 = new Transaction();
    tx3.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx3.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx3.add(
      await program.methods
        .createWar(new anchor.BN(3), "Vim vs Emacs", "Vim", "Emacs", new anchor.BN(now - 10), new anchor.BN(now + 2))
        .accounts({
          config: configPda,
          war: warPda(new anchor.BN(3)),
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );
    await provider.sendAndConfirm(tx3);

    // Post root for war 1
    const proof1 = generateProof(1n, 0n);
    const postTx1 = new Transaction();
    postTx1.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    postTx1.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    postTx1.add(
      await program.methods
        .postRoot(new anchor.BN(1), proof1.censusRootArray)
        .accounts({
          config: configPda,
          war: warPda(new anchor.BN(1)),
          attestor: attestorKeypair.publicKey,
        })
        .signers([attestorKeypair])
        .instruction()
    );
    await provider.sendAndConfirm(postTx1, [attestorKeypair]);

    // Post root for war 2
    const proof2 = generateProof(2n, 1n);
    const postTx2 = new Transaction();
    postTx2.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    postTx2.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    postTx2.add(
      await program.methods
        .postRoot(new anchor.BN(2), proof2.censusRootArray)
        .accounts({
          config: configPda,
          war: warPda(new anchor.BN(2)),
          attestor: attestorKeypair.publicKey,
        })
        .signers([attestorKeypair])
        .instruction()
    );
    await provider.sendAndConfirm(postTx2, [attestorKeypair]);
  });

  // ── TEST 1: Happy path ──
  it("POSITIVE: vote verifies proof and updates tally", async () => {
    const warId = new anchor.BN(1);
    const proof = generateProof(1n, 0n);

    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx.add(
      await program.methods
        .vote(
          warId,
          Array.from(proof.publicInputs[1]),
          proof.proofA,
          proof.proofB,
          proof.proofC,
          proof.publicInputs,
          "Rust all the way!"
        )
        .accounts({
          voter: voterKeypair.publicKey,
          war: warPda(warId),
          nullifier: nullifierPda(warId, proof.publicInputs[1]),
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    const sig = await provider.sendAndConfirm(tx, [voterKeypair]);
    console.log("  tx:", sig);

    const war = await program.account.war.fetch(warPda(warId));
    expect(war.tallyA.toNumber()).to.equal(2);
    expect(war.tallyB.toNumber()).to.equal(0);

    const nf = await program.account.nullifier.fetch(
      nullifierPda(warId, proof.publicInputs[1])
    );
    expect(nf.bump).to.be.a("number");
  });

  // ── TEST 2: Double vote ──
  it("NEGATIVE: double vote (same nullifier) rejected", async () => {
    const warId = new anchor.BN(1);
    const proof = generateProof(1n, 0n);

    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx.add(
      await program.methods
        .vote(
          warId,
          Array.from(proof.publicInputs[1]),
          proof.proofA,
          proof.proofB,
          proof.proofC,
          proof.publicInputs,
          "Try again"
        )
        .accounts({
          voter: voterKeypair.publicKey,
          war: warPda(warId),
          nullifier: nullifierPda(warId, proof.publicInputs[1]),
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(tx, [voterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("already in use");
    }
  });

  // ── TEST 3: WarIdMismatch ──
  it("NEGATIVE: proof for war 2 vs war 1 → WarIdMismatch", async () => {
    const proofForWar2 = generateProof(2n, 0n);
    const warId = new anchor.BN(1);

    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx.add(
      await program.methods
        .vote(
          warId,
          Array.from(proofForWar2.publicInputs[1]),
          proofForWar2.proofA,
          proofForWar2.proofB,
          proofForWar2.proofC,
          proofForWar2.publicInputs,
          "wrong war"
        )
        .accounts({
          voter: voterKeypair.publicKey,
          war: warPda(warId),
          nullifier: nullifierPda(warId, proofForWar2.publicInputs[1]),
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(tx, [voterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      const e = err.toString();
      expect(e.includes("6010") || e.includes("6009")).to.be.true;
    }
  });

  // ── TEST 4: RootMismatch ──
  it("NEGATIVE: stale root after post_root → RootMismatch", async () => {
    // Fresh war (own nullifier namespace). The census root is fixed by the identity's
    // merkle leaf, so we simulate a "stale" root by posting a DIFFERENT root than the
    // one the proof carries: public_inputs[0] (real root) != war.census_root → RootMismatch.
    const warId = new anchor.BN(4);
    const now = Math.floor(Date.now() / 1000);
    await createWarTx(4n, now, now + 3600);

    const oldProof = generateProof(4n, 0n);
    const staleRoot = [...oldProof.censusRootArray];
    staleRoot[0] ^= 0x01; // differs from the proof's real root → mismatch
    await postRootTx(4n, staleRoot);

    const txBad = new Transaction();
    txBad.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    txBad.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    txBad.add(
      await program.methods
        .vote(warId, Array.from(oldProof.publicInputs[1]), oldProof.proofA, oldProof.proofB, oldProof.proofC, oldProof.publicInputs, "stale")
        .accounts({ voter: voterKeypair.publicKey, war: warPda(warId), nullifier: nullifierPda(warId, oldProof.publicInputs[1]), systemProgram: SystemProgram.programId })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(txBad, [voterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("6009");
    }
  });

  // ── TEST 5: InvalidProof (tampered public input) ──
  it("NEGATIVE: tampered public input → InvalidProof", async () => {
    // Fresh war so the Nullifier PDA init succeeds and we actually reach the verifier.
    const warId = new anchor.BN(5);
    const now = Math.floor(Date.now() / 1000);
    await createWarTx(5n, now, now + 3600);
    const proof = generateProof(5n, 1n);
    await postRootTx(5n, proof.censusRootArray); // matching root → passes RootMismatch gate
    const tampered = proof.publicInputs.map((pi) => [...pi]);
    tampered[3][31] = 0; // flip side 1→0, breaks proof

    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx.add(
      await program.methods
        .vote(warId, Array.from(tampered[1]), proof.proofA, proof.proofB, proof.proofC, tampered, "tampered")
        .accounts({ voter: voterKeypair.publicKey, war: warPda(warId), nullifier: nullifierPda(warId, tampered[1]), systemProgram: SystemProgram.programId })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(tx, [voterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("6011");
    }
  });

  // ── TEST 6: War expired → rejected ──
  it("NEGATIVE: vote after closes_at rejected", async () => {
    const warId = new anchor.BN(3);
    await sleep(3000);
    const proof = generateProof(3n, 0n);

    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx.add(
      await program.methods
        .vote(warId, Array.from(proof.publicInputs[1]), proof.proofA, proof.proofB, proof.proofC, proof.publicInputs, "too late")
        .accounts({ voter: voterKeypair.publicKey, war: warPda(warId), nullifier: nullifierPda(warId, proof.publicInputs[1]), systemProgram: SystemProgram.programId })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(tx, [voterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("6007");
    }
  });

  // ── TEST 7: Battle cry length ──
  it("NEGATIVE: battle_cry 141 bytes rejected", async () => {
    // Fresh war so the Nullifier PDA init succeeds and we reach the battle_cry length check.
    const warId = new anchor.BN(6);
    const now = Math.floor(Date.now() / 1000);
    await createWarTx(6n, now, now + 3600);
    const proof = generateProof(6n, 1n);
    await postRootTx(6n, proof.censusRootArray);
    const longCry = "A".repeat(141);

    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx.add(
      await program.methods
        .vote(warId, Array.from(proof.publicInputs[1]), proof.proofA, proof.proofB, proof.proofC, proof.publicInputs, longCry)
        .accounts({ voter: voterKeypair.publicKey, war: warPda(warId), nullifier: nullifierPda(warId, proof.publicInputs[1]), systemProgram: SystemProgram.programId })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(tx, [voterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("6012");
    }
  });

  it("POSITIVE: battle_cry exactly 140 accepted + tally_b updated", async () => {
    // Fresh war: a single identity can vote a war only once (nullifier ignores side),
    // so this side-1 vote lands on its own war and updates tally_b by weight WB (=3).
    const warId = new anchor.BN(7);
    const now = Math.floor(Date.now() / 1000);
    await createWarTx(7n, now, now + 3600);
    const proof = generateProof(7n, 1n);
    await postRootTx(7n, proof.censusRootArray);
    const exactCry = "B".repeat(140);

    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }));
    tx.add(
      await program.methods
        .vote(warId, Array.from(proof.publicInputs[1]), proof.proofA, proof.proofB, proof.proofC, proof.publicInputs, exactCry)
        .accounts({ voter: voterKeypair.publicKey, war: warPda(warId), nullifier: nullifierPda(warId, proof.publicInputs[1]), systemProgram: SystemProgram.programId })
        .instruction()
    );

    const sig = await provider.sendAndConfirm(tx, [voterKeypair]);
    console.log("  tx:", sig);

    const war = await program.account.war.fetch(warPda(warId));
    expect(war.tallyA.toNumber()).to.equal(0);
    expect(war.tallyB.toNumber()).to.equal(3);
  });
});
