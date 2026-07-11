import "dotenv/config";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { initPoseidon, assertPoseidonMatches } from "@holywars/common";

import { buildApp } from "./app.js";
import { SolanaClient } from "./solana.js";
import { createOAuthClient } from "./oauth.js";
import { createPassionScorer } from "./passion/index.js";
import { CensusManager } from "./census.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // ── Poseidon self-test (INV-7 gate) ──
  await initPoseidon();
  const vectorsPath = resolve(
    __dirname,
    "..",
    "..",
    "..",
    "circuits",
    "poseidon_vectors.json",
  );
  assertPoseidonMatches(vectorsPath);

  // ── Config ──
  const rpcUrl =
    process.env.HELIUS_DEVNET_RPC ?? "https://api.devnet.solana.com";
  const programId =
    process.env.PROGRAM_ID ??
    "FHj8baQvc17Qny8TvndTtkjh2iqKgu9ucQgynwD6J1WG";
  const keypairPath =
    process.env.ATTESTOR_KEYPAIR_PATH ??
    resolve(__dirname, "..", "..", "..", ".keys", "authority.json");
  const githubClientId = process.env.GITHUB_CLIENT_ID ?? "";
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
  const port = parseInt(process.env.PORT ?? "3000", 10);

  if (!githubClientId || !githubClientSecret) {
    console.warn(
      "GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not set — OAuth will fail",
    );
  }

  // ── Init services ──
  const solana = new SolanaClient({ rpcUrl, programId, keypairPath });
  console.log(
    `Attestor pubkey: ${solana.getAttestorPubkey().toBase58()}`,
  );
  console.log(`Program ID: ${solana.programId.toBase58()}`);
  console.log(`RPC: ${rpcUrl}`);

  const oauth = createOAuthClient(githubClientId, githubClientSecret);
  const scorer = createPassionScorer();

  const census = new CensusManager({
    connection: solana.connection,
    programId: solana.programId,
    attestorKeypair: {
      publicKey: solana.attestor.publicKey,
      secretKey: solana.attestor.secretKey,
    },
    postRoot: (warId, root) => solana.postRoot(warId, root),
  });

  // Rebuild Merkle trees from chain for known wars
  await census.init([1, 2, 3]);

  // ── Start server ──
  const app = await buildApp({ solana, oauth, scorer, census });

  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Attestor listening on port ${port}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
