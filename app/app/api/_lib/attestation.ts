import { createHash } from "crypto";
import { feToBE32 } from "./poseidon";

export function githubHash(githubId: string): Buffer {
  return createHash("sha256").update("hw-census-v1:" + githubId).digest();
}

export interface AttestationMessageInput {
  commitment: bigint;
  githubId: string;
  warId: number;
  leafIndex: number;
}

export function buildAttestationMessage(
  input: AttestationMessageInput,
): Buffer {
  const commitmentBytes = feToBE32(input.commitment);
  const gh = githubHash(input.githubId);

  const warIdBytes = Buffer.alloc(8);
  warIdBytes.writeBigUInt64LE(BigInt(input.warId));

  const leafIndexBytes = Buffer.alloc(8);
  leafIndexBytes.writeBigUInt64LE(BigInt(input.leafIndex));

  return Buffer.concat([commitmentBytes, gh, warIdBytes, leafIndexBytes]);
}
