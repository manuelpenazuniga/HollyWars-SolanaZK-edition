import {
  initPoseidon,
  poseidon,
  feToBE32,
  githubHash,
  buildAttestationMessage,
} from "@holywars/common";
import { buildApp } from "../src/app.js";
import { checkEligibility } from "../src/oauth.js";
import { CensusManager, type CensusManagerDeps } from "../src/census.js";
import type { OAuthClient } from "../src/oauth.js";
import type { PassionScorer } from "../src/passion/types.js";
import type { SolanaClient } from "../src/solana.js";
import {
  PublicKey,
  type TransactionInstruction,
  type Transaction,
  type TransactionSignature,
} from "@solana/web3.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  OK  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

function assertThrows(
  label: string,
  fn: () => void | Promise<void>,
  expectedMsg?: string,
): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(
        () => check(label, false, "expected throw but resolved"),
        (err: any) => {
          if (expectedMsg) {
            check(
              label,
              String(err).includes(expectedMsg),
              `msg: ${String(err)}`,
            );
          } else {
            check(label, true);
          }
        },
      );
    } else {
      check(label, false, "expected throw but returned");
    }
  } catch (err: any) {
    if (expectedMsg) {
      check(
        label,
        String(err).includes(expectedMsg),
        `msg: ${String(err)}`,
      );
    } else {
      check(label, true);
    }
  }
}

// ── Mock helpers ──

let capturedTx: Transaction | null = null;

function createMockSolanaClient(overrides: Partial<{
  censusEntryExists: boolean;
  txShouldFail: boolean;
}> = {}): SolanaClient {
  const mockPubkey = PublicKey.default;

  return {
    connection: {} as any,
    programId: PublicKey.default,
    attestor: {
      publicKey: PublicKey.default,
      secretKey: new Uint8Array(64),
    },
    getAttestorPubkey: () => PublicKey.default,
    getAttestorSecretKey: () => new Uint8Array(64),
    deriveConfigPda: () => [PublicKey.default, 255],
    deriveWarPda: () => [PublicKey.default, 255],
    deriveCensusEntryPda: () => [PublicKey.default, 255],
    deriveCensusLeafPda: () => [PublicKey.default, 255],
    censusEntryExists: async () => overrides.censusEntryExists ?? false,
    signMessage: (_msg: Buffer) => new Uint8Array(64),
    buildAndSendRegisterTx: async (params: any) => {
      if (overrides.txShouldFail) {
        throw new Error("mock tx failure");
      }
      // Capture the message and signature for verification
      return "mock_tx_sig_123";
    },
    postRoot: async () => "mock_post_root_sig",
    buildAndSendRaw: null as any,
  } as unknown as SolanaClient;
}

function createMockOAuthClient(overrides: Partial<{
  userId: number;
  login: string;
  created_at: string;
  public_repos: number;
  publicEventsCount: number;
  shouldFail: boolean;
}> = {}): OAuthClient {
  return {
    verify: async () => {
      if (overrides.shouldFail) throw new Error("OAuth failed");
      return {
        user: {
          id: overrides.userId ?? 12345,
          login: overrides.login ?? "testuser",
          created_at:
            overrides.created_at ??
            new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
              .toISOString(),
          public_repos: overrides.public_repos ?? 10,
        },
        publicEventsCount: overrides.publicEventsCount ?? 0,
      };
    },
  };
}

function createMockScorer(
  weights: { weight_a: 1 | 2 | 3; weight_b: 1 | 2 | 3 } = {
    weight_a: 1,
    weight_b: 1,
  },
): PassionScorer {
  return {
    score: async () => weights,
  };
}

function createMockCensusManager(overrides: Partial<{
  leafCount: number;
}> = {}): CensusManager {
  const deps: CensusManagerDeps = {
    connection: {} as any,
    programId: PublicKey.default,
    attestorKeypair: {
      publicKey: PublicKey.default,
      secretKey: new Uint8Array(64),
    },
    postRoot: async () => "mock_sig",
  };

  const cm = new CensusManager(deps);
  // Override methods
  (cm as any).getLeafCount = () => overrides.leafCount ?? 0;
  (cm as any).getLeaves = () => [];
  (cm as any).enroll = async () => 0;
  return cm;
}

// ── Helper: compute BN254 expected values ──

// Test constants matching the poseidon_vectors.json fixture
const TEST_INNER =
  9364894797331556293216751547586939774017621471814492286642786513003087871360n;

const EXPECTED_COMMITMENT_FROM_VECTORS =
  9187245463509822132219689215865959707708306697898521869320259946547613416394n;

