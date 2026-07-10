# Devnet deploy runbook (blocked on devnet SOL)

Status: BLOCKED — the public devnet faucet (api.devnet.solana.com) is rate-limiting airdrops
(0 SOL). Needs devnet funding: a Helius RPC (better faucet) or a pre-funded keypair.

Steps once ~3 SOL are available on the deployer wallet (`solana address`):

```bash
solana config set --url devnet   # or the Helius devnet RPC
anchor keys sync                  # align declare_id / Anchor.toml to target/deploy/holy_wars-keypair.json
anchor build
anchor deploy --provider.cluster devnet
# initialize config + create the 3 wars:
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-node scripts/create-wars.ts
```

Note: declare_id currently r4VBoN..., deploy keypair FHj8ba... — `anchor keys sync` reconciles them
before deploy (then rebuild).

Metrics unlocked by this (SPEC §10): "Groth16 proof verified on-chain in DEVNET (tx in Explorer)",
"3 wars active". The full vote flow already passes on localnet (10/10).
