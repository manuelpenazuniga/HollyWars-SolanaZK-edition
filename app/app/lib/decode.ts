import { PublicKey } from "@solana/web3.js";

export interface WarData {
  warId: number;
  topic: string;
  sideA: string;
  sideB: string;
  tallyA: number;
  tallyB: number;
  censusRoot: Uint8Array;
  status: "open" | "closed";
  opensAt: number;
  closesAt: number;
  medalTree: PublicKey;
  bump: number;
}

function readString(buf: Buffer, offset: number): [string, number] {
  const len = buf.readUInt32LE(offset);
  const str = buf.toString("utf-8", offset + 4, offset + 4 + len);
  return [str, offset + 4 + len];
}

export function decodeWarAccount(data: Buffer): WarData {
  let off = 8;
  const warId = Number(data.readBigUInt64LE(off));
  off += 8;
  const [topic, off2] = readString(data, off);
  off = off2;
  const [sideA, off3] = readString(data, off);
  off = off3;
  const [sideB, off4] = readString(data, off);
  off = off4;
  const tallyA = Number(data.readBigUInt64LE(off));
  off += 8;
  const tallyB = Number(data.readBigUInt64LE(off));
  off += 8;
  const censusRoot = new Uint8Array(data.subarray(off, off + 32));
  off += 32;
  const statusByte = data.readUInt8(off);
  off += 1;
  const opensAt = Number(data.readBigInt64LE(off));
  off += 8;
  const closesAt = Number(data.readBigInt64LE(off));
  off += 8;
  const medalTree = new PublicKey(data.subarray(off, off + 32));
  off += 32;
  const bump = data.readUInt8(off);

  return {
    warId,
    topic,
    sideA,
    sideB,
    tallyA,
    tallyB,
    censusRoot,
    status: statusByte === 0 ? "open" : "closed",
    opensAt,
    closesAt,
    medalTree,
    bump,
  };
}

export function decodeVoteCastEvent(data: Buffer): {
  warId: number;
  side: number;
  weight: number;
  battleCry: string;
  timestamp: number;
} | null {
  try {
    let off = 8;
    const warId = Number(data.readBigUInt64LE(off));
    off += 8;
    const side = data.readUInt8(off);
    off += 1;
    const weight = data.readUInt8(off);
    off += 1;
    off += 32;
    const [battleCry, off2] = readString(data, off);
    off = off2;
    const timestamp = Number(data.readBigInt64LE(off));
    return { warId, side, weight, battleCry, timestamp };
  } catch {
    return null;
  }
}