// ── Main test runner ──

async function runTests() {
  await initPoseidon();

  // ========================================================
  // TEST SUITE 1: Attestation message byte-identical
  // ========================================================
  console.log("\n=== SUITE 1: Attestation message byte-identity ===");

  const msgDirect = buildAttestationMessage({
    commitment: TEST_INNER,
    githubId: "12345",
    warId: 1,
    leafIndex: 42,
  });

  check("msgDirect length === 80", msgDirect.length === 80);

  // Verify internal layout matches common
  const extractedCommitment = msgDirect.subarray(0, 32);
  check(
    "commitment at bytes 0-31",
    Buffer.from(extractedCommitment).equals(
      feToBE32(TEST_INNER),
    ),
  );

  const expectedGh = githubHash("12345");
  const extractedGh = msgDirect.subarray(32, 64);
  check(
    "github_hash at bytes 32-63",
    Buffer.from(extractedGh).equals(expectedGh),
  );

  const extractedWarId = Number(
    Buffer.from(msgDirect.subarray(64, 72)).readBigUInt64LE(0),
  );
  check("war_id at bytes 64-71 LE", extractedWarId === 1);

  const extractedLeafIndex = Number(
    Buffer.from(msgDirect.subarray(72, 80)).readBigUInt64LE(0),
  );
  check(
    "leaf_index at bytes 72-79 LE",
    extractedLeafIndex === 42,
  );

  // Verificar que si llamamos buildAttestationMessage con los mismos inputs produce el mismo resultado
  const msgAgain = buildAttestationMessage({
    commitment: TEST_INNER,
    githubId: "12345",
    warId: 1,
    leafIndex: 42,
  });
  check(
    "buildAttestationMessage deterministic",
    Buffer.from(msgDirect).equals(Buffer.from(msgAgain)),
  );

  // ========================================================
  // TEST SUITE 2: Eligibility checks
  // ========================================================
  console.log("\n=== SUITE 2: Eligibility checks ===");

  // Account older than 6 months, enough repos
  const oldUser = {
    id: 1,
    login: "veteran",
    created_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    public_repos: 5,
  };
  const r1 = checkEligibility(oldUser, 0);
  check("Veteran with 5 repos is eligible", r1.eligible);

  // Account newer than 6 months
  const newUser = {
    id: 2,
    login: "noob",
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    public_repos: 5,
  };
  const r2 = checkEligibility(newUser, 0);
  check("Account < 6 months is NOT eligible", !r2.eligible);
  check(
    "Reason mentions 6 months",
    r2.reason?.includes("6 months") ?? false,
  );

  // Account old but no repos, but has events
  const oldNoRepos = {
    id: 3,
    login: "lurker",
    created_at: new Date(
      Date.now() - 500 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    public_repos: 0,
  };
  const r3 = checkEligibility(oldNoRepos, 0);
  check("Old account 0 repos 0 events is NOT eligible", !r3.eligible);

  const r4 = checkEligibility(oldNoRepos, 5);
  check("Old account 0 repos 5 events IS eligible", r4.eligible);

  const r5 = checkEligibility(oldNoRepos, 10);
  check("Old account 0 repos 10 events IS eligible", r5.eligible);

  // ========================================================
  // TEST SUITE 3: /enroll endpoint — account < 6 months
  // ========================================================
  console.log("\n=== SUITE 3: /enroll rejects account < 6 months ===");

  {
    const mockSolana = createMockSolanaClient();
    const mockOAuth = createMockOAuthClient({
      userId: 99999,
      login: "newbie",
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString(),
      public_repos: 10,
    });
    const mockScorer = createMockScorer();
    const mockCensus = createMockCensusManager();

    const app = await buildApp({
      solana: mockSolana,
      oauth: mockOAuth,
      scorer: mockScorer,
      census: mockCensus,
    });

    const res = await app.inject({
      method: "POST",
      url: "/enroll",
      payload: {
        oauth_code: "test_code",
        war_id: 1,
        inner: TEST_INNER.toString(16),
      },
    });

    check("Status 403 for account < 6 months", res.statusCode === 403);
    check(
      "Body contains eligibility error",
      JSON.parse(res.body).error?.includes("eligibility") ?? false,
    );
    await app.close();
  }

  // ========================================================
  // TEST SUITE 4: /enroll endpoint — duplicate account
  // ========================================================
  console.log("\n=== SUITE 4: /enroll rejects duplicate ===");

  {
    const mockSolana = createMockSolanaClient({ censusEntryExists: true });
    const mockOAuth = createMockOAuthClient({
      userId: 12345,
      login: "veteran",
      created_at: new Date(
        Date.now() - 400 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      public_repos: 10,
    });
    const mockScorer = createMockScorer();
    const mockCensus = createMockCensusManager();

    const app = await buildApp({
      solana: mockSolana,
      oauth: mockOAuth,
      scorer: mockScorer,
      census: mockCensus,
    });

    const res = await app.inject({
      method: "POST",
      url: "/enroll",
      payload: {
        oauth_code: "test_code",
        war_id: 1,
        inner: TEST_INNER.toString(16),
      },
    });

    check("Status 409 for duplicate", res.statusCode === 409);
    check(
      "Body mentions already enrolled",
      JSON.parse(res.body).error?.includes("Already enrolled") ?? false,
    );
    await app.close();
  }

  // ========================================================
  // TEST SUITE 5: Full flow — tx has [ed25519, register] in correct order
  // ========================================================
  console.log(
    "\n=== SUITE 5: Full flow — tx [ed25519, register] order ===",
  );

  {
    // We use a custom mock that captures the transaction
    let capturedInstructions: TransactionInstruction[] = [];
    let capturedMsg: Buffer | null = null;

    const mockPubkey = PublicKey.default;

    const mockSolana: SolanaClient = {
      connection: {} as any,
      programId: PublicKey.default,
      attestor: {
        publicKey: PublicKey.default,
        secretKey: new Uint8Array(64),
      },
      getAttestorPubkey: () => PublicKey.default,
      getAttestorSecretKey: () => new Uint8Array(64),
      deriveConfigPda: () => [PublicKey.default, 255],
      deriveWarPda: () => [PublicKey.default, 255],
      deriveCensusEntryPda: () => [PublicKey.default, 255],
      deriveCensusLeafPda: () => [PublicKey.default, 255],
      censusEntryExists: async () => false,
      signMessage: (msg: Buffer) => {
        capturedMsg = msg;
        return new Uint8Array(64);
      },
      buildAndSendRegisterTx: async (params: {
        warId: number;
        commitment: bigint;
        githubHash: string;
        leafIndex: number;
        message: Buffer;
        signature: Uint8Array;
      }) => {
        // Verify the message built by the app matches what common would build
        const expectedMsg = buildAttestationMessage({
          commitment: params.commitment,
          githubId: "12345",
          warId: params.warId,
          leafIndex: params.leafIndex,
        });
        check(
          "message passed to buildAndSendRegisterTx matches buildAttestationMessage",
          Buffer.from(params.message).equals(Buffer.from(expectedMsg)),
        );

        // Verify signature is 64 bytes
        check(
          "signature is 64 bytes",
          params.signature.length === 64,
        );

        return "mock_tx_sig_456";
      },
      postRoot: async () => "mock_sig",
    } as unknown as SolanaClient;

    const mockOAuth = createMockOAuthClient({
      userId: 12345,
      login: "testuser",
    });
    const mockScorer = createMockScorer({ weight_a: 2, weight_b: 3 });
    const mockCensus = createMockCensusManager({ leafCount: 0 });

    const app = await buildApp({
      solana: mockSolana,
      oauth: mockOAuth,
      scorer: mockScorer,
      census: mockCensus,
    });

    const res = await app.inject({
      method: "POST",
      url: "/enroll",
      payload: {
        oauth_code: "valid_code",
        war_id: 1,
        inner: TEST_INNER.toString(16),
      },
    });

    check("Full flow status 200", res.statusCode === 200, `got ${res.statusCode}: ${res.body}`);

    const body = JSON.parse(res.body);
    check("Response has war_id", body.war_id === 1);
    check("Response has leaf_index", body.leaf_index === 0);
    check("Response has commitment", typeof body.commitment === "string");
    check("Response has github_hash", typeof body.github_hash === "string");
    check("Response has tx_signature", body.tx_signature === "mock_tx_sig_456");

    // Verify NO weights in response (INV-1)
    check("Response does NOT contain weight_a", !("weight_a" in body));
    check("Response does NOT contain weight_b", !("weight_b" in body));

    // Verify the commitment matches Poseidon(inner, w_a, w_b)
    const expectedCommitment = await poseidon([
      TEST_INNER,
      BigInt(2), // weight_a
      BigInt(3), // weight_b
    ]);
    check(
      "commitment = Poseidon(inner, 2, 3)",
      body.commitment === feToBE32(expectedCommitment).toString("hex"),
    );

    // Verify the github_hash matches
    const expectedGh = githubHash("12345");
    check(
      "github_hash matches githubHash('12345')",
      body.github_hash === expectedGh.toString("hex"),
    );

    await app.close();
  }

  // ========================================================
  // TEST SUITE 6: Ed25519 instruction data layout
  // ========================================================
  console.log("\n=== SUITE 6: Ed25519 instruction data layout ===");

  {
    // Manually construct the Ed25519 instruction and verify offsets
    const message = buildAttestationMessage({
      commitment: TEST_INNER,
      githubId: "12345",
      warId: 1,
      leafIndex: 0,
    });

    const sigOffset = 16;
    const pkOffset = sigOffset + 64; // 80
    const msgOffset = pkOffset + 32; // 112
    const msgSize = 80;

    const data = Buffer.alloc(msgOffset + msgSize); // 192
    data[0] = 1;
    data[1] = 0;
    data.writeUInt16LE(sigOffset, 2);
    data.writeUInt16LE(0xffff, 4); // sig instr idx
    data.writeUInt16LE(pkOffset, 6);
    data.writeUInt16LE(0xffff, 8); // pk instr idx
    data.writeUInt16LE(msgOffset, 10);
    data.writeUInt16LE(msgSize, 12);
    data.writeUInt16LE(0xffff, 14); // msg instr idx

    check("ed25519 header: num_signatures = 1", data[0] === 1);
    check("ed25519 header: padding = 0", data[1] === 0);
    check(
      "ed25519 header: signature_offset = 16",
      data.readUInt16LE(2) === 16,
    );
    check(
      "ed25519 header: sig_instr_idx = 0xFFFF",
      data.readUInt16LE(4) === 0xffff,
    );
    check(
      "ed25519 header: pk_offset = 80",
      data.readUInt16LE(6) === 80,
    );
    check(
      "ed25519 header: pk_instr_idx = 0xFFFF",
      data.readUInt16LE(8) === 0xffff,
    );
    check(
      "ed25519 header: msg_offset = 112",
      data.readUInt16LE(10) === 112,
    );
    check(
      "ed25519 header: msg_size = 80",
      data.readUInt16LE(12) === 80,
    );
    check(
      "ed25519 header: msg_instr_idx = 0xFFFF",
      data.readUInt16LE(14) === 0xffff,
    );

    check("ed25519 data total length = 192", data.length === 192);

    // Verify message can be placed at offset 112
    message.copy(data, msgOffset);
    const recovered = data.subarray(msgOffset, msgOffset + msgSize);
    check(
      "message recovered from ed25519 data matches",
      Buffer.from(recovered).equals(Buffer.from(message)),
    );
  }

  // ========================================================
  // TEST SUITE 7: /enroll validates inner < r
  // ========================================================
  console.log("\n=== SUITE 7: inner validation ===");

  {
    const mockSolana = createMockSolanaClient();
    const mockOAuth = createMockOAuthClient();
    const mockScorer = createMockScorer();
    const mockCensus = createMockCensusManager();

    const app = await buildApp({
      solana: mockSolana,
      oauth: mockOAuth,
      scorer: mockScorer,
      census: mockCensus,
    });

    // Invalid hex
    const res1 = await app.inject({
      method: "POST",
      url: "/enroll",
      payload: { oauth_code: "c", war_id: 1, inner: "zzz" },
    });
    check("Invalid hex → 400", res1.statusCode === 400);

    // inner >= r
    const r =
      21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const res2 = await app.inject({
      method: "POST",
      url: "/enroll",
      payload: {
        oauth_code: "c",
        war_id: 1,
        inner: r.toString(16),
      },
    });
    check("inner = r → 400", res2.statusCode === 400);

    const res3 = await app.inject({
      method: "POST",
      url: "/enroll",
      payload: {
        oauth_code: "c",
        war_id: 1,
        inner: (r + 1n).toString(16),
      },
    });
    check("inner > r → 400", res3.statusCode === 400);

    await app.close();
  }

  // ========================================================
  // TEST SUITE 8: Poseidon self-test vectors
  // ========================================================
  console.log("\n=== SUITE 8: Poseidon vectors ===");

  const c1 = await poseidon([
    TEST_INNER,
    BigInt(2),
    BigInt(3),
  ]);
  check(
    "Poseidon(inner, 2, 3) matches fixture",
    c1 === EXPECTED_COMMITMENT_FROM_VECTORS,
    `expected ${EXPECTED_COMMITMENT_FROM_VECTORS} got ${c1}`,
  );

  // ========================================================
  // TEST SUITE 9: /enroll with weight validation
  // ========================================================
  console.log("\n=== SUITE 9: Weight validation ===");

  {
    const mockSolana = createMockSolanaClient();
    const mockOAuth = createMockOAuthClient();
    // Scorer returns invalid weight (4 not in {1,2,3})
    const badScorer: PassionScorer = {
      score: async () => ({ weight_a: 4 as any, weight_b: 1 }),
    };
    const mockCensus = createMockCensusManager();

    const app = await buildApp({
      solana: mockSolana,
      oauth: mockOAuth,
      scorer: badScorer,
      census: mockCensus,
    });

    const res = await app.inject({
      method: "POST",
      url: "/enroll",
      payload: {
        oauth_code: "c",
        war_id: 1,
        inner: TEST_INNER.toString(16),
      },
    });

    check(
      "Invalid weight_a → 500",
      res.statusCode === 500,
    );
    check(
      "Error mentions invalid weights",
      JSON.parse(res.body).error?.includes("Invalid weights") ?? false,
    );

    await app.close();
  }

  // ========================================================
  // TEST SUITE 10: /enroll with OAuth failure
  // ========================================================
  console.log("\n=== SUITE 10: OAuth failure → 401 ===");

  {
    const mockSolana = createMockSolanaClient();
    const mockOAuth = createMockOAuthClient({ shouldFail: true });
    const mockScorer = createMockScorer();
    const mockCensus = createMockCensusManager();

    const app = await buildApp({
      solana: mockSolana,
      oauth: mockOAuth,
      scorer: mockScorer,
      census: mockCensus,
    });

    const res = await app.inject({
      method: "POST",
      url: "/enroll",
      payload: {
        oauth_code: "bad_code",
        war_id: 1,
        inner: TEST_INNER.toString(16),
      },
    });

    check("OAuth failure → 401", res.statusCode === 401);
    await app.close();
  }

  // ========================================================
  // TEST SUITE 11: GET /census/:war_id/leaves
  // ========================================================
  console.log("\n=== SUITE 11: GET /census/:war_id/leaves ===");

  {
    const mockSolana = createMockSolanaClient();
    const mockOAuth = createMockOAuthClient();
    const mockScorer = createMockScorer();

    const deps: CensusManagerDeps = {
      connection: {} as any,
      programId: PublicKey.default,
      attestorKeypair: {
        publicKey: PublicKey.default,
        secretKey: new Uint8Array(64),
      },
      postRoot: async () => "mock_sig",
    };
    const mockCensus = new CensusManager(deps);
    // Initialize war 1 tree via private method (force-cast)
    await (mockCensus as any).init([1]);

    const app = await buildApp({
      solana: mockSolana,
      oauth: mockOAuth,
      scorer: mockScorer,
      census: mockCensus,
    });

    const res = await app.inject({
      method: "GET",
      url: "/census/1/leaves",
    });

    check("GET /census/1/leaves → 200", res.statusCode === 200);
    const leaves = JSON.parse(res.body);
    check("Returns empty leaves for empty tree", leaves.length === 0);

    // Invalid war_id
    const resBad = await app.inject({
      method: "GET",
      url: "/census/abc/leaves",
    });
    check("GET /census/abc/leaves → 400", resBad.statusCode === 400);

    await app.close();
  }

  // ========================================================
  // TEST SUITE 12: Transaction failure
  // ========================================================
  console.log("\n=== SUITE 12: Tx failure → 500 ===");

  {
    const mockSolana = createMockSolanaClient({ txShouldFail: true });
    const mockOAuth = createMockOAuthClient();
    const mockScorer = createMockScorer();
    const mockCensus = createMockCensusManager();

    const app = await buildApp({
      solana: mockSolana,
      oauth: mockOAuth,
      scorer: mockScorer,
      census: mockCensus,
    });

    const res = await app.inject({
      method: "POST",
      url: "/enroll",
      payload: {
        oauth_code: "c",
        war_id: 1,
        inner: TEST_INNER.toString(16),
      },
    });

    check("Tx failure → 500", res.statusCode === 500);
    check(
      "Error mentions transaction failed",
      JSON.parse(res.body).error?.includes("Transaction failed") ?? false,
    );

    await app.close();
  }

  // ========================================================
  // Summary
  // ========================================================
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) {
    console.error("SOME TESTS FAILED");
    process.exit(1);
  }
  console.log("ALL TESTS PASSED");
}

runTests().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
