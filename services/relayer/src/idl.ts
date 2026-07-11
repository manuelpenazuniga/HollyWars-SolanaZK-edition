export const PROGRAM_ID = "FHj8baQvc17Qny8TvndTtkjh2iqKgu9ucQgynwD6J1WG";

export const VOTE_IX_NAME = "vote";

export const VOTE_IX_ACCOUNTS = [
  { name: "voter", isMut: true, isSigner: true },
  { name: "war", isMut: true, isSigner: false },
  { name: "nullifier", isMut: true, isSigner: false },
  { name: "systemProgram", isMut: false, isSigner: false },
] as const;

export const VOTE_IX_ARGS = [
  { name: "warId", type: "u64" },
  { name: "nullifierHash", type: { array: ["u8", 32] } },
  { name: "proofA", type: { array: ["u8", 64] } },
  { name: "proofB", type: { array: ["u8", 128] } },
  { name: "proofC", type: { array: ["u8", 64] } },
  { name: "publicInputs", type: { array: [{ array: ["u8", 32] }, 5] } },
  { name: "battleCry", type: "string" },
] as const;

export const VOTE_IDL = {
  version: "0.1.0",
  name: "holy_wars",
  instructions: [
    {
      name: VOTE_IX_NAME,
      accounts: VOTE_IX_ACCOUNTS.map((a) => ({ name: a.name, isMut: a.isMut, isSigner: a.isSigner })),
      args: VOTE_IX_ARGS.map((a) => ({ name: a.name, type: a.type as any })),
    },
  ],
  accounts: [],
  types: [],
  errors: [],
} as const;
