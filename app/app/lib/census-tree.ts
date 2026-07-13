"use client";
// Browser-side census Merkle tree. This is a VERBATIM port of the attestor's
// services/common/src/merkle.ts (depth-20, incremental insert) — the root MUST byte-match
// the on-chain `census_root`, so the algorithm cannot drift. We rebuild the whole tree from
// the leaves array the attestor serves, so the browser never trusts an attestor-supplied path.
import { getPoseidon } from "./poseidon";
import { feToHex } from "./identity";

const DEPTH = 20;

export interface MerkleProof {
  root: bigint;
  pathElements: bigint[]; // length DEPTH
  pathIndices: number[]; // length DEPTH, each 0|1
}

// Build the tree by replaying inserts in order (exactly as MerkleTree.insert/updatePath),
// then extract the proof for `leafIndex`. commitments grows as we insert — replicating the
// attestor's time-varying `commitments.length`, so intermediate sibling choices match too.
export async function buildProof(
  leaves: bigint[],
  leafIndex: number,
): Promise<MerkleProof> {
  const P = await getPoseidon();
  const p2 = (a: bigint, b: bigint): bigint => BigInt(P.F.toString(P([a, b])));

  const zeros = new Array<bigint>(DEPTH + 1);
  zeros[0] = p2(0n, 0n);
  for (let i = 1; i <= DEPTH; i++) zeros[i] = p2(zeros[i - 1], zeros[i - 1]);

  const commitments: bigint[] = [];
  const nodes = new Map<string, bigint>();

  for (const leaf of leaves) {
    const li = commitments.length;
    commitments.push(leaf);
    let hash = commitments[li];
    let idx = li;
    for (let level = 1; level <= DEPTH; level++) {
      const parentIdx = idx >> 1;
      const siblingIdx = idx ^ 1;
      let sibling: bigint;
      if (level === 1) {
        sibling =
          siblingIdx < commitments.length ? commitments[siblingIdx] : zeros[0];
      } else {
        sibling = nodes.get(`${level - 1},${siblingIdx}`) ?? zeros[level - 1];
      }
      const left = (idx & 1) === 0 ? hash : sibling;
      const right = (idx & 1) === 0 ? sibling : hash;
      hash = p2(left, right);
      nodes.set(`${level},${parentIdx}`, hash);
      idx = parentIdx;
    }
  }

  const root =
    commitments.length === 0 ? zeros[DEPTH] : nodes.get(`${DEPTH},0`)!;

  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let idx = leafIndex;
  for (let level = 0; level < DEPTH; level++) {
    pathIndices.push(idx & 1);
    const siblingIdx = idx ^ 1;
    let sibling: bigint;
    if (level === 0) {
      sibling =
        siblingIdx < commitments.length ? commitments[siblingIdx] : zeros[0];
    } else {
      sibling = nodes.get(`${level},${siblingIdx}`) ?? zeros[level];
    }
    pathElements.push(sibling);
    idx = idx >> 1;
  }

  return { root, pathElements, pathIndices };
}

// leaves come from the attestor as hex (BE-32) or decimal strings; normalize to bigint.
export function parseLeaf(s: string): bigint {
  return s.startsWith("0x") ? BigInt(s) : /^[0-9]+$/.test(s) ? BigInt(s) : BigInt("0x" + s);
}

export interface RootConsistentSnapshot {
  proof: MerkleProof;
  rootHex: string;
}

// Poll until the tree we rebuild from the attestor's leaves matches the on-chain root
// (the attestor posts the root within ~10s of each enroll). Returns a proof consistent with
// the on-chain root the vote will bind as public_inputs[0]. Throws on timeout.
export async function waitForConsistentRoot(
  fetchLeaves: () => Promise<string[]>,
  fetchOnChainRootHex: () => Promise<string>,
  leafIndex: number,
  opts: { timeoutMs?: number; intervalMs?: number; expectedLeafHex?: string } = {},
): Promise<RootConsistentSnapshot> {
  const timeoutMs = opts.timeoutMs ?? 45000;
  const intervalMs = opts.intervalMs ?? 3000;
  const expected = opts.expectedLeafHex?.replace(/^0x/, "").toLowerCase();
  const start = Date.now();
  let lastLocal = "";
  let lastChain = "";
  let reason = "root not yet consistent";
  for (;;) {
    const [leavesRaw, chainRootHex] = await Promise.all([
      fetchLeaves(),
      fetchOnChainRootHex(),
    ]);
    const leaves = leavesRaw.map(parseLeaf);
    lastChain = chainRootHex.replace(/^0x/, "").toLowerCase();

    // MEDIUM-2: a stale-but-consistent RPC view (both fetches predating our enroll) would
    // match roots yet omit our leaf → witness gen would hit the circuit's root assert. Only
    // accept a snapshot that actually contains our committed leaf at our index.
    const leafPresent =
      !expected ||
      (leaves.length > leafIndex && feToHex(leaves[leafIndex]) === expected);

    if (leafPresent) {
      const proof = await buildProof(leaves, leafIndex);
      const localRootHex = feToHex(proof.root);
      lastLocal = localRootHex;
      if (localRootHex === lastChain) {
        return { proof, rootHex: localRootHex };
      }
      reason = `local ${lastLocal.slice(0, 12)}… vs chain ${lastChain.slice(0, 12)}…`;
    } else {
      reason = "your census leaf is not visible yet (RPC lag)";
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `census root not yet consistent (${reason}) — the attestor may still be posting the root; try again in a moment`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
