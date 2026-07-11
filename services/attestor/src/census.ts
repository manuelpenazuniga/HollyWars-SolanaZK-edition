import { MerkleTree, feToBE32, be32ToFe } from "@holywars/common";
import type { Connection, PublicKey, TransactionSignature } from "@solana/web3.js";

export interface CensusManagerDeps {
  connection: Connection;
  programId: PublicKey;
  attestorKeypair: { publicKey: PublicKey; secretKey: Uint8Array };
  postRoot(
    warId: number,
    root: bigint,
  ): Promise<TransactionSignature>;
}

export interface CensusLeaf {
  leaf_index: number;
  commitment: string;
}

export class CensusManager {
  private trees = new Map<number, MerkleTree>();
  private commitments = new Map<number, bigint[]>();
  private leafCounters = new Map<number, number>();
  private rootTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private deps: CensusManagerDeps;

  constructor(deps: CensusManagerDeps) {
    this.deps = deps;
  }

  async init(warIds: number[]): Promise<void> {
    for (const warId of warIds) {
      await this.rebuildTree(warId);
    }
  }

  private async rebuildTree(warId: number): Promise<void> {
    const tree = new MerkleTree();
    const commits: bigint[] = [];

    try {
      const entries = await this.fetchCensusEntriesForTree(warId);
      const sorted = entries.sort(
        (a, b) => Number(a.leafIndex - b.leafIndex),
      );

      for (let i = 0; i < sorted.length; i++) {
        const entry = sorted[i];
        const commitment = be32ToFe(entry.commitment);
        tree.insert(commitment);
        commits.push(commitment);
      }
    } catch (err) {
      console.warn(
        `[census] war ${warId}: could not fetch entries from chain, starting empty: ${err}`,
      );
    }

    this.trees.set(warId, tree);
    this.commitments.set(warId, commits);
    this.leafCounters.set(warId, tree.size);

    const localRoot = tree.root();
    console.log(
      `[census] war ${warId}: rebuilt ${tree.size} leaves, root=${feToBE32(localRoot).toString("hex")}`,
    );

    try {
      const onChainRoot = await this.fetchOnChainRoot(warId);
      if (onChainRoot !== null && onChainRoot !== localRoot) {
        console.log(
          `[census] war ${warId}: local root differs from chain, posting...`,
        );
        await this.deps.postRoot(warId, localRoot);
      }
    } catch (err) {
      console.warn(
        `[census] war ${warId}: could not verify on-chain root: ${err}`,
      );
    }
  }

  private async fetchCensusEntriesForTree(warId: number): Promise<
    { leafIndex: bigint; commitment: Buffer }[]
  > {
    const { connection, programId } = this.deps;
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

  private async fetchOnChainRoot(warId: number): Promise<bigint | null> {
    const { connection } = this.deps;
    const { PublicKey } = await import("@solana/web3.js");
    const warIdBytes = Buffer.alloc(8);
    warIdBytes.writeBigUInt64LE(BigInt(warId));

    const [warPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("war"), warIdBytes],
      this.deps.programId,
    );

    const account = await connection.getAccountInfo(warPda);
    if (!account) return null;

    const data = Buffer.from(account.data);
    let offset = 16;
    const topicLen = data.readUInt32LE(offset);
    offset += 4 + topicLen;
    const sideALen = data.readUInt32LE(offset);
    offset += 4 + sideALen;
    const sideBLen = data.readUInt32LE(offset);
    offset += 4 + sideBLen;
    offset += 16;
    const rootBytes = data.subarray(offset, offset + 32);
    return be32ToFe(rootBytes);
  }

  async enroll(warId: number, commitment: bigint): Promise<number> {
    const tree = this.trees.get(warId);
    if (!tree) throw new Error(`Unknown war ${warId}`);

    const leafIndex = tree.insert(commitment);

    const commits = this.commitments.get(warId) ?? [];
    commits.push(commitment);
    this.commitments.set(warId, commits);

    const count = this.leafCounters.get(warId) ?? 0;
    this.leafCounters.set(warId, count + 1);

    this.scheduleRootPost(warId);

    return leafIndex;
  }

  async checkGithubHashExists(
    warId: number,
    githubHash: Buffer,
  ): Promise<boolean> {
    const { connection, programId } = this.deps;
    const { PublicKey } = await import("@solana/web3.js");
    const warIdBytes = Buffer.alloc(8);
    warIdBytes.writeBigUInt64LE(BigInt(warId));

    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("census"), warIdBytes, githubHash],
      programId,
    );

    const account = await connection.getAccountInfo(pda);
    return account !== null;
  }

  getLeaves(warId: number): CensusLeaf[] {
    const commits = this.commitments.get(warId) ?? [];
    return commits.map((c, i) => ({
      leaf_index: i,
      commitment: feToBE32(c).toString("hex"),
    }));
  }

  getLeafCount(warId: number): number {
    return this.leafCounters.get(warId) ?? 0;
  }

  private scheduleRootPost(warId: number): void {
    // Do NOT reset an already-scheduled post: under continuous enrolls, resetting
    // the timer would postpone the root indefinitely. A fixed 10s window guarantees
    // the root (including every enroll accumulated so far) is posted periodically.
    if (this.rootTimers.has(warId)) return;

    const timer = setTimeout(() => {
      this.rootTimers.delete(warId);
      this.doPostRoot(warId);
    }, 10_000);

    this.rootTimers.set(warId, timer);
  }

  private async doPostRoot(warId: number): Promise<void> {
    const tree = this.trees.get(warId);
    if (!tree) return;

    const root = tree.root();
    try {
      await this.deps.postRoot(warId, root);
      console.log(
        `[census] war ${warId}: posted root ${feToBE32(root).toString("hex")}`,
      );
    } catch (err) {
      console.error(`[census] war ${warId}: post_root failed: ${err}`);
      setTimeout(() => this.doPostRoot(warId), 30_000);
    }
  }
}
