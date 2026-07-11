import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "FHj8baQvc17Qny8TvndTtkjh2iqKgu9ucQgynwD6J1WG",
);

export const WAR_PDAS: { warId: number; topic: string; pda: PublicKey }[] = [
  {
    warId: 1,
    topic: "Tabs vs Spaces",
    pda: new PublicKey("BdNwMpyML8maKjuaHcZy2qAuh5qR6f8jnv9Ew4Pzp3c6"),
  },
  {
    warId: 2,
    topic: "Vim vs Emacs",
    pda: new PublicKey("GgTzzSoBoEquH1sX4eV5RgtYQXwPj4WpYrdYf1taA5L2"),
  },
  {
    warId: 3,
    topic: "Dark vs Light mode",
    pda: new PublicKey("93pTNKdXGHsJvMABFo3n2Xr9bYsYo7uKNdup4xzq7UBC"),
  },
];

export const WAR_BY_SLUG: Record<string, { warId: number; pda: PublicKey }> = {
  "tabs-vs-spaces": { warId: 1, pda: WAR_PDAS[0].pda },
  "vim-vs-emacs": { warId: 2, pda: WAR_PDAS[1].pda },
  "dark-vs-light": { warId: 3, pda: WAR_PDAS[2].pda },
};

export const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL ?? "";
export const ATTESTOR_URL = process.env.NEXT_PUBLIC_ATTESTOR_URL ?? "";
