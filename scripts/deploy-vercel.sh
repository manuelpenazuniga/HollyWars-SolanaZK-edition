#!/usr/bin/env bash
# Deploys the HOLY WARS frontend (app/) to Vercel production.
# Requires VERCEL_TOKEN and HELIUS_DEVNET_RPC in ../.env (repo root).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TOKEN="$(grep '^VERCEL_TOKEN=' .env | cut -d= -f2- | tr -d ' ')"
RPC="$(grep '^HELIUS_DEVNET_RPC=' .env | cut -d= -f2- | tr -d ' ')"
if [ -z "${TOKEN:-}" ]; then echo "ERROR: VERCEL_TOKEN missing in .env"; exit 2; fi
if [ -z "${RPC:-}" ]; then echo "ERROR: HELIUS_DEVNET_RPC missing in .env"; exit 2; fi

cd "$ROOT/app"
echo "== whoami =="
npx --yes vercel@latest whoami --token="$TOKEN" || true

# NEXT_PUBLIC_RPC is inlined at build time; pass as build-env so the client bundle
# points at the Helius devnet RPC. (Devnet key, rate-limited — acceptable to expose.)
echo "== deploying app/ to production =="
npx --yes vercel@latest deploy --prod --yes \
  --token="$TOKEN" \
  --build-env NEXT_PUBLIC_RPC="$RPC" \
  --env NEXT_PUBLIC_RPC="$RPC" \
  2>&1 | tee "$ROOT/scripts/.vercel-deploy.out"

echo "== done =="
tail -1 "$ROOT/scripts/.vercel-deploy.out"
