import { Connection } from "@solana/web3.js";

export const SOLANA_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC || "https://api.devnet.solana.com";

export const connection = new Connection(SOLANA_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: SOLANA_ENDPOINT.replace(/^http/, "ws"),
});
