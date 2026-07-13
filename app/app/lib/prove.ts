"use client";
// In-browser Groth16 proof generation. Loads the exact vote.wasm + vote_final.zkey served
// from /zk/ (bytes proven on-chain, vkey-diff gated at commit), runs snarkjs, self-verifies,
// then serializes to the relayer's on-chain byte format (INV-10). The voter's wallet never
// touches this — the relayer submits it.
import * as snarkjs from "snarkjs";
import { serializeProof, type SerializedVote } from "./serialize";

export const DOMAIN_VOTE = 1448039493n; // ASCII "VOTE"

export interface VoteWitness {
  // private
  trapdoor: string;
  nullifier_seed: string;
  weight_a: number;
  weight_b: number;
  merkle_path: string[]; // 20 decimal strings
  path_indices: number[]; // 20 x 0|1
  // public
  root: string; // decimal
  nullifier_hash: string; // decimal
  war_id: number;
  side: number; // 0 | 1
  weight: number; // side==0 ? weight_a : weight_b
}

export interface ProveResult extends SerializedVote {
  publicSignalsDecimal: string[];
}

const WASM_URL = "/zk/vote.wasm";
const ZKEY_URL = "/zk/vote_final.zkey";
const VKEY_URL = "/zk/verification_key.json";

export async function generateVoteProof(w: VoteWitness): Promise<ProveResult> {
  const input = {
    trapdoor: w.trapdoor,
    nullifier_seed: w.nullifier_seed,
    weight_a: String(w.weight_a),
    weight_b: String(w.weight_b),
    merkle_path: w.merkle_path,
    path_indices: w.path_indices.map(String),
    root: w.root,
    nullifier_hash: w.nullifier_hash,
    war_id: String(w.war_id),
    side: String(w.side),
    weight: String(w.weight),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    WASM_URL,
    ZKEY_URL,
  );

  // Self-verify before we ask a relayer to pay for a tx that would just revert.
  const vkey = await (await fetch(VKEY_URL)).json();
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("local proof verification failed — not relaying");

  const serialized = serializeProof(
    proof as unknown as { pi_a: string[]; pi_b: string[][]; pi_c: string[] },
    publicSignals as string[],
  );
  return { ...serialized, publicSignalsDecimal: publicSignals as string[] };
}
