export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getCensusLeaves } from "../../../_lib/census";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ war_id: string }> },
) {
  try {
    const { war_id } = await params;
    const warId = parseInt(war_id, 10);
    if (isNaN(warId)) {
      return NextResponse.json({ error: "Invalid war_id" }, { status: 400 });
    }

    const rpcUrl = process.env.HELIUS_DEVNET_RPC ?? process.env.NEXT_PUBLIC_RPC ?? "https://api.devnet.solana.com";
    const programId = process.env.PROGRAM_ID ?? "FHj8baQvc17Qny8TvndTtkjh2iqKgu9ucQgynwD6J1WG";

    const connection = new Connection(rpcUrl, "confirmed");
    const programIdPk = new PublicKey(programId);

    const leaves = await getCensusLeaves(connection, programIdPk, warId);

    return NextResponse.json(leaves);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Internal error: ${err.message}` },
      { status: 500 },
    );
  }
}
