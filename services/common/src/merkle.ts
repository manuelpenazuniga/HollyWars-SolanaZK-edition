import { poseidon } from "./poseidon.js";

const DEPTH = 20;

function p2(a: bigint, b: bigint): bigint {
  return poseidon([a, b]);
}

function precomputeZeros(): bigint[] {
  const zeros = new Array<bigint>(DEPTH + 1);
  zeros[0] = p2(0n, 0n);
  for (let i = 1; i <= DEPTH; i++) {
    zeros[i] = p2(zeros[i - 1], zeros[i - 1]);
  }
  return zeros;
}

export class MerkleTree {
  private readonly commitments: bigint[] = [];
  private readonly nodes: Map<string, bigint> = new Map();
  private readonly zeros: bigint[];

  constructor() {
    this.zeros = precomputeZeros();
  }

  insert(commitment: bigint): number {
    const leafIndex = this.commitments.length;
    this.commitments.push(commitment);
    this.updatePath(leafIndex);
    return leafIndex;
  }

  private updatePath(leafIndex: number): void {
    let hash = this.commitments[leafIndex];
    let idx = leafIndex;
    for (let level = 1; level <= DEPTH; level++) {
      const parentIdx = idx >> 1;
      const siblingIdx = idx ^ 1;

      let sibling: bigint;
      if (level === 1) {
        sibling =
          siblingIdx < this.commitments.length
            ? this.commitments[siblingIdx]
            : this.zeros[0];
      } else {
        sibling =
          this.nodes.get(`${level - 1},${siblingIdx}`) ??
          this.zeros[level - 1];
      }

      const left = (idx & 1) === 0 ? hash : sibling;
      const right = (idx & 1) === 0 ? sibling : hash;
      hash = p2(left, right);
      this.nodes.set(`${level},${parentIdx}`, hash);
      idx = parentIdx;
    }
  }

  root(): bigint {
    if (this.commitments.length === 0) return this.zeros[DEPTH];
    return this.nodes.get(`${DEPTH},0`)!;
  }

  proof(leafIndex: number): { pathElements: bigint[]; pathIndices: number[] } {
    if (leafIndex < 0 || leafIndex >= this.commitments.length) {
      throw new Error(
        `Leaf index ${leafIndex} out of bounds [0, ${this.commitments.length})`,
      );
    }

    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let idx = leafIndex;

    for (let level = 0; level < DEPTH; level++) {
      const isRight = idx & 1;
      pathIndices.push(isRight);
      const siblingIdx = idx ^ 1;

      let sibling: bigint;
      if (level === 0) {
        sibling =
          siblingIdx < this.commitments.length
            ? this.commitments[siblingIdx]
            : this.zeros[0];
      } else {
        sibling =
          this.nodes.get(`${level},${siblingIdx}`) ?? this.zeros[level];
      }

      pathElements.push(sibling);
      idx = idx >> 1;
    }

    return { pathElements, pathIndices };
  }

  static verifyProof(
    leaf: bigint,
    proof: { pathElements: bigint[]; pathIndices: number[] },
  ): bigint {
    let hash = leaf;
    for (let i = 0; i < DEPTH; i++) {
      const sibling = proof.pathElements[i];
      if (proof.pathIndices[i] === 0) {
        hash = p2(hash, sibling);
      } else {
        hash = p2(sibling, hash);
      }
    }
    return hash;
  }

  get size(): number {
    return this.commitments.length;
  }
}
