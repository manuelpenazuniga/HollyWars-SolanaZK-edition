# âï¸ Holy Wars â The Eternal Scoreboard

> Tabs vs Spaces. Vim vs Emacs. Dark vs Light mode. We've argued for 50 years.
> **Holy Wars** settles them where nobody can cheat: an eternal, immutable scoreboard on Solana.

Your developer identity (GitHub) earns you a vote. A zero-knowledge proof protects your
anonymity. Your real commit history measures your **passion** and weighs your ballot. And a
compressed NFT medal remembers forever that you fought in the war â without ever revealing
which side you took.

Built for the **DEV Weekend Challenge â Best Use of Solana**.

---

## How it works

1. **Enlist (public).** Connect a wallet + GitHub OAuth. An off-chain attestor verifies your
   account (age + real activity), computes your **Proof of Passion** weight from your commit
   history, and signs your entry into the census â one GitHub, one census leaf per war.
2. **Vote (anonymous).** Your browser generates a Groth16 proof that says *"I'm someone in the
   census, with weight W, and I haven't voted in this war before"* â without revealing who. A
   relayer submits the transaction, so your wallet never touches the ballot box.
3. **Watch it live.** The scoreboard moves in under 500 ms per vote over a websocket â Solana's
   ~400 ms finality turns the vote itself into the live event.
4. **Claim your scar.** When a war closes, mint a **veteran cNFT medal**. A second, domain-separated
   nullifier makes it cryptographically impossible to link your medal to your vote.

## Architecture

```
Browser ââOAuthâââ¶ Attestor (TS)   ââEd25519 attestationâââ¶ Anchor program (Solana devnet)
  â                Â· GitHub check          register()          Â· Config / War / CensusEntry PDAs
  â snarkjs        Â· Proof of Passion   ââ post_root() âââ¶     Â· Nullifier PDAs (no double-vote)
  â proof          Â· Merkle census                             Â· Groth16 verifier (alt_bn128)
  âââproofâââ¶ Relayer (TS) ââvote(proof)âââ¶                    Â· tallies + battle-cry events
        â²                                                             â
        âââââââââââââ websocket accountSubscribe (~400ms) ââââââââââââ
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
weight in `{1, 2, 3}` bound to the side they chose, and a unique per-war nullifier â all without
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

🚧 Actively built during the challenge window. **Done:** the Anchor program — per-war
GitHub census with Ed25519 attestation, wars, and an **anonymous ZK vote** whose Groth16 proof
is verified **on-chain** (bn254 / groth16-solana) with per-war nullifiers preventing double votes.
The circuit + trusted setup (real phase-2 contribution) and an on-chain verifier reference are in.
**In progress:** attestor/relayer services, the live War Room frontend, and cNFT medals.

## Build

```bash
# prerequisites: rust, solana-cli, anchor 0.31, node 22, circom 2.x
npm install
anchor build
anchor test          # runs the on-chain test suite on a local validator
```

## License

MIT
