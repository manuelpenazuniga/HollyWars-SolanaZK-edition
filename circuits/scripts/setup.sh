#!/usr/bin/env bash
set -euo pipefail
# Holy Wars — Vote Circuit Setup (Groth16, bn254/bn128)
# Generates: build/vote.r1cs, build/vote_final.zkey, build/verification_key.json
# Required: circom 2.x, snarkjs (via npx)

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
CIRCUITS_DIR="$SCRIPT_DIR"

mkdir -p "$BUILD_DIR"

echo "=== Compiling vote.circom ==="
circom "$CIRCUITS_DIR/vote.circom" --r1cs --wasm --sym -o "$BUILD_DIR" -l "$SCRIPT_DIR/../node_modules"

echo ""
echo "=== Generating Powers of Tau (pot16) ==="
if [ ! -f "$BUILD_DIR/pot16_final.ptau" ]; then
  npx snarkjs powersoftau new bn128 16 "$BUILD_DIR/pot16_0000.ptau" -v
  npx snarkjs powersoftau contribute "$BUILD_DIR/pot16_0000.ptau" "$BUILD_DIR/pot16_0001.ptau" --name="holywars" -e="$(date +%s)"
  npx snarkjs powersoftau prepare phase2 "$BUILD_DIR/pot16_0001.ptau" "$BUILD_DIR/pot16_final.ptau" -v
  rm -f "$BUILD_DIR/pot16_0000.ptau" "$BUILD_DIR/pot16_0001.ptau"
  echo "  PTAU written to build/pot16_final.ptau"
else
  echo "  PTAU already exists, skipping"
fi

echo ""
echo "=== Groth16 Setup (phase 2 init) ==="
npx snarkjs groth16 setup "$BUILD_DIR/vote.r1cs" "$BUILD_DIR/pot16_final.ptau" "$BUILD_DIR/vote_0000.zkey"

echo ""
echo "=== Phase-2 contribution (SECURITY-CRITICAL) ==="
# Without a real phase-2 contribution, delta == gamma == G2 generator, which lets an
# attacker FORGE valid proofs for ANY public inputs without a witness (proof_a=-alpha,
# proof_b=beta, proof_c=-vk_x). The contribution randomizes delta (toxic waste) so
# gamma != delta and forgery requires the discrete log of delta. (Caught by GPT-5.5 audit.)
ENTROPY="$(openssl rand -hex 64)"
npx snarkjs zkey contribute "$BUILD_DIR/vote_0000.zkey" "$BUILD_DIR/vote_c1.zkey" --name="holywars-phase2-1" -e="$ENTROPY"
# A public verifiable random beacon finalizes the ceremony (any prior contributor can no longer cheat).
npx snarkjs zkey beacon "$BUILD_DIR/vote_c1.zkey" "$BUILD_DIR/vote_final.zkey" \
  0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20 10 --name="holywars-beacon"
rm -f "$BUILD_DIR/vote_0000.zkey" "$BUILD_DIR/vote_c1.zkey"

echo ""
echo "=== Verifying zkey (incl. phase-2 contributions) ==="
npx snarkjs zkv "$BUILD_DIR/vote.r1cs" "$BUILD_DIR/pot16_final.ptau" "$BUILD_DIR/vote_final.zkey"

echo ""
echo "=== Exporting verification key ==="
npx snarkjs zkey export verificationkey "$BUILD_DIR/vote_final.zkey" "$BUILD_DIR/verification_key.json"
cp "$BUILD_DIR/verification_key.json" "$CIRCUITS_DIR/verification_key.json"

echo ""
echo "=== Setup complete ==="
