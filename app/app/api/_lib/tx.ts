import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { createHash } from "crypto";
import { hexToBytes, nullifierPda, warPda } from "./precheck";
import type { KeypairLike, VoteRequest, WarAccountData } from "./types";

const SET_COMPUTE_UNITS = 1_400_000;
const HEAP_FRAME_BYTES = 262_144;

function computeDiscriminator(name: string): Buffer {
  return createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

const VOTE_DISCRIMINATOR = computeDiscriminator("vote");

export function buildVoteTransaction(
  relayer: KeypairLike,
  programId: PublicKey,
  input: VoteRequest & { warId: number },
  _war: WarAccountData,
): Transaction {
  const warKey = warPda(programId, input.warId);
  const nullKey = nullifierPda(programId, input.warId, hexToBytes(input.nullifier_hash));

  const setCULimit = ComputeBudgetProgram.setComputeUnitLimit({
    units: SET_COMPUTE_UNITS,
  });
  const requestHeap = ComputeBudgetProgram.requestHeapFrame({
    bytes: HEAP_FRAME_BYTES,
  });

  const proofA = hexToBytes(input.proof.a);
  const proofB = hexToBytes(input.proof.b);
  const proofC = hexToBytes(input.proof.c);
  const publicInputs = input.public_inputs.map((h) => hexToBytes(h));
  const nullifierHash = hexToBytes(input.nullifier_hash);
  const battleCry = input.battle_cry ?? "";
  const battleCryBytes = Buffer.from(battleCry, "utf8");

  const warIdBytes = new BN(input.warId).toArrayLike(Buffer as any, "le", 8) as Buffer;

  const data = Buffer.alloc(
    8 + 8 + 32 + 64 + 128 + 64 + 5 * 32 + 4 + battleCryBytes.length,
  );
  let offset = 0;

  VOTE_DISCRIMINATOR.copy(data, offset);
  offset += 8;

  warIdBytes.copy(data, offset);
  offset += 8;

  Buffer.from(nullifierHash).copy(data, offset);
  offset += 32;

  Buffer.from(proofA).copy(data, offset);
  offset += 64;

  Buffer.from(proofB).copy(data, offset);
  offset += 128;

  Buffer.from(proofC).copy(data, offset);
  offset += 64;

  for (const pi of publicInputs) {
    Buffer.from(pi).copy(data, offset);
    offset += 32;
  }

  data.writeUInt32LE(battleCryBytes.length, offset);
  offset += 4;
  battleCryBytes.copy(data, offset);

  const voteIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: relayer.publicKey as PublicKey, isSigner: true, isWritable: true },
      { pubkey: warKey, isSigner: false, isWritable: true },
      { pubkey: nullKey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction();
  tx.add(setCULimit);
  tx.add(requestHeap);
  tx.add(voteIx);
  tx.feePayer = relayer.publicKey as PublicKey;
  return tx;
}

export const RELAYER_TX_CONSTANTS = {
  computeUnits: SET_COMPUTE_UNITS,
  heapFrameBytes: HEAP_FRAME_BYTES,
} as const;
