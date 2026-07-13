import { Connection, PublicKey } from "@solana/web3.js";
import { be32ToFe } from "./poseidon";

export interface CensusLeaf {
  leaf_index: number;
  commitment: string;
}

export async function fetchCensusEntries(
  connection: Connection,
  programId: PublicKey,
  warId: number,
): Promise<{ leafIndex: bigint; commitment: Buffer }[]> {
  const warIdBytes = Buffer.alloc(8);
  warIdBytes.writeBigUInt64LE(BigInt(warId));

  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { dataSize: 65 },
      {
        memcmp: {
          offset: 8,
          bytes: warIdBytes.toString("base64"),
          encoding: "base64",
        },
      },
    ],
  });

  return accounts.map(({ account }) => {
    const data = Buffer.from(account.data);
    const commitment = data.subarray(16, 48);
    const leafIndex = data.readBigUInt64LE(48);
    return { leafIndex, commitment };
  });
}

export async function getCensusLeaves(
  connection: Connection,
  programId: PublicKey,
  warId: number,
): Promise<CensusLeaf[]> {
  const entries = await fetchCensusEntries(connection, programId, warId);
  const sorted = entries.sort(
    (a, b) => Number(a.leafIndex - b.leafIndex),
  );

  return sorted.map((entry, i) => ({
    leaf_index: i,
    commitment: be32ToFe(entry.commitment).toString(16).padStart(64, "0"),
  }));
}

export async function getCensusLeafCount(
  connection: Connection,
  programId: PublicKey,
  warId: number,
): Promise<number> {
  const entries = await fetchCensusEntries(connection, programId, warId);
  return entries.length;
}
