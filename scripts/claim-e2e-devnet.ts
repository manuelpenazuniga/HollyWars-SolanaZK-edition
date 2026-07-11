/**
 * claim-e2e-devnet.ts — anonymous medal claim against the DEPLOYED devnet program.
 *   (same census leaf as the vote) → medal.circom proof (DOMAIN_MEDAL) → claim_medal.
 *
 * Proves SPEC §3.2 circuit-2: a SECOND Groth16 proof, verified on-chain, whose nullifier
 * is unlinkable to the vote nullifier (different domain). The medal lands on a fresh wallet
 * the veteran chooses (leaf_owner), uncorrelatable to how they voted.
 *
 * Run: npx ts-node scripts/claim-e2e-devnet.ts
 * Prereqs: circuits/build/{medal_final.zkey, medal_js/medal.wasm}, target/idl/holy_wars.json,
 *          .keys/{authority,relayer}.json, deployed-devnet.json, war 1 census root posted.
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram,
} from "@solana/web3.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const RPC = process.env.HELIUS_DEVNET_RPC || fs.readFileSync(".env", "utf8").split("\n").find((l) => l.startsWith("HELIUS_DEVNET_RPC="))!.slice("HELIUS_DEVNET_RPC=".length).trim();
const deployed = JSON.parse(fs.readFileSync("deployed-devnet.json", "utf8"));
const PROGRAM_ID = new PublicKey(deployed.programId);
const WAR_ID = 1;
const DOMAIN_MEDAL = 1296385100n; // ASCII "MEDL" — must differ from DOMAIN_VOTE
const BUILD = path.join("circuits", "build");

function loadKp(p: string): Keypair { return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(p, "utf8")))); }
function feBE32(x: bigint): Buffer { return Buffer.from(x.toString(16).padStart(64, "0"), "hex"); }
function u64LE(n: number | bigint): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const relayer = loadKp(".keys/relayer.json");            // pays the claim tx
  const leafOwner = Keypair.generate();                    // fresh anonymous medal recipient
  const idl = JSON.parse(fs.readFileSync("target/idl/holy_wars.json", "utf8"));
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(relayer), { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);

  // ── same census leaf as the vote e2e (SPEC: same identity, different domain) ──
  const { buildPoseidon } = require("circomlibjs");
  const P = await buildPoseidon(); const F = P.F;
  const pos = (a: bigint[]) => BigInt(F.toString(P(a)));
  const SEED = 111222333444555666777n, TRAP = 999888777666555444333n;
  const WA = 2n, WB = 3n;
  const inner = pos([SEED, TRAP]);
  const commitment = pos([inner, WA, WB]);
  const medalNullifier = pos([SEED, BigInt(WAR_ID), DOMAIN_MEDAL]);
  const LEAF_INDEX = 0;

  // ── Merkle tree depth-20, our leaf at index 0 (identical to vote e2e) ──
  const DEPTH = 20;
  const zeros = [pos([0n, 0n])];
  for (let i = 1; i <= DEPTH; i++) zeros[i] = pos([zeros[i - 1], zeros[i - 1]]);
  const merklePath: bigint[] = [], pathIndices: number[] = [];
  let cur = commitment;
  for (let i = 0; i < DEPTH; i++) { merklePath.push(zeros[i]); pathIndices.push(0); cur = pos([cur, zeros[i]]); }
  const root = cur;

  const [warPda] = PublicKey.findProgramAddressSync([Buffer.from("war"), u64LE(WAR_ID)], PROGRAM_ID);
  const war: any = await program.account.war.fetch(warPda);
  const onchainRoot = Buffer.from(war.censusRoot).toString("hex");
  console.log("computed root:", root.toString(16).padStart(64, "0"));
  console.log("on-chain root:", onchainRoot);
  if (root.toString(16).padStart(64, "0") !== onchainRoot) throw new Error("census root mismatch — post_root war 1 first");

  // ── generate medal Groth16 proof ──
  const input = {
    trapdoor: TRAP.toString(), nullifier_seed: SEED.toString(), weight_a: WA.toString(), weight_b: WB.toString(),
    merkle_path: merklePath.map(String), path_indices: pathIndices.map(String),
    root: root.toString(), medal_nullifier_hash: medalNullifier.toString(), war_id: WAR_ID.toString(),
  };
  fs.writeFileSync(path.join(BUILD, "medal_e2e_input.json"), JSON.stringify(input));
  execSync(`npx snarkjs groth16 fullprove "${BUILD}/medal_e2e_input.json" "${BUILD}/medal_js/medal.wasm" "${BUILD}/medal_final.zkey" "${BUILD}/medal_e2e_proof.json" "${BUILD}/medal_e2e_public.json"`, { stdio: "inherit" });
  const proof = JSON.parse(fs.readFileSync(path.join(BUILD, "medal_e2e_proof.json"), "utf8"));
  const publicSignals: string[] = JSON.parse(fs.readFileSync(path.join(BUILD, "medal_e2e_public.json"), "utf8"));

  // ── serialize (INV-10: negate A, G2 Fp2 swap, big-endian) ──
  const Fq = BigInt("0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47");
  const be = (dec: string) => feBE32(BigInt(dec));
  const negY = (dec: string) => feBE32(Fq - (BigInt(dec) % Fq));
  const proofA = Buffer.concat([be(proof.pi_a[0]), negY(proof.pi_a[1])]);
  const proofB = Buffer.concat([be(proof.pi_b[0][1]), be(proof.pi_b[0][0]), be(proof.pi_b[1][1]), be(proof.pi_b[1][0])]);
  const proofC = Buffer.concat([be(proof.pi_c[0]), be(proof.pi_c[1])]);
  const publicInputs = publicSignals.map((s) => Array.from(be(s)));         // [root, medal_nullifier, war_id]
  const medalNullifierBE = be(publicSignals[1]);

  // ── claim_medal (relayer pays; heap frame for groth16) ──
  const [medalNullPda] = PublicKey.findProgramAddressSync([Buffer.from("medal"), u64LE(WAR_ID), medalNullifierBE], PROGRAM_ID);
  const [medalRecordPda] = PublicKey.findProgramAddressSync([Buffer.from("medal_record"), u64LE(WAR_ID), leafOwner.publicKey.toBytes()], PROGRAM_ID);

  const claimIx = await program.methods
    .claimMedal(new anchor.BN(WAR_ID), Array.from(medalNullifierBE), leafOwner.publicKey, Array.from(proofA), Array.from(proofB), Array.from(proofC), publicInputs)
    .accounts({ claimer: relayer.publicKey, war: warPda, medalNullifier: medalNullPda, medalRecord: medalRecordPda, systemProgram: SystemProgram.programId })
    .instruction();
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }))
    .add(ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 }))
    .add(claimIx);
  const sig = await provider.sendAndConfirm(tx, [relayer]);
  console.log("✓ CLAIM_MEDAL tx:", sig);
  console.log("  Explorer: https://explorer.solana.com/tx/" + sig + "?cluster=devnet");

  const rec: any = await program.account.medalRecord.fetch(medalRecordPda);
  console.log(`✓ MedalRecord: war ${rec.warId} owner ${new PublicKey(rec.owner).toBase58()} ts ${rec.timestamp}`);
  console.log("  medal recipient (anonymous):", leafOwner.publicKey.toBase58());
  console.log("\n🎖  MEDAL CLAIMED: second ZK proof (DOMAIN_MEDAL) verified on-chain, unlinkable to the vote.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
