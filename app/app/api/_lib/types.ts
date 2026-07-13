export type Hex32 = string;
export type Hex64 = string;
export type Hex128 = string;
export type Hex5x32 = [Hex32, Hex32, Hex32, Hex32, Hex32];

export interface VoteRequest {
  war_id: number | string;
  nullifier_hash: Hex32;
  proof: { a: Hex64; b: Hex128; c: Hex64 };
  public_inputs: Hex5x32;
  battle_cry?: string;
}

export interface VoteResult {
  tx_signature: string;
}

export interface RelayerRpc {
  getAccountInfo(pubkey: PublicKeyLike): Promise<{ data: Buffer } | null>;
  sendTransaction(
    serializedTx: Uint8Array,
    options: { skipPreflight?: boolean } & Record<string, unknown>,
  ): Promise<{ signature: string }>;
  getRecentBlockhash?(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
}

export type PublicKeyLike = { toBase58(): string } | string;

export interface WarAccountData {
  warId: bigint;
  topic: string;
  sideA: string;
  sideB: string;
  tallyA: bigint;
  tallyB: bigint;
  censusRoot: Uint8Array;
  status: number;
  opensAt: bigint;
  closesAt: bigint;
  medalTree: Uint8Array;
  bump: number;
}

export interface RelayerConfig {
  rpc: RelayerRpc;
  relayerKeypair: KeypairLike;
  programId: PublicKeyLike;
  port?: number;
  log?: (event: { ts: number; status: number; war_id: string | number }) => void;
}

export interface KeypairLike {
  publicKey: { toBase58(): string; toBytes(): Uint8Array };
  secretKey: Uint8Array;
}

export type PrecheckOutcome =
  | { kind: "ok"; war: WarAccountData }
  | { kind: "reject"; status: number; reason: string };

export interface SubmitOutcome {
  kind: "ok" | "reject";
  status: number;
  reason?: string;
  tx_signature?: string;
}
