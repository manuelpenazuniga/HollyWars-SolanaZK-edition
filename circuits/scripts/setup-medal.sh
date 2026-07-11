#!/usr/bin/env bash
set -euo pipefail
# Holy Wars — Medal Circuit Setup (Groth16, bn254). Reuses build/pot16_final.ptau.
# Generates: build/medal.r1cs, build/medal_final.zkey, build/medal_verification_key.json
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
CIRCUITS_DIR="$SCRIPT_DIR"

if [ ! -f "$BUILD_DIR/pot16_final.ptau" ]; then echo "ERROR: pot16_final.ptau missing — run setup.sh first"; exit 2; fi

echo "=== Compiling medal.circom ==="
circom "$CIRCUITS_DIR/medal.circom" --r1cs --wasm --sym -o "$BUILD_DIR" -l "$SCRIPT_DIR/../node_modules"

echo "=== Groth16 setup (phase 2 init) ==="
npx snarkjs groth16 setup "$BUILD_DIR/medal.r1cs" "$BUILD_DIR/pot16_final.ptau" "$BUILD_DIR/medal_0000.zkey"

echo "=== Phase-2 contribution (SECURITY-CRITICAL: randomizes delta so gamma!=delta) ==="
ENTROPY="$(openssl rand -hex 64)"
npx snarkjs zkey contribute "$BUILD_DIR/medal_0000.zkey" "$BUILD_DIR/medal_c1.zkey" --name="holywars-medal-phase2-1" -e="$ENTROPY"
npx snarkjs zkey beacon "$BUILD_DIR/medal_c1.zkey" "$BUILD_DIR/medal_final.zkey" \
  0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20 10 --name="holywars-medal-beacon"
rm -f "$BUILD_DIR/medal_0000.zkey" "$BUILD_DIR/medal_c1.zkey"

echo "=== Verifying zkey ==="
npx snarkjs zkv "$BUILD_DIR/medal.r1cs" "$BUILD_DIR/pot16_final.ptau" "$BUILD_DIR/medal_final.zkey"

echo "=== Exporting verification key ==="
npx snarkjs zkey export verificationkey "$BUILD_DIR/medal_final.zkey" "$BUILD_DIR/medal_verification_key.json"
cp "$BUILD_DIR/medal_verification_key.json" "$CIRCUITS_DIR/medal_verification_key.json"

echo "=== Medal setup complete ==="
npx snarkjs r1cs info "$BUILD_DIR/medal.r1cs"
