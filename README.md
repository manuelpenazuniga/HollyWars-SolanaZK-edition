# ⚔️ Holy Wars — The Eternal Scoreboard

> Tabs vs Spaces. Vim vs Emacs. Dark vs Light mode. We've argued for 50 years.
> **Holy Wars** settles them where nobody can cheat: an eternal, immutable scoreboard on Solana.

Your developer identity (GitHub) earns you a vote. A zero-knowledge proof protects your
anonymity. Your real commit history measures your **passion** and weighs your ballot. And a
compressed NFT medal remembers forever that you fought in the war — without ever revealing
which side you took.

Built for the **DEV Weekend Challenge — Best Use of Solana**.

---

## How it works

1. **Enlist (public).** Connect a wallet + GitHub OAuth. An off-chain attestor verifies your
   account (age + real activity), computes your **Proof of Passion** weight from your commit
   history, and signs your entry into the census — one GitHub, one census leaf per war.
2. **Vote (anonymous).** Your browser generates a Groth16 proof that says *"I'm someone in the
   census, with weight W, and I haven't voted in this war before"* — without revealing who. A
   relayer submits the transaction, so your wallet never touches the ballot box.
3. **Watch it live.** The scoreboard moves in under 500 ms per vote over a websocket — Solana's
   ~400 ms finality turns the vote itself into the live event.
4. **Claim your scar.** When a war closes, mint a **veteran cNFT medal**. A second, domain-separated
   nullifier makes it cryptographically impossible to link your medal to your vote.

## Architecture

```
Browser ──OAuth──▶ Attestor (TS)   ──Ed25519 attestation──▶ Anchor program (Solana devnet)
  │                · GitHub check          register()          · Config / War / CensusEntry PDAs
  │ snarkjs        · Proof of Passion   ── post_root() ──▶     · Nullifier PDAs (no double-vote)
  │ proof          · Merkle census                             · Groth16 verifier (alt_bn128)
  └──proof──▶ Relayer (TS) ──vote(proof)──▶                    · tallies + battle-cry events
        ▲                                                             │
        └──────────── websocket accountSubscribe (~400ms) ───────────┘
                       Live War Room (Next.js, Vercel)
```

| Layer | Tech |
|---|---|
| Program | Rust + Anchor 0.31, `groth16-solana` (Light Protocol), `alt_bn128` syscalls |
| ZK | circom 2.x + snarkjs (bn254), Poseidon (circomlib), Powers of Tau |
| cNFT | Metaplex Bubblegum + state compression |
| Attestor / Relayer | Node + TypeScript, GitHub OAuth + API (separate processes) |
| Frontend | Next.js 15, wallet-adapter, Tailwind, snarkjs-wasm in-browser |

### The vote circuit (`circuits/vote.circom`)

A voter proves, in zero knowledge, membership in a per-war Poseidon Merkle census, a passion
weight in `{1, 2, 3}` bound to the side they chose, and a unique per-war nullifier — all without
revealing their identity or their census leaf. Verified **on-chain** via `groth16-solana`
(~81k compute units).

## Repository layout

```
programs/holy-wars   Anchor program: census PDAs, Ed25519 attestation, wars, Groth16 vote (WIP)
programs/verifier-spike  Minimal reference: verifying a snarkjs Groth16 proof on-chain
circuits             vote.circom + trusted setup + snarkjs tests
services/attestor    GitHub identity, Proof of Passion, Ed25519 signatures, Merkle census (WIP)
services/relayer     Gasless relay of votes and medal claims (WIP)
app                  Next.js live War Room (WIP)
```

## Status

🚧 Actively built during the challenge window. The Anchor program core (census + attestation +
wars), the vote circuit, and on-chain Groth16 verification are in place; the attestor/relayer
services and the frontend are in progress.

## Build

```bash
# prerequisites: rust, solana-cli, anchor 0.31, node 22, circom 2.x
npm install
anchor build
anchor test          # runs the on-chain test suite on a local validator
```

## License

MIT
