import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  sendAndConfirmTransaction,
  type TransactionSignature,
  type Signer,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import { readFileSync } from "fs";
import { createHash } from "crypto";

// ── BN254 field order ──
export const BN254_R =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// ── Anchor discriminator for register ──
// SHA256("global:register")[0:8]
function computeDiscriminator(name: string): Buffer {
  return createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

export const REGISTER_DISCRIMINATOR = computeDiscriminator("register");
export const POST_ROOT_DISCRIMINATOR = computeDiscriminator("post_root");

export interface SolanaConfig {
  rpcUrl: string;
  programId: string;
  keypairPath: string;
}

export class SolanaClient {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly attestor: Keypair;

  constructor(config: SolanaConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.programId = new PublicKey(config.programId);

    const raw = JSON.parse(readFileSync(config.keypairPath, "utf-8")) as number[];
    this.attestor = Keypair.fromSecretKey(Uint8Array.from(raw));
  }

  getAttestorPubkey(): PublicKey {
    return this.attestor.publicKey;
  }

  getAttestorSecretKey(): Uint8Array {
    return this.attestor.secretKey;
  }

  // ── PDA derivation ──

  deriveConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      this.programId,
    );
  }

  deriveWarPda(warId: number): [PublicKey, number] {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(warId));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("war"), buf],
      this.programId,
    );
  }

  deriveCensusEntryPda(
    warId: number,
    githubHash: Buffer,
  ): [PublicKey, number] {
    const warIdBuf = Buffer.alloc(8);
    warIdBuf.writeBigUInt64LE(BigInt(warId));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("census"), warIdBuf, githubHash],
      this.programId,
    );
  }

  deriveCensusLeafPda(
    warId: number,
    leafIndex: number,
  ): [PublicKey, number] {
    const warIdBuf = Buffer.alloc(8);
    warIdBuf.writeBigUInt64LE(BigInt(warId));
    const leafBuf = Buffer.alloc(8);
    leafBuf.writeBigUInt64LE(BigInt(leafIndex));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("census_leaf"), warIdBuf, leafBuf],
      this.programId,
    );
  }

  // ── Check if CensusEntry exists ──

  async censusEntryExists(
    warId: number,
    githubHash: Buffer,
  ): Promise<boolean> {
    const [pda] = this.deriveCensusEntryPda(warId, githubHash);
    const account = await this.connection.getAccountInfo(pda);
    return account !== null;
  }

  // ── Build & send register transaction ──

  async buildAndSendRegisterTx(params: {
    warId: number;
    commitment: bigint;
    githubHash: string;
    leafIndex: number;
    message: Buffer;
    signature: Uint8Array;
  }): Promise<TransactionSignature> {
    const {
      warId,
      commitment,
      githubHash,
      leafIndex,
      message,
      signature,
    } = params;

    const [configPda] = this.deriveConfigPda();
    const [warPda] = this.deriveWarPda(warId);
    const ghBytes = Buffer.from(githubHash, "hex");
    const [censusEntryPda] = this.deriveCensusEntryPda(warId, ghBytes);
    const [censusLeafPda] = this.deriveCensusLeafPda(warId, leafIndex);

    // 1. Ed25519 instruction
    const ed25519Ix = this.buildEd25519Instruction(
      this.attestor.publicKey.toBytes(),
      message,
      signature,
    );

    // 2. Register instruction
    const registerIx = this.buildRegisterInstruction({
      payer: this.attestor.publicKey,
      configPda,
      warPda,
      censusEntryPda,
      censusLeafPda,
      warId,
      commitment,
      githubHash,
      leafIndex,
    });

    const tx = new Transaction().add(ed25519Ix, registerIx);
    tx.feePayer = this.attestor.publicKey;

    const latestBlockhash = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;

    return sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.attestor],
      { commitment: "confirmed" },
    );
  }

  // ── Post root ──

  async postRoot(
    warId: number,
    root: bigint,
  ): Promise<TransactionSignature> {
    const [configPda] = this.deriveConfigPda();
    const [warPda] = this.deriveWarPda(warId);

    const rootBytes = Buffer.alloc(32);
    const hex = root.toString(16).padStart(64, "0");
    Buffer.from(hex, "hex").copy(rootBytes);

    const data = Buffer.alloc(8 + 8 + 32);
    POST_ROOT_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(BigInt(warId), 8);
    rootBytes.copy(data, 16);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: warPda, isSigner: false, isWritable: true },
        {
          pubkey: this.attestor.publicKey,
          isSigner: true,
          isWritable: false,
        },
      ],
      programId: this.programId,
      data,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = this.attestor.publicKey;

    const latestBlockhash = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;

    return sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.attestor],
      { commitment: "confirmed" },
    );
  }

  // ── Private helpers ──

  private buildEd25519Instruction(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array,
  ): TransactionInstruction {
    const sigOffset = 16;
    const pkOffset = sigOffset + 64;
    const msgOffset = pkOffset + 32;
    const msgSize = message.length;

    const data = Buffer.alloc(msgOffset + msgSize);
    data[0] = 1; // num_signatures
    data[1] = 0; // padding
    data.writeUInt16LE(sigOffset, 2);
    // signature_instruction_index = 0xFFFF
    data.writeUInt16LE(0xffff, 4);
    data.writeUInt16LE(pkOffset, 6);
    // public_key_instruction_index = 0xFFFF
    data.writeUInt16LE(0xffff, 8);
    data.writeUInt16LE(msgOffset, 10);
    data.writeUInt16LE(msgSize, 12);
    // message_instruction_index = 0xFFFF
    data.writeUInt16LE(0xffff, 14);

    Buffer.from(signature).copy(data, sigOffset);
    Buffer.from(publicKey).copy(data, pkOffset);
    Buffer.from(message).copy(data, msgOffset);

    return new TransactionInstruction({
      keys: [],
      programId: Ed25519Program.programId,
      data,
    });
  }

  private buildRegisterInstruction(params: {
    payer: PublicKey;
    configPda: PublicKey;
    warPda: PublicKey;
    censusEntryPda: PublicKey;
    censusLeafPda: PublicKey;
    warId: number;
    commitment: bigint;
    githubHash: string;
    leafIndex: number;
  }): TransactionInstruction {
    const {
      payer,
      configPda,
      warPda,
      censusEntryPda,
      censusLeafPda,
      warId,
      commitment,
      githubHash,
      leafIndex,
    } = params;

    const commitmentBytes = Buffer.alloc(32);
    const ch = commitment.toString(16).padStart(64, "0");
    Buffer.from(ch, "hex").copy(commitmentBytes);

    const ghBytes = Buffer.from(githubHash, "hex");

    // Borsh serialization: discriminator(8) + war_id(u64LE) + commitment(32) + github_hash(32) + leaf_index(u64LE)
    const data = Buffer.alloc(8 + 8 + 32 + 32 + 8);
    REGISTER_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(BigInt(warId), 8);
    commitmentBytes.copy(data, 16);
    ghBytes.copy(data, 48);
    data.writeBigUInt64LE(BigInt(leafIndex), 80);

    return new TransactionInstruction({
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: warPda, isSigner: false, isWritable: true },
        { pubkey: censusEntryPda, isSigner: false, isWritable: true },
        { pubkey: censusLeafPda, isSigner: false, isWritable: true },
        {
          pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
      programId: this.programId,
      data,
    });
  }

  signMessage(message: Buffer): Uint8Array {
    return nacl.sign.detached(
      new Uint8Array(message),
      this.attestor.secretKey,
    );
  }

  static signDetached(
    message: Buffer,
    secretKey: Uint8Array,
  ): Uint8Array {
    return nacl.sign.detached(new Uint8Array(message), secretKey);
  }
}
