# ⚔️ Holy Wars — The Eternal Scoreboard

[![Solana](https://img.shields.io/badge/Solana-devnet-14F195?logo=solana&logoColor=white)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.31-512BD4)](https://www.anchor-lang.com)
[![circom](https://img.shields.io/badge/circom-2.x-8A2BE2)](https://docs.circom.io)
![](https://img.shields.io/badge/double_voting-cryptographically_impossible-red)
![](https://img.shields.io/badge/your_hypocrisy-detected_on--chain-orange)
![](https://img.shields.io/badge/ballot-zero--knowledge-black)

> Tabs vs Spaces. Vim vs Emacs. Dark vs Light.
> Fifty years of flame wars and not a single binding resolution — because every poll ever run
> could be botted, brigaded, or voted on twice from incognito mode.
>
> **Holy Wars settles them where nobody can cheat: an immutable scoreboard on Solana, with
> anonymous zero-knowledge ballots weighted by your actual commit history.**

Yes, this is a joke. No, the cryptography is not.

Built in one weekend for the [DEV Weekend Challenge — Passion Edition](https://dev.to/challenges/weekend-2026-07-09)
(*Best Use of Solana*).

---

## The problem nobody asked us to solve

Holy wars are the original developer fandom — decades of pure, obsessive, tribal passion.
And yet every attempt to settle them is worthless, because an internet poll fails in four ways:

1. **Bots vote.**
2. **People vote twice.** (You know who you are.)
3. **Voting publicly doxxes you.** Imagine your team lead discovering you're a tabs person.
4. **Nobody's passion is measured.** A lifelong spaces engineer can vote tabs *ironically* and it counts the same.

Fix all four and — surprise — the joke has quietly become a real electronic-voting spec:

| Requirement | Which is, technically speaking… |
|---|---|
| Only real developers vote | Sybil resistance |
| One dev, one vote | Double-spend prevention |
| Nobody learns your side — not even the operators | Ballot secrecy via zero-knowledge proofs |
| Your history backs your vote | Attested, weighted ballots |
| The result can never be quietly edited | On-chain, publicly auditable tally |

An anonymous, weighted, sybil-resistant, verifiable election. For tabs vs spaces.
We regret nothing.

## How you fight

1. **Enlist (public).** Connect a wallet + GitHub OAuth. An attestor verifies your account is a
   real developer's (≥ 6 months old, actual activity), scans your repos to compute your
   **Proof of Passion** weight, and signs your entry into the census. One GitHub account = one
   census leaf per war, enforced by a PDA derived from `hash(github_id)` — bring a thousand
   wallets, you still get one ballot.
2. **Vote (anonymous).** Your browser generates a Groth16 proof stating *"I am someone in the
   census, my chosen side is worth weight W, and I have not voted in this war"* — without
   revealing who you are. A relayer pays the fee and submits it: your wallet never touches the
   ballot box. Optionally attach an anonymous **battle cry** (≤ 140 bytes of pure taunting).
3. **Watch the front line move.** Solana finalizes in ~400 ms, so the scoreboard is a live
   event: every vote shoves the battle line within half a second, over a websocket.
4. **Claim your scar.** When the war closes, mint a compressed-NFT **veteran medal** — to any
   wallet, even a fresh one. The medal proves you fought. It cannot reveal your side.
   Not "we promise we won't tell": *cannot* (see the two-nullifier trick below).

## Proof of Passion™ — your commits testify against you

Your vote is not worth 1. It is worth what your history proves.

At enlistment, the attestor samples your public repos and reads your actual indentation.
Eight years of spaces-indented code and now you're voting tabs? Enjoy your minimum-weight
ballot. **The system calls you a hypocrite, mathematically, to your face.** For Vim vs Emacs
it hunts your dotfiles for `.vimrc` and `init.el` like a detective going through your trash.

Two design details we're genuinely proud of:

- **Weights are coarse on purpose** — three tiers, `{1, 2, 3}`. A fine-grained weight (say,
  7.3/10) in a small census is a fingerprint: publish it as a public input and you've
  de-anonymized the voter. Coarse tiers keep the anonymity set fat.
- **You get a weight per side** — `(weight_a, weight_b)` — because your coherence depends on
  what you vote, and your vote is secret. Both weights are baked into your census commitment;
  the ZK circuit exposes *only* the weight of the side you actually chose, unlinked from you.

## The part where we stop joking

### The circuit (`circuits/vote.circom`)

12,131 constraints, Poseidon everywhere, proving in-browser in ~2 s with snarkjs. In one proof,
a voter shows:

```text
inner  = Poseidon(nullifier_seed, trapdoor)          // my secrets
leaf   = Poseidon(inner, weight_a, weight_b)         // my census leaf
leaf is in the Merkle census (depth 20 → 1,048,576 devs)
nullifier_hash = Poseidon(seed, war_id, "VOTE")      // my one-vote token
side ∈ {0, 1}
weight = side == 0 ? weight_a : weight_b             // only the chosen side's weight leaks
weight ∈ {1, 2, 3}
```

### The nested commitment — you cannot inflate your own ego

The client only ever sends `inner = Poseidon(seed, trapdoor)` to the attestor. The **attestor**
computes `leaf = Poseidon(inner, weight_a, weight_b)` with the weights *it* assigned, and signs
that. So: the client can't self-award weight 3, and the attestor never learns the secrets that
let it link a future vote back to you. Mutual distrust, resolved by one extra hash.

### Two nullifiers, zero correlation

The vote nullifier is `Poseidon(seed, war_id, "VOTE")`; the medal nullifier uses a different
domain constant. Same secret, separate domains — correlating them is as hard as breaking the
hash. You can claim your veteran medal on a brand-new wallet and no indexer, no attestor, no
subpoena can connect it to your ballot. The medal says *"I fought"*. It refuses to say for whom.

### A Groth16 verifier that costs pocket change

The proof is verified **on-chain, inside the vote instruction**, using Solana's `alt_bn128`
syscalls via [`groth16-solana`](https://github.com/Lightprotocol/groth16-solana):

- proof verification: **~103k compute units**
- the entire `vote` instruction (checks + verify + tally + event): **~118k CU**, under 9% of
  a 1.4M CU budget

Solana is one of the very few L1s where a SNARK verify just… fits in a normal transaction.
That's the whole reason the live scoreboard can be trustless instead of a database with vibes.

### Paranoia, itemized

The fun parts of this codebase are the attacks it refuses to allow:

- **The tally only moves with proof-bound values.** `root`, `war_id`, `side`, `weight` and the
  nullifier are public inputs *of the verified proof* — the program never trusts a parallel
  argument. (Verifying a ZK proof and then summing an unbound arg is security theater; we've
  seen it. We test against it.)
- **The nullifier PDA is seeded from the same bytes the proof verifies**, so replaying a valid
  proof with a different argument can't mint a second vote.
- **Field-element downcasts are range-checked** — 31 high bytes must be zero before a 32-byte
  public input becomes a `u8`. A corrupted verifying key cannot silently poison the tally.
- **Ed25519 attestation via instruction introspection, with pinned indices.** The census
  registration checks the attestor's signature by introspecting a preceding Ed25519Program
  instruction — and pins `signature/pubkey/message_instruction_index` to the `0xFFFF` sentinel.
  Skip that pin and an attacker can have the runtime validate *someone else's* signature while
  your program reads benign bytes. Introspection without pinning is not verification.
- **The trusted setup is provably non-degenerate.** War story: our first Groth16 setup skipped
  the phase-2 contribution, leaving `γ == δ ==` the G2 generator — which lets anyone **forge
  valid proofs for arbitrary public inputs without a witness**. Fake ballots, unbounded, for
  free. An adversarial audit caught it before it ever reached devnet. The ceremony now includes
  a real contribution plus a public beacon, and a test permanently asserts
  `vk_gamma_2 != vk_delta_2`. Lesson: test your *ceremony*, not just your circuit.

The on-chain test suite (21 tests on a local validator) is mostly a museum of these attacks:
double votes, cross-war proof replay, stale roots, tampered public inputs, forged attestors,
unpinned introspection, duplicate census leaves, oversized battle cries.

## Why Solana

| What the war needs | What Solana provides |
|---|---|
| The scoreboard as a *live event* | ~400 ms finality + websocket `accountSubscribe` — votes land on screen in < 500 ms |
| SNARK verification inside a vote tx | `alt_bn128` syscalls → Groth16 for ~103k CU |
| One-ballot-per-identity, enforceable | PDAs as existence proofs: census entries and nullifiers |
| A medal for every veteran, at meme scale | state compression → cNFT medals at ~0.00001 SOL each |

## Anti-sybil: the roads not taken

| Mechanism | Attacker's cost | Why it's not enough alone |
|---|---|---|
| Minimum SOL balance | ~0 (rotate the same SOL) | Broken |
| Locked stake | Linear in wallets | Plutocracy; devnet SOL is free |
| Wallet age | Old wallets sell cheap | Not verifiable on-chain without an oracle |
| **GitHub ≥ 6 months + real activity (chosen)** | Aged accounts with history don't grow on weekends | Needs an attestor — trusted for the *census*, never for votes |
| Quadratic voting | — | *Amplifies* sybils without an identity layer underneath |

Design conclusion: **identity anchored in GitHub, privacy anchored in ZK, passion anchored in
commits.** The attestor only gates who enters the census — and since every census entry is a
public PDA, anyone can rebuild the Merkle tree and audit the posted root. Cryptographically,
it *cannot* link a ballot to a person.

## Architecture

```text
Browser ──OAuth──▶ Attestor (TS)  ──Ed25519 attestation──▶  Anchor program (Solana devnet)
   │               · GitHub check         register()        · Config / War / CensusEntry PDAs
   │ snarkjs       · Proof of Passion  ── post_root() ──▶   · Nullifier PDAs (one vote, ever)
   │ proof         · Merkle census                          · Groth16 verifier (alt_bn128)
   └──proof──▶ Relayer (TS) ──vote(proof)──▶                · tallies + battle-cry events
        ▲                                                          │
        └──────────── websocket accountSubscribe (~400 ms) ────────┘
                        Live War Room (Next.js, Vercel)
```

The attestor and the relayer are **separate processes with no shared storage** — the attestor
knows identities but never sees votes; the relayer sees votes but never identities.

| Layer | Tech |
|---|---|
| Program | Rust + Anchor 0.31, `groth16-solana`, `alt_bn128` syscalls |
| ZK | circom 2.x + snarkjs (bn254), Poseidon (circomlib), Powers of Tau + phase-2 ceremony |
| Medals | Metaplex Bubblegum + state compression |
| Attestor / Relayer | Node + TypeScript, GitHub OAuth + API, Ed25519 |
| Frontend | Next.js 15, wallet-adapter, Tailwind, snarkjs-wasm in the browser |

## Repository layout

```text
programs/holy-wars       Anchor program: census, wars, Ed25519 attestation, ZK vote, tallies
programs/verifier-spike  Minimal reference: verifying a snarkjs Groth16 proof on-chain
circuits/                vote.circom + trusted-setup ceremony + snarkjs tests + shared Poseidon vectors
services/attestor        GitHub identity, Proof of Passion scanner, census Merkle tree   (WIP)
services/relayer         Gasless relay for votes and medal claims                        (WIP)
app/                     The live War Room                                               (WIP)
tests/                   On-chain test suite (local validator): 21 tests, mostly attacks
```

## Build & test

```bash
# prerequisites: rust, solana-cli, anchor 0.31, node 22, circom 2.x
npm install
anchor build
anchor test                      # 21 on-chain tests against a local validator

# reproduce the ZK ceremony + off-chain proof tests
cd circuits && ./scripts/setup.sh && node test/test-vote.js
```

## Honest limits (we're trolls, not liars)

- **The relayer sees your IP.** Attestor/relayer separation kills the identity↔vote link, but
  a production build wants a mixnet or random submission delays.
- **Timing correlates in a small census.** Enlisting and voting 30 seconds apart narrows the
  anonymity set. The UI nudges you to come back later.
- **`sha256(github_id)` is dictionary-guessable.** Fine for knowing *who enlisted* (that's
  public by design); production would use an HMAC.
- **The attestor is a gatekeeper for the census** — a corrupt one could refuse enrollment or
  admit fakes. It still can't see, alter, or link a single vote, and the census is publicly
  auditable.

Every one of these is a declared trade-off, not a surprise. That's the difference between a
weekend prototype and a weekend prototype that lies to you.

## Steal this architecture

Swap GitHub for any identity attestor, and "tabs vs spaces" for anything people actually fight
about, and the same primitive holds:

> **attested census → ZK membership + weight → domain-separated nullifiers → on-chain verify**

That pattern gives you: DAO governance where reputation weighs votes but nobody gets doxxed
for theirs · community polls with verified eligibility and real ballot secrecy · conference
talk selection, RFC processes, protocol referenda · any flow shaped like *"prove you belong,
prove you haven't already, reveal nothing else."*

Tabs vs spaces is just the demo this pattern deserved.

## Status

🚧 Built live during the challenge window. **Done:** the Anchor program end-to-end — attested
GitHub census, wars, and an anonymous ZK vote whose Groth16 proof is verified on-chain, with
nullifiers making double voting impossible; circuit + non-degenerate trusted setup + on-chain
verifier reference. **In progress:** attestor/relayer services, the live War Room, cNFT medals.

## License

MIT. The war, however, is eternal.
