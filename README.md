<div align="center">

<img src="img/logo.png" alt="The Holy Wars champions: a purple fox with a sword and a green cat with a bow" width="440">

# ⚔️ HOLY WARS: The Eternal Scoreboard

[![Solana](https://img.shields.io/badge/Solana-devnet-14F195?logo=solana&logoColor=white)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.31-512BD4)](https://www.anchor-lang.com)
[![circom](https://img.shields.io/badge/circom-2.x-8A2BE2)](https://docs.circom.io)
![](https://img.shields.io/badge/double_voting-cryptographically_impossible-red)
![](https://img.shields.io/badge/your_hypocrisy-detected_on--chain-orange)
![](https://img.shields.io/badge/ballot-zero--knowledge-black)

**Tabs vs Spaces. Vim vs Emacs. Dark vs Light.**
Fifty years of flame wars and not a single binding resolution, because every poll
ever run could be botted, brigaded, or voted on twice from incognito mode.

**Holy Wars settles them where nobody can cheat: an immutable scoreboard on Solana,
with anonymous zero-knowledge ballots weighted by your actual commit history.**

Yes, this is a joke. No, the cryptography is not.

[**Live War Room**](https://holly-wars-solana-zk-edition-app.vercel.app) ·
[**Program on Explorer**](https://explorer.solana.com/address/FHj8baQvc17Qny8TvndTtkjh2iqKgu9ucQgynwD6J1WG?cluster=devnet) ·
[**A real ZK vote, verified on-chain**](https://explorer.solana.com/tx/23FiuFiXymcNwGm43yNqh7uRNEfSm6UYYQiJiDaAUCUDXNfr3at1tc5KrsLQpqNwF78NFygBHJcHNZzW5UWxbxMi?cluster=devnet)

</div>

Built in one weekend for the [DEV Weekend Challenge: Passion Edition](https://dev.to/challenges/weekend-2026-07-09)
(*Best Use of Solana*). Three wars live on devnet, program `FHj8ba…J1WG`.

---

## The problem nobody asked us to solve

Holy wars are the original developer fandom: decades of pure, obsessive, tribal passion.
And yet every attempt to settle them is worthless, because an internet poll fails in four ways:

1. **Bots vote.**
2. **People vote twice.** (You know who you are.)
3. **Voting publicly doxxes you.** Imagine your team lead discovering you're a tabs person.
4. **Nobody's passion is measured.** A lifelong spaces engineer can vote tabs *ironically* and it counts the same.

Fix all four and, surprise, the joke has quietly become a real electronic-voting spec:

| Requirement | Which is, technically speaking… |
|---|---|
| Only real developers vote | Sybil resistance |
| One dev, one vote | Double-spend prevention |
| Nobody learns your side, not even the operators | Ballot secrecy via zero-knowledge proofs |
| Your history backs your vote | Attested, weighted ballots |
| The result can never be quietly edited | On-chain, publicly auditable tally |

An anonymous, weighted, sybil-resistant, verifiable election. For tabs vs spaces.
We regret nothing.

## How you fight

1. **Enlist (public).** Sign in with GitHub. An attestor verifies your account belongs to a
   real developer (six months or older, actual activity), scans your repos to compute your
   **Proof of Passion** weight, and signs your entry into the census. One GitHub account = one
   census leaf per war, enforced by a PDA derived from `hash(github_id)`: bring a thousand
   wallets, you still get one ballot. A wallet is optional; the relayer pays for everything,
   and you only need one later if you want your medal.
2. **Vote (anonymous).** Your browser rebuilds the census Merkle tree from chain data and
   forges a Groth16 proof stating *"I am someone in the census, my chosen side is worth
   weight W, and I have not voted in this war"*, without revealing who you are. A relayer
   submits it: your wallet never touches the ballot box. Optionally attach an anonymous
   **battle cry** (up to 140 bytes of pure taunting).
3. **Watch the front line move.** Solana finalizes in ~400 ms, so the scoreboard is a live
   event: every vote shoves the battle line within half a second, over a websocket.
4. **Claim your scar.** When the war closes, claim a **veteran medal** with a *second*
   zero-knowledge proof, to any wallet you like, even a fresh one. The medal proves you
   fought. It cannot reveal your side. Not "we promise we won't tell": *cannot*
   (see the two-nullifier trick below).

## Proof of Passion™: your commits testify against you

<img src="img/green.png" align="right" width="130" alt="Green the archer, who judges your indentation from a distance">

Your vote is not worth 1. It is worth what your history proves.

At enlistment, the attestor samples your public repos and reads your actual indentation.
Eight years of spaces-indented code and now you're voting tabs? Enjoy your minimum-weight
ballot. **The system calls you a hypocrite, mathematically, to your face.** For Vim vs Emacs
it hunts your dotfiles for `.vimrc` and `init.el` like a detective going through your trash.

Two design details we're genuinely proud of:

- **Weights are coarse on purpose.** Three tiers, `{1, 2, 3}`. A fine-grained weight (say,
  7.3/10) in a small census is a fingerprint: publish it as a public input and you've
  de-anonymized the voter. Coarse tiers keep the anonymity set fat.
- **You get a weight per side**, `(weight_a, weight_b)`, because your coherence depends on
  what you vote, and your vote is secret. Both weights are baked into your census commitment;
  the ZK circuit exposes *only* the weight of the side you actually chose, unlinked from you.

## The part where we stop joking

<img src="img/purple.png" align="right" width="130" alt="Purple the blade, who guards the ballot box">

### The circuits (`circuits/vote.circom`, `circuits/medal.circom`)

The vote circuit has 12,131 constraints, Poseidon everywhere, and proves in the browser with
snarkjs. In one proof, a voter shows:

```text
inner  = Poseidon(nullifier_seed, trapdoor)          // my secrets
leaf   = Poseidon(inner, weight_a, weight_b)         // my census leaf
leaf is in the Merkle census (depth 20 → 1,048,576 devs)
nullifier_hash = Poseidon(seed, war_id, "VOTE")      // my one-vote token
side ∈ {0, 1}
weight = side == 0 ? weight_a : weight_b             // only the chosen side's weight leaks
weight ∈ {1, 2, 3}
```

The medal circuit (12,127 constraints) proves the same census membership under a different
nullifier domain. And yes, the domain separators are ASCII smuggled into field elements:
`1448039493` spells `"VOTE"`, and the medal domain spells `"MEDL"`.

### The nested commitment: you cannot inflate your own ego

The client only ever sends `inner = Poseidon(seed, trapdoor)` to the attestor. The **attestor**
computes `leaf = Poseidon(inner, weight_a, weight_b)` with the weights *it* assigned, and signs
that. So the client can't self-award weight 3, and the attestor never learns the secrets that
would let it link a future vote back to you. Mutual distrust, resolved by one extra hash.

### Two nullifiers, zero correlation

The vote nullifier is `Poseidon(seed, war_id, "VOTE")`; the medal nullifier uses a different
domain constant. Same secret, separate domains: correlating them is as hard as breaking the
hash. You can claim your veteran medal on a brand-new wallet and no indexer, no attestor, no
subpoena can connect it to your ballot. The medal says *"I fought"*. It refuses to say for whom.
[Here is one landing on a fresh wallet](https://explorer.solana.com/tx/3PSFqDEzj194iKBKcHWU7u1MdiiTDxtqVXWfT4Dzn7SMz6BH8osw15PuM7EVL4hX6iLC452Up48kFagVEinCB6mu?cluster=devnet).

### A Groth16 verifier that costs pocket change

The proof is verified **on-chain, inside the vote instruction**, using Solana's `alt_bn128`
syscalls via [`groth16-solana`](https://github.com/Lightprotocol/groth16-solana):

- proof verification: **~103k compute units**
- the entire `vote` instruction (checks + verify + tally + event): **~118k CU**, under 9% of
  a 1.4M CU budget

Solana is one of the very few L1s where a SNARK verify just… fits in a normal transaction.
That's the whole reason the live scoreboard can be trustless instead of a database with vibes.

### The browser trusts nobody, including us

The voting booth does not accept a Merkle path from the attestor (a malicious attestor could
hand you a path into a different tree). Instead it downloads the raw census leaves, rebuilds
the entire depth-20 tree locally with a verbatim port of the attestor's algorithm, and refuses
to prove until two things hold: its locally computed root byte-matches the on-chain
`census_root`, and its own leaf is actually present in the snapshot it fetched.

Your secrets (`trapdoor`, `nullifier_seed`) are generated in the browser and never leave it.
Every proof is self-verified locally before it is relayed, because the on-chain verifier fails
*silently* on malformed bytes: the proof serializer (negate `A`, swap every G2 point's Fp2
coordinates to imaginary-first) is a pure function, golden-tested against a proof that was
already verified on-chain.

### Paranoia, itemized

The fun parts of this codebase are the attacks it refuses to allow:

- **The tally only moves with proof-bound values.** `root`, `war_id`, `side`, `weight` and the
  nullifier are public inputs *of the verified proof*; the program never trusts a parallel
  argument. (Verifying a ZK proof and then summing an unbound arg is security theater. We've
  seen it. We test against it.)
- **The nullifier PDA is seeded from the same bytes the proof verifies**, so replaying a valid
  proof with a different argument can't mint a second vote.
- **Field-element downcasts are range-checked.** 31 high bytes must be zero before a 32-byte
  public input becomes a `u8`, so a corrupted verifying key cannot silently poison the tally.
- **Ed25519 attestation via instruction introspection, with pinned indices.** The census
  registration checks the attestor's signature by introspecting a preceding Ed25519Program
  instruction, and pins `signature/pubkey/message_instruction_index` to the `0xFFFF` sentinel.
  Skip that pin and an attacker can have the runtime validate *someone else's* signature while
  your program reads benign bytes. Introspection without pinning is not verification.
- **The trusted setup is provably non-degenerate.** War story: our first Groth16 setup skipped
  the phase-2 contribution, leaving `γ == δ ==` the G2 generator, which lets anyone **forge
  valid proofs for arbitrary public inputs without a witness**. Fake ballots, unbounded, for
  free. An adversarial audit caught it before it ever reached devnet. The ceremony now includes
  a real contribution plus a public beacon, and a test permanently asserts
  `vk_gamma_2 != vk_delta_2`. Lesson: test your *ceremony*, not just your circuit.

The on-chain test suite (local validator) is mostly a museum of these attacks: double votes,
cross-war proof replay, stale roots, tampered public inputs, forged attestors, unpinned
introspection, duplicate census leaves, oversized battle cries.

## Why Solana

| What the war needs | What Solana provides |
|---|---|
| The scoreboard as a *live event* | ~400 ms finality + websocket `accountSubscribe`: votes land on screen in < 500 ms |
| SNARK verification inside a vote tx | `alt_bn128` syscalls → Groth16 for ~103k CU |
| One-ballot-per-identity, enforceable | PDAs as existence proofs: census entries and nullifiers |
| A medal for every veteran | Medal records as program accounts today; compressed-NFT mint on the roadmap |

## Anti-sybil: the roads not taken

| Mechanism | Attacker's cost | Why it's not enough alone |
|---|---|---|
| Minimum SOL balance | ~0 (rotate the same SOL) | Broken |
| Locked stake | Linear in wallets | Plutocracy; devnet SOL is free |
| Wallet age | Old wallets sell cheap | Not verifiable on-chain without an oracle |
| **GitHub ≥ 6 months + real activity (chosen)** | Aged accounts with history don't grow on weekends | Needs an attestor: trusted for the *census*, never for votes |
| Quadratic voting | n/a | *Amplifies* sybils without an identity layer underneath |

Design conclusion: **identity anchored in GitHub, privacy anchored in ZK, passion anchored in
commits.** The attestor only gates who enters the census, and since every census entry is a
public PDA, anyone can rebuild the Merkle tree and audit the posted root. Cryptographically,
it *cannot* link a ballot to a person.

## Architecture

```text
Browser ──OAuth──▶ /api/enroll (attestor) ─Ed25519 attestation─▶ Anchor program (devnet)
   │                · GitHub check + Proof of Passion  register()  · Config / War / CensusEntry PDAs
   │                · census Merkle ──── post_root() ─────────▶    · vote + medal nullifier PDAs
   │ snarkjs (wasm)                                                · Groth16 verifier (alt_bn128)
   └──256-byte proof──▶ /api/relay-vote (relayer) ──vote()──▶      · tallies + battle-cry events
        ▲                                                                 │
        └────────────── websocket accountSubscribe (~400 ms) ─────────────┘
                          Live War Room (Next.js on Vercel)
```

The attestor and the relayer are **separate trust domains**: the attestor knows identities but
never sees votes; the relayer sees votes but never identities. Both ship as same-origin
Next.js API routes, and both are stateless: the census tree is rebuilt from on-chain accounts
on every cold start. There is no Postgres, no Redis, no cache. The chain is the only database
in this project.

| Layer | Tech |
|---|---|
| Program | Rust + Anchor 0.31, `groth16-solana`, `alt_bn128` syscalls |
| ZK | circom 2.x + snarkjs (bn254), Poseidon (circomlib), Powers of Tau + phase-2 ceremony |
| Attestor / Relayer | Next.js API routes, GitHub OAuth + API, Ed25519 |
| Frontend | Next.js 15, wallet-adapter (optional by design), Tailwind, snarkjs-wasm in the browser |

## Repository layout

```text
programs/holy-wars       Anchor program: census, wars, Ed25519 attestation, ZK vote + medal, tallies
programs/verifier-spike  Minimal reference: verifying a snarkjs Groth16 proof on-chain
circuits/                vote.circom + medal.circom, trusted-setup ceremony, snarkjs tests
app/                     The War Room: live scoreboard, enlist wizard, in-browser prover
app/app/api/             Attestor + relayer as serverless routes (OAuth, Proof of Passion, gasless relay)
services/                Standalone attestor/relayer (where the API routes grew up; full test suites)
scripts/                 Devnet runbooks: deploy, create wars, e2e vote + medal claim
tests/                   On-chain test suite (local validator), mostly a museum of attacks
```

## Build & run

```bash
# prerequisites: rust, solana-cli, anchor 0.31, node 22, circom 2.x
npm install
anchor build
anchor test                      # on-chain suite against a local validator

# reproduce the ZK ceremony + off-chain proof tests
cd circuits && ./scripts/setup.sh && node test/test-vote.js

# run the War Room against devnet
cd app && npm run dev
```

## Honest limits (we're trolls, not liars)

- **The relayer sees your IP** (and, since it runs as a Vercel function, so does Vercel).
  Attestor/relayer separation kills the identity-to-vote link, but a production build wants a
  mixnet or random submission delays.
- **Timing correlates in a small census.** Enlisting and voting 30 seconds apart narrows the
  anonymity set. The UI nudges you to come back later.
- **`sha256(github_id)` is dictionary-guessable.** Fine for knowing *who enlisted* (that's
  public by design); production would use an HMAC.
- **The attestor is a gatekeeper for the census.** A corrupt one could refuse enrollment or
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

**Live on devnet, end to end.** Attested GitHub census with Proof of Passion weights. Three
open wars. Anonymous votes forged in the browser and verified on-chain. Nullifiers making
double voting impossible. A war room that reads Solana directly, with an always-on badge
telling you whether you're looking at live devnet data or a sample. Veteran medals claimed
with a second proof, to wallets that have no on-chain relationship with the ballot.

**Roadmap:** compressed-NFT medal mint (Bubblegum), a third circuit proving *"I voted for the
winning side"* without revealing the vote, permissionless war creation, quadratic weights.

## License

MIT. The war, however, is eternal.

<div align="center">
<img src="img/logo.png" alt="Purple and Green, ready for battle" width="300">

*Two champions. Every war. The scoreboard is forever.*
</div>
