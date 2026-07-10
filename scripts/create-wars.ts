/**
 * create-wars.ts — initialize Config + create the 3 launch wars.
 *
 * Prereqs: the holy-wars program deployed to the target cluster, an IDL at
 * target/idl/holy_wars.json, and ANCHOR_PROVIDER_URL / ANCHOR_WALLET set (or a
 * default `anchor` provider). Run: `npx ts-node scripts/create-wars.ts`.
 *
 * Attestor pubkey: pass ATTESTOR_PUBKEY env (base58) or defaults to the wallet
 * (fine for a first bring-up; the real attestor keypair replaces it later).
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const WARS = [
  { id: 1, topic: "Tabs vs Spaces", a: "Tabs", b: "Spaces" },
  { id: 2, topic: "Vim vs Emacs", a: "Vim", b: "Emacs" },
  { id: 3, topic: "Dark vs Light mode", a: "Dark", b: "Light" },
];

// Wars stay open until after the challenge deadline so the "war is still open" CTA holds.
const OPENS_AT = Math.floor(Date.now() / 1000) - 60;
const CLOSES_AT = Math.floor(new Date("2026-07-20T00:00:00Z").getTime() / 1000);

function le8(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.HolyWars as anchor.Program;
  const authority = provider.wallet.publicKey;
  const attestor = process.env.ATTESTOR_PUBKEY ? new PublicKey(process.env.ATTESTOR_PUBKEY) : authority;

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

  // initialize (idempotent-ish: skip if Config already exists)
  const existing = await provider.connection.getAccountInfo(configPda);
  if (!existing) {
    await program.methods.initialize(attestor).accounts({
      config: configPda, authority, systemProgram: SystemProgram.programId,
    }).rpc();
    console.log("initialized config; attestor =", attestor.toBase58());
  } else {
    console.log("config already exists, skipping initialize");
  }

  for (const w of WARS) {
    const [warPda] = PublicKey.findProgramAddressSync([Buffer.from("war"), le8(w.id)], program.programId);
    const has = await provider.connection.getAccountInfo(warPda);
    if (has) { console.log(`war ${w.id} (${w.topic}) already exists, skipping`); continue; }
    await program.methods.createWar(
      new anchor.BN(w.id), w.topic, w.a, w.b, new anchor.BN(OPENS_AT), new anchor.BN(CLOSES_AT),
    ).accounts({ config: configPda, war: warPda, authority, systemProgram: SystemProgram.programId }).rpc();
    console.log(`created war ${w.id}: ${w.topic} (${w.a} vs ${w.b}) → ${warPda.toBase58()}`);
  }
  console.log("done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
