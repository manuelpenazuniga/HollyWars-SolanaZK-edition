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
echo "=== Groth16 Setup (phase 2) ==="
npx snarkjs groth16 setup "$BUILD_DIR/vote.r1cs" "$BUILD_DIR/pot16_final.ptau" "$BUILD_DIR/vote_final.zkey"

echo ""
echo "=== Verifying zkey ==="
npx snarkjs zkv "$BUILD_DIR/vote.r1cs" "$BUILD_DIR/pot16_final.ptau" "$BUILD_DIR/vote_final.zkey"

echo ""
echo "=== Exporting verification key ==="
npx snarkjs zkey export verificationkey "$BUILD_DIR/vote_final.zkey" "$BUILD_DIR/verification_key.json"
cp "$BUILD_DIR/verification_key.json" "$CIRCUITS_DIR/verification_key.json"

echo ""
echo "=== Setup complete ==="
