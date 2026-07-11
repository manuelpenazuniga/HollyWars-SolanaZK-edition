/**
 * e2e-devnet.ts — full on-chain flow against the DEPLOYED devnet program:
 *   register (attestor Ed25519) → post_root → vote (real Groth16 proof) → tally check.
 *
 * Proves SPEC §10: "a Groth16 proof verified on-chain in devnet". Bypasses the browser
 * OAuth (a client onboarding step); uses a synthetic github id + the attestor keypair to
 * exercise the on-chain census + ZK vote path end-to-end.
 *
 * Run: HELIUS_DEVNET_RPC=... npx ts-node scripts/e2e-devnet.ts
 * Prereqs: circuits/build/{vote_final.zkey, vote_js/vote.wasm}, target/idl/holy_wars.json,
 *          .keys/{authority,relayer}.json, deployed-devnet.json.
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  Ed25519Program, ComputeBudgetProgram, SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const RPC = process.env.HELIUS_DEVNET_RPC || require("fs").readFileSync(".env", "utf8").split("\n").find((l: string) => l.startsWith("HELIUS_DEVNET_RPC="))!.slice("HELIUS_DEVNET_RPC=".length).trim();
const deployed = JSON.parse(fs.readFileSync("deployed-devnet.json", "utf8"));
const PROGRAM_ID = new PublicKey(deployed.programId);
const WAR_ID = 1;
const DOMAIN_VOTE = 1448039493n;
const BUILD = path.join("circuits", "build");

function loadKp(p: string): Keypair {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(p, "utf8"))));
}
function feBE32(x: bigint): Buffer { return Buffer.from(x.toString(16).padStart(64, "0"), "hex"); }
function u64LE(n: number | bigint): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
function githubHash(id: string): Buffer { return createHash("sha256").update("hw-census-v1:" + id).digest(); }

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const authority = loadKp(".keys/authority.json"); // == Config.attestor_pubkey
  const relayer = loadKp(".keys/relayer.json");
  const idl = JSON.parse(fs.readFileSync("target/idl/holy_wars.json", "utf8"));
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);

  // ── secrets + census leaf (circuit-consistent) ──
  const { buildPoseidon } = require("circomlibjs");
  const P = await buildPoseidon();
  const F = P.F;
  const pos = (a: bigint[]) => BigInt(F.toString(P(a)));
  const SEED = 111222333444555666777n, TRAP = 999888777666555444333n;
  const WA = 2n, WB = 3n, SIDE = 0n, WEIGHT = SIDE === 0n ? WA : WB;
  const githubId = "42424242";
  const gh = githubHash(githubId);
  const inner = pos([SEED, TRAP]);
  const commitment = pos([inner, WA, WB]);            // == circuit leaf
  const nullifier = pos([SEED, BigInt(WAR_ID), DOMAIN_VOTE]);
  const LEAF_INDEX = 0;

  // ── Merkle tree depth-20, our leaf at index 0 ──
  const DEPTH = 20;
  const zeros = [pos([0n, 0n])];
  for (let i = 1; i <= DEPTH; i++) zeros[i] = pos([zeros[i - 1], zeros[i - 1]]);
  const merklePath: bigint[] = [], pathIndices: number[] = [];
  let cur = commitment;
  for (let i = 0; i < DEPTH; i++) { merklePath.push(zeros[i]); pathIndices.push(0); cur = pos([cur, zeros[i]]); }
  const root = cur;
  console.log("leaf/commitment:", commitment.toString());
  console.log("root:", root.toString());

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const [warPda] = PublicKey.findProgramAddressSync([Buffer.from("war"), u64LE(WAR_ID)], PROGRAM_ID);
  const [censusPda] = PublicKey.findProgramAddressSync([Buffer.from("census"), u64LE(WAR_ID), gh], PROGRAM_ID);
  const [leafPda] = PublicKey.findProgramAddressSync([Buffer.from("census_leaf"), u64LE(WAR_ID), u64LE(LEAF_INDEX)], PROGRAM_ID);

  // skip register if this census entry already exists (idempotent reruns)
  const already = await connection.getAccountInfo(censusPda);
  if (!already) {
    // ── 1. register (attestor Ed25519 over the 80-byte message) ──
    const msg = Buffer.concat([feBE32(commitment), gh, u64LE(WAR_ID), u64LE(LEAF_INDEX)]); // 80 bytes
    const nacl = require("tweetnacl");
    const sig = nacl.sign.detached(msg, authority.secretKey);
    const edIx = Ed25519Program.createInstructionWithPublicKey({ publicKey: authority.publicKey.toBytes(), message: msg, signature: sig });
    const regIx = await program.methods
      .register(new anchor.BN(WAR_ID), Array.from(feBE32(commitment)), Array.from(gh), new anchor.BN(LEAF_INDEX))
      .accounts({ payer: authority.publicKey, config: configPda, war: warPda, censusEntry: censusPda, censusLeaf: leafPda, instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY, systemProgram: SystemProgram.programId })
      .instruction();
    const rtx = new Transaction().add(edIx).add(regIx);
    const rsig = await provider.sendAndConfirm(rtx, [authority]);
    console.log("✓ register tx:", rsig);
  } else console.log("census entry exists, skipping register");

  // ── 2. post_root ──
  const prootSig = await program.methods.postRoot(new anchor.BN(WAR_ID), Array.from(feBE32(root)))
    .accounts({ config: configPda, war: warPda, attestor: authority.publicKey }).signers([authority]).rpc();
  console.log("✓ post_root tx:", prootSig);

  // ── 3. generate Groth16 proof (snarkjs) ──
  const input = {
    trapdoor: TRAP.toString(), nullifier_seed: SEED.toString(), weight_a: WA.toString(), weight_b: WB.toString(),
    merkle_path: merklePath.map(String), path_indices: pathIndices.map(String),
    root: root.toString(), nullifier_hash: nullifier.toString(), war_id: WAR_ID.toString(), side: SIDE.toString(), weight: WEIGHT.toString(),
  };
  fs.writeFileSync(path.join(BUILD, "e2e_input.json"), JSON.stringify(input));
  execSync(`npx snarkjs groth16 fullprove "${BUILD}/e2e_input.json" "${BUILD}/vote_js/vote.wasm" "${BUILD}/vote_final.zkey" "${BUILD}/e2e_proof.json" "${BUILD}/e2e_public.json"`, { stdio: "inherit" });
  const proof = JSON.parse(fs.readFileSync(path.join(BUILD, "e2e_proof.json"), "utf8"));
  const publicSignals: string[] = JSON.parse(fs.readFileSync(path.join(BUILD, "e2e_public.json"), "utf8"));

  // ── 4. serialize proof (INV-10: negate A, G2 Fp2 swap c1,c0, big-endian) ──
  const Fq = BigInt("0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47");
  const be = (dec: string) => feBE32(BigInt(dec));
  const negY = (dec: string) => feBE32(Fq - (BigInt(dec) % Fq));
  const proofA = Buffer.concat([be(proof.pi_a[0]), negY(proof.pi_a[1])]);                                   // -A
  const proofB = Buffer.concat([be(proof.pi_b[0][1]), be(proof.pi_b[0][0]), be(proof.pi_b[1][1]), be(proof.pi_b[1][0])]); // G2 swap
  const proofC = Buffer.concat([be(proof.pi_c[0]), be(proof.pi_c[1])]);
  const publicInputs = publicSignals.map((s) => Array.from(be(s)));
  const nullifierHashBE = be(publicSignals[1]);

  // ── 5. vote (relayer pays; ComputeBudget + heap frame) ──
  const [nullPda] = PublicKey.findProgramAddressSync([Buffer.from("null"), u64LE(WAR_ID), nullifierHashBE], PROGRAM_ID);
  const voteIx = await program.methods
    .vote(new anchor.BN(WAR_ID), Array.from(nullifierHashBE), Array.from(proofA), Array.from(proofB), Array.from(proofC), publicInputs, "e2e: rust forever")
    .accounts({ voter: relayer.publicKey, war: warPda, nullifier: nullPda, systemProgram: SystemProgram.programId })
    .instruction();
  const vtx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }))
    .add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }))
    .add(voteIx);
  const vsig = await (new anchor.AnchorProvider(connection, new anchor.Wallet(relayer), { commitment: "confirmed" })).sendAndConfirm(vtx, [relayer]);
  console.log("✓ VOTE tx:", vsig);
  console.log("  Explorer: https://explorer.solana.com/tx/" + vsig + "?cluster=devnet");

  // ── 6. tally ──
  const war: any = await program.account.war.fetch(warPda);
  console.log(`✓ tally_a=${war.tallyA} tally_b=${war.tallyB} (voted side ${SIDE}, weight ${WEIGHT})`);
  console.log("\n🎉 END-TO-END ON DEVNET: census → attested register → Groth16 vote verified on-chain.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
