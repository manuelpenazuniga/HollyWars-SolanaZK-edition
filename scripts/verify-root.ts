#!/usr/bin/env node
/**
 * verify-root.ts — Off-chain root verification for Holy Wars census.
 *
 * Usage:
 *   node --import tsx scripts/verify-root.ts <warId>
 *
 * Reads deployed-devnet.json, connects to Solana devnet, fetches the War
 * account census_root and all CensusEntry accounts, rebuilds the Merkle tree,
 * and exits 0 on match or 1 on mismatch.
 *
 * IMPORTANT: This script connects to devnet (RPC). The orquestador provides
 * the RPC env and runs this against a live deployment.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";

import { initPoseidon, be32ToFe, MerkleTree } from "@holywars/common";

const CENSUS_DISCRIMINATOR = createHash("sha256")
  .update("account:CensusEntry")
  .digest()
  .subarray(0, 8);

function makeWarIdLe(warId: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(warId));
  return buf;
}

function parseWarCensusRoot(data: Buffer): Buffer {
  let offset = 8; // skip discriminator

  offset += 8; // war_id: u64

  // topic: String (4-byte LE length + utf-8)
  const topicLen = data.readUInt32LE(offset);
  offset += 4 + topicLen;

  // side_a: String
  const sideALen = data.readUInt32LE(offset);
  offset += 4 + sideALen;

  // side_b: String
  const sideBLen = data.readUInt32LE(offset);
  offset += 4 + sideBLen;

  offset += 8; // tally_a: u64
  offset += 8; // tally_b: u64

  return data.subarray(offset, offset + 32); // census_root: [u8; 32]
}

function parseCensusEntry(data: Buffer): {
  warId: number;
  commitment: bigint;
  leafIndex: number;
} {
  let offset = 8; // skip discriminator
  const warId = Number(data.readBigUInt64LE(offset)); // CensusEntry.war_id (first field)
  offset += 8;
  const commitment = be32ToFe(data.subarray(offset, offset + 32));
  offset += 32;
  const leafIndex = Number(data.readBigUInt64LE(offset));
  return { warId, commitment, leafIndex };
}

async function main(): Promise<void> {
  const warId = parseInt(process.argv[2], 10);
  if (isNaN(warId) || warId < 1) {
    console.error("Usage: verify-root.ts <warId>");
    console.error("  warId — numeric ID of the war to verify");
    process.exit(1);
  }

  const rpcUrl =
    process.env.RPC_URL || "https://api.devnet.solana.com";

  const deployedPath = resolve(process.cwd(), "deployed-devnet.json");
  const deployed = JSON.parse(readFileSync(deployedPath, "utf-8"));
  const programId = new PublicKey(deployed.programId);

  const connection = new Connection(rpcUrl, "confirmed");

  await initPoseidon();

  // --- Fetch War account and extract on-chain census_root ---
  const [warPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("war"), makeWarIdLe(warId)],
    programId,
  );
  const warAccount = await connection.getAccountInfo(warPda);
  if (!warAccount) {
    console.error(`War ${warId} not found at ${warPda.toBase58()}`);
    process.exit(1);
  }
  const censusRootBytes = parseWarCensusRoot(warAccount.data);
  const onChainRoot = be32ToFe(censusRootBytes);
  console.log(`War ${warId} census_root: ${onChainRoot}`);

  // --- Fetch all program accounts, filter CensusEntry client-side ---
  const allAccounts = await connection.getProgramAccounts(programId);
  const censusAccounts = allAccounts.filter((acc) =>
    acc.account.data.subarray(0, 8).equals(CENSUS_DISCRIMINATOR),
  );

  if (censusAccounts.length === 0) {
    console.warn("No CensusEntry accounts found for this program.");
    if (onChainRoot === 0n) {
      console.log("Root is zero — empty tree (expected for no entries).");
      process.exit(0);
    } else {
      console.error("Non-zero on-chain root but zero CensusEntry accounts found!");
      process.exit(1);
    }
  }

  console.log(`Found ${censusAccounts.length} CensusEntry accounts`);

  // --- Parse entries, FILTER BY WAR, sort by leaf_index ---
  // CensusEntry.war_id lets us isolate this war's leaves; without it, entries from
  // other wars would be mixed in and the reconstructed root would be corrupt.
  const entries = censusAccounts
    .map((acc) => parseCensusEntry(acc.account.data))
    .filter((e) => e.warId === warId)
    .map(({ commitment, leafIndex }) => ({ leafIndex, commitment }));

  entries.sort((a, b) => a.leafIndex - b.leafIndex);

  // Sequential indices are REQUIRED: a gap means a missing entry, so inserting the
  // remaining leaves would shift positions and produce a wrong root. Abort, don't warn.
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].leafIndex !== i) {
      console.error(
        `FAIL: non-sequential leaf index at position ${i}: expected ${i}, got ${entries[i].leafIndex} (missing entry?)`,
      );
      process.exit(1);
    }
  }

  // --- Build Merkle tree ---
  const tree = new MerkleTree();
  for (const entry of entries) {
    tree.insert(entry.commitment);
  }

  const computedRoot = tree.root();
  console.log(`Computed root: ${computedRoot}`);
  console.log(`On-chain root: ${onChainRoot}`);

  if (computedRoot !== onChainRoot) {
    console.error(`ROOT MISMATCH! Exiting with code 1.`);
    process.exit(1);
  }

  console.log(`Root verified OK for war ${warId}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
