import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { BorshInstructionCoder } from "@coral-xyz/anchor";
import BN from "bn.js";
import { VOTE_IDL, VOTE_IX_NAME } from "./idl.js";
import { hexToBytes, nullifierPda, warPda } from "./precheck.js";
import type { KeypairLike, VoteRequest, WarAccountData } from "./types.js";

const SET_COMPUTE_UNITS = 1_400_000;
const HEAP_FRAME_BYTES = 262_144;

const coder = new BorshInstructionCoder(VOTE_IDL as any);

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

  const proofA = Array.from(hexToBytes(input.proof.a));
  const proofB = Array.from(hexToBytes(input.proof.b));
  const proofC = Array.from(hexToBytes(input.proof.c));
  const publicInputs = input.public_inputs.map((h) => Array.from(hexToBytes(h))) as any;
  const nullifierHash = Array.from(hexToBytes(input.nullifier_hash));
  const battleCry = input.battle_cry ?? "";

  const data = coder.encode(VOTE_IX_NAME, {
    warId: new BN(input.warId),
    nullifierHash,
    proofA,
    proofB,
    proofC,
    publicInputs,
    battleCry,
  });
  if (!data) throw new Error("failed to encode vote instruction data");

  const voteIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: relayer.publicKey as PublicKey, isSigner: true, isWritable: true },
      { pubkey: warKey, isSigner: false, isWritable: true },
      { pubkey: nullKey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
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
