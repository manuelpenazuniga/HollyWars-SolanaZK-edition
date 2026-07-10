import * as anchor from "@coral-xyz/anchor";
import {
  Ed25519Program,
  Transaction,
  TransactionInstruction,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sha256(data: string): Buffer {
  return createHash("sha256").update(data).digest();
}

describe("holy-wars-core", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.HolyWars as anchor.Program;

  const attestorKeypair = Keypair.generate();
  const userKeypair = Keypair.generate();

  let configPda: PublicKey;
  let configBump: number;

  before(async () => {
    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );
    const airdropSig = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
    await sleep(500);
  });

  function warPda(warId: anchor.BN): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(warId.toString()));
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("war"), buf],
      program.programId
    );
    return pda;
  }

  function censusPda(
    warId: anchor.BN,
    githubHash: Uint8Array
  ): PublicKey {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(warId.toString()));
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("census"), buf, Buffer.from(githubHash)],
      program.programId
    );
    return pda;
  }

  function censusLeafPda(
    warId: anchor.BN,
    leafIndex: anchor.BN
  ): PublicKey {
    const warBuf = Buffer.alloc(8);
    warBuf.writeBigUInt64LE(BigInt(warId.toString()));
    const leafBuf = Buffer.alloc(8);
    leafBuf.writeBigUInt64LE(BigInt(leafIndex.toString()));
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("census_leaf"), warBuf, leafBuf],
      program.programId
    );
    return pda;
  }

  function makeU64Le(val: anchor.BN): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(val.toString()));
    return buf;
  }

  function makeWarIdLe(warId: anchor.BN): Buffer {
    return makeU64Le(warId);
  }

  // ────────────────────────────────────────────────
  // (a) initialize + create_war happy path
  // ────────────────────────────────────────────────
  it("POSITIVE: initialize creates Config", async () => {
    const tx = new Transaction();
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

    const sig = await provider.sendAndConfirm(tx);
    console.log("  tx:", sig);

    const config = await program.account.config.fetch(configPda);
    expect(config.authority.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(config.attestorPubkey.toBase58()).to.equal(
      attestorKeypair.publicKey.toBase58()
    );
    expect(config.bump).to.equal(configBump);
  });

  it("POSITIVE: create_war creates a War account", async () => {
    const warId = new anchor.BN(1);
    const opensAt = new anchor.BN(Math.floor(Date.now() / 1000));
    const closesAt = opensAt.add(new anchor.BN(3600));

    const wpda = warPda(warId);

    const tx = new Transaction();
    tx.add(
      await program.methods
        .createWar(warId, "Rust vs Go", "Rust", "Go", opensAt, closesAt)
        .accounts({
          config: configPda,
          war: wpda,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    const sig = await provider.sendAndConfirm(tx);
    console.log("  tx:", sig);

    const war = await program.account.war.fetch(wpda);
    expect(war.warId.toNumber()).to.equal(1);
    expect(war.topic).to.equal("Rust vs Go");
    expect(war.sideA).to.equal("Rust");
    expect(war.sideB).to.equal("Go");
    expect(war.tallyA.toNumber()).to.equal(0);
    expect(war.tallyB.toNumber()).to.equal(0);
    expect(war.status).to.have.property("open");
    expect(war.censusRoot).to.deep.equal(
      Array.from(Buffer.alloc(32, 0))
    );
    expect(war.bump).to.be.a("number");
  });

  // ────────────────────────────────────────────────
  // (b) register with VALID Ed25519 attestation
  // ────────────────────────────────────────────────
  it("POSITIVE: register creates CensusEntry with valid Ed25519 attestation", async () => {
    const warId = new anchor.BN(1);
    const commitment = Buffer.alloc(32, 0xab);
    const githubId = "alice";
    const githubHash = sha256(githubId);
    const leafIndex = new anchor.BN(0);

    const message = Buffer.concat([
      commitment,
      Buffer.from(githubHash),
      makeWarIdLe(warId),
      makeU64Le(leafIndex),
    ]);

    const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: attestorKeypair.secretKey,
      message,
    });

    const cpda = censusPda(warId, githubHash);
    const clda = censusLeafPda(warId, leafIndex);

    const tx = new Transaction();
    tx.add(ed25519Ix);
    tx.add(
      await program.methods
        .register(
          warId,
          Array.from(commitment),
          Array.from(githubHash),
          leafIndex
        )
        .accounts({
          payer: userKeypair.publicKey,
          config: configPda,
          war: warPda(warId),
          censusEntry: cpda,
          censusLeaf: clda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    const sig = await provider.sendAndConfirm(tx, [userKeypair]);
    console.log("  tx:", sig);

    const entry = await program.account.censusEntry.fetch(cpda);
    expect(entry.commitment).to.deep.equal(Array.from(commitment));
    expect(entry.leafIndex.toNumber()).to.equal(0);
    expect(entry.slot.toNumber()).to.be.greaterThan(0);
    expect(entry.bump).to.be.a("number");
  });

  // ────────────────────────────────────────────────
  // (c) register with INVALID Ed25519 (wrong signer)
  // ────────────────────────────────────────────────
  it("NEGATIVE: register rejects invalid attestor (wrong signer)", async () => {
    const warId = new anchor.BN(1);
    const commitment = Buffer.alloc(32, 0xcd);
    const githubId = "bob";
    const githubHash = sha256(githubId);
    const leafIndex = new anchor.BN(10); // unique: census_leaf must be fresh so the attestation check (not uniqueness) is exercised

    const message = Buffer.concat([
      commitment,
      Buffer.from(githubHash),
      makeWarIdLe(warId),
      makeU64Le(leafIndex),
    ]);

    const rogueKeypair = Keypair.generate();
    const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: rogueKeypair.secretKey,
      message,
    });

    const cpda = censusPda(warId, githubHash);
    const clda = censusLeafPda(warId, leafIndex);

    const tx = new Transaction();
    tx.add(ed25519Ix);
    tx.add(
      await program.methods
        .register(
          warId,
          Array.from(commitment),
          Array.from(githubHash),
          leafIndex
        )
        .accounts({
          payer: userKeypair.publicKey,
          config: configPda,
          war: warPda(warId),
          censusEntry: cpda,
          censusLeaf: clda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(tx, [userKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("6003");
    }
  });

  // ────────────────────────────────────────────────
  // (c-alt) register with INVALID Ed25519 (tampered message)
  // ────────────────────────────────────────────────
  it("NEGATIVE: register rejects tampered message", async () => {
    const warId = new anchor.BN(1);
    const commitment = Buffer.alloc(32, 0xef);
    const githubId = "carol";
    const githubHash = sha256(githubId);
    const leafIndex = new anchor.BN(11); // unique: see note above

    const message = Buffer.concat([
      commitment,
      Buffer.from(githubHash),
      makeWarIdLe(warId),
      makeU64Le(leafIndex),
    ]);

    const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: attestorKeypair.secretKey,
      message,
    });

    const tamperedCommitment = Buffer.alloc(32, 0xfe);

    const cpda = censusPda(warId, githubHash);
    const clda = censusLeafPda(warId, leafIndex);

    const tx = new Transaction();
    tx.add(ed25519Ix);
    tx.add(
      await program.methods
        .register(
          warId,
          Array.from(tamperedCommitment),
          Array.from(githubHash),
          leafIndex
        )
        .accounts({
          payer: userKeypair.publicKey,
          config: configPda,
          war: warPda(warId),
          censusEntry: cpda,
          censusLeaf: clda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(tx, [userKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("6003");
    }
  });

  // ────────────────────────────────────────────────
  // (d) register DUPLICATE (same war_id + github_hash)
  // ────────────────────────────────────────────────
  it("NEGATIVE: duplicate register (same war_id+github_hash) is rejected", async () => {
    const warId = new anchor.BN(1);
    const commitment = Buffer.alloc(32, 0xab);
    const githubId = "alice";
    const githubHash = sha256(githubId);
    const leafIndex = new anchor.BN(0);

    const message = Buffer.concat([
      commitment,
      Buffer.from(githubHash),
      makeWarIdLe(warId),
      makeU64Le(leafIndex),
    ]);

    const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: attestorKeypair.secretKey,
      message,
    });

    const cpda = censusPda(warId, githubHash);
    const clda = censusLeafPda(warId, leafIndex);

    const tx = new Transaction();
    tx.add(ed25519Ix);
    tx.add(
      await program.methods
        .register(
          warId,
          Array.from(commitment),
          Array.from(githubHash),
          leafIndex
        )
        .accounts({
          payer: userKeypair.publicKey,
          config: configPda,
          war: warPda(warId),
          censusEntry: cpda,
          censusLeaf: clda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(tx, [userKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("already in use");
    }
  });

  // ────────────────────────────────────────────────
  // (d2) register with Ed25519 non-0xFFFF instruction_index (bypass attack)
  // ────────────────────────────────────────────────
  it("NEGATIVE: register rejects Ed25519 ix with non-0xFFFF instruction_index", async () => {
    const warId = new anchor.BN(1);
    const commitment = Buffer.alloc(32, 0x99);
    const githubId = "eve";
    const githubHash = sha256(githubId);
    const leafIndex = new anchor.BN(12); // unique: see note above

    const message = Buffer.concat([
      commitment,
      Buffer.from(githubHash),
      makeWarIdLe(warId),
      makeU64Le(leafIndex),
    ]);

    // Build a normal Ed25519 instruction signed by the attestor
    const normalIx = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: attestorKeypair.secretKey,
      message,
    });

    // Extract offsets and data from the normal instruction
    const nData = normalIx.data;
    const sigOffset = nData.readUInt16LE(2);
    const pkOffset = nData.readUInt16LE(6);
    const msgOffset = nData.readUInt16LE(10);
    const msgSize = nData.readUInt16LE(12);

    const signature = nData.subarray(sigOffset, sigOffset + 64);
    const pubkey = nData.subarray(pkOffset, pkOffset + 32);
    const msg = nData.subarray(msgOffset, msgOffset + msgSize);

    // Rebuild with signature_instruction_index = 0 instead of 0xFFFF
    const maliciousData = Buffer.alloc(msgOffset + msgSize);
    maliciousData.writeUInt8(1, 0);
    maliciousData.writeUInt8(0, 1);
    maliciousData.writeUInt16LE(sigOffset, 2);
    maliciousData.writeUInt16LE(0, 4); // MALICIOUS: 0 instead of 0xFFFF
    maliciousData.writeUInt16LE(pkOffset, 6);
    maliciousData.writeUInt16LE(0xffff, 8);
    maliciousData.writeUInt16LE(msgOffset, 10);
    maliciousData.writeUInt16LE(msgSize, 12);
    maliciousData.writeUInt16LE(0xffff, 14);
    maliciousData.set(signature, sigOffset);
    maliciousData.set(pubkey, pkOffset);
    maliciousData.set(msg, msgOffset);

    const maliciousIx = new TransactionInstruction({
      keys: [],
      programId: Ed25519Program.programId,
      data: maliciousData,
    });

    const cpda = censusPda(warId, githubHash);
    const clda = censusLeafPda(warId, leafIndex);

    const tx = new Transaction();
    tx.add(maliciousIx);
    tx.add(
      await program.methods
        .register(
          warId,
          Array.from(commitment),
          Array.from(githubHash),
          leafIndex
        )
        .accounts({
          payer: userKeypair.publicKey,
          config: configPda,
          war: warPda(warId),
          censusEntry: cpda,
          censusLeaf: clda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(tx, [userKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("6003");
    }
  });

  // ────────────────────────────────────────────────
  // (d3) register duplicate leaf_index (same war_id+leaf_index, different github_hash)
  // ────────────────────────────────────────────────
  it("NEGATIVE: register rejects duplicate leaf_index (same war_id+leaf_index, different github_hash)", async () => {
    const warId = new anchor.BN(1);
    const leafIndex = new anchor.BN(42);

    // First registration: userA, leaf_index=42
    const commitmentA = Buffer.alloc(32, 0x11);
    const githubHashA = sha256("userA");
    const msgA = Buffer.concat([
      commitmentA,
      Buffer.from(githubHashA),
      makeWarIdLe(warId),
      makeU64Le(leafIndex),
    ]);
    const ed25519IxA = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: attestorKeypair.secretKey,
      message: msgA,
    });
    const cpdaA = censusPda(warId, githubHashA);
    const cldaA = censusLeafPda(warId, leafIndex);

    const txA = new Transaction();
    txA.add(ed25519IxA);
    txA.add(
      await program.methods
        .register(
          warId,
          Array.from(commitmentA),
          Array.from(githubHashA),
          leafIndex
        )
        .accounts({
          payer: userKeypair.publicKey,
          config: configPda,
          war: warPda(warId),
          censusEntry: cpdaA,
          censusLeaf: cldaA,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    const sigA = await provider.sendAndConfirm(txA, [userKeypair]);
    console.log("  first register tx:", sigA);

    // Second registration: userB, SAME leaf_index=42 → must be rejected
    const commitmentB = Buffer.alloc(32, 0x22);
    const githubHashB = sha256("userB");
    const msgB = Buffer.concat([
      commitmentB,
      Buffer.from(githubHashB),
      makeWarIdLe(warId),
      makeU64Le(leafIndex),
    ]);
    const ed25519IxB = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: attestorKeypair.secretKey,
      message: msgB,
    });
    const cpdaB = censusPda(warId, githubHashB);
    const cldaB = censusLeafPda(warId, leafIndex); // same PDA as cldaA

    const txB = new Transaction();
    txB.add(ed25519IxB);
    txB.add(
      await program.methods
        .register(
          warId,
          Array.from(commitmentB),
          Array.from(githubHashB),
          leafIndex
        )
        .accounts({
          payer: userKeypair.publicKey,
          config: configPda,
          war: warPda(warId),
          censusEntry: cpdaB,
          censusLeaf: cldaB,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(txB, [userKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("already in use");
    }
  });

  // ────────────────────────────────────────────────
  // (e) close_war: rejected before closes_at, accepted after
  // ────────────────────────────────────────────────
  it("NEGATIVE: close_war before closes_at is rejected", async () => {
    const warId = new anchor.BN(2);
    const now = Math.floor(Date.now() / 1000);
    const opensAt = new anchor.BN(now);
    const closesAt = new anchor.BN(now + 3600);

    const wpda = warPda(warId);

    const tx = new Transaction();
    tx.add(
      await program.methods
        .createWar(warId, "Future War", "A", "B", opensAt, closesAt)
        .accounts({
          config: configPda,
          war: wpda,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    await provider.sendAndConfirm(tx);

    const closeTx = new Transaction();
    closeTx.add(
      await program.methods
        .closeWar(warId)
        .accounts({
          war: wpda,
          closer: userKeypair.publicKey,
        })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(closeTx, [userKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("6002");
    }
  });

  it("POSITIVE: close_war after closes_at is accepted", async () => {
    const warId = new anchor.BN(3);
    const now = Math.floor(Date.now() / 1000);
    const opensAt = new anchor.BN(now - 100);
    const closesAt = new anchor.BN(now - 1);

    const wpda = warPda(warId);

    const tx = new Transaction();
    tx.add(
      await program.methods
        .createWar(warId, "Past War", "C", "D", opensAt, closesAt)
        .accounts({
          config: configPda,
          war: wpda,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    await provider.sendAndConfirm(tx);

    const closeTx = new Transaction();
    closeTx.add(
      await program.methods
        .closeWar(warId)
        .accounts({
          war: wpda,
          closer: userKeypair.publicKey,
        })
        .instruction()
    );

    const sig = await provider.sendAndConfirm(closeTx, [userKeypair]);
    console.log("  tx:", sig);

    const war = await program.account.war.fetch(wpda);
    expect(war.status).to.have.property("closed");
  });

  it("NEGATIVE: close already closed war is rejected", async () => {
    const warId = new anchor.BN(3);

    const closeTx = new Transaction();
    closeTx.add(
      await program.methods
        .closeWar(warId)
        .accounts({
          war: warPda(warId),
          closer: userKeypair.publicKey,
        })
        .instruction()
    );

    try {
      await provider.sendAndConfirm(closeTx, [userKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      console.log("  error:", err.toString().slice(0, 200));
      expect(err.toString()).to.include("6004");
    }
  });
});
