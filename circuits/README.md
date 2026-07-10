# ZK Circuits

- `vote.circom` — anonymous vote proof: per-war Poseidon Merkle census membership, a passion
  weight in `{1,2,3}` bound to the chosen side, and a unique per-war nullifier. Curve bn254.
- Trusted setup (Powers of Tau + Groth16) and the exported verifying key live here.

```bash
npm install
bash scripts/setup.sh      # compile, run the trusted setup, export the verifying key
node test/test-vote.js     # off-chain prove/verify + negative cases
```
