import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VerifierSpike } from "../target/types/verifier_spike";
import {
  ComputeBudgetProgram,
  Transaction,
  Keypair,
} from "@solana/web3.js";
import { expect } from "chai";

const serialized = require("../circuits/spike/build/serialized.json");

describe("verifier-spike", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .VerifierSpike as Program<VerifierSpike>;

  it("POSITIVE: verifies a valid snarkjs proof on-chain", async () => {
    const tx = new Transaction();
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
    );
    tx.add(
      await program.methods
        .verify(
          serialized.proofA as number[],
          serialized.proofB as number[],
          serialized.proofC as number[],
          serialized.publicInputs as number[][]
        )
        .instruction()
    );

    const sig = await provider.sendAndConfirm(tx, []);
    console.log("  tx signature:", sig);

    const txDetails = await provider.connection.getTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    const cuConsumed = txDetails?.meta?.computeUnitsConsumed;
    console.log("  ▶ compute units consumed:", cuConsumed);
    expect(cuConsumed, "positive proof should have verified and consumed CU").to.be.a("number");
  });

  it("NEGATIVE: rejects proof with altered public input (c=34 instead of 33)", async () => {
    const alteredInputs = [[...serialized.publicInputs[0]]];
    alteredInputs[0][31] = 34; // change c from 33 to 34

    const tx = new Transaction();
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
    );
    tx.add(
      await program.methods
        .verify(
          serialized.proofA as number[],
          serialized.proofB as number[],
          serialized.proofC as number[],
          alteredInputs as number[][]
        )
        .instruction()
    );

    try {
      await provider.sendAndConfirm(tx, []);
      expect.fail("Should have thrown");
    } catch (err: any) {
      const msg = err.toString();
      console.log("  error message:", msg);
      expect(msg).to.include("ProofVerificationFailed");
    }
  });
});
