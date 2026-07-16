#!/usr/bin/env bash
# Public internet URL for AETHER-2 (keep this window open while sharing)
set -e
cd "$(dirname "$0")"
PORT="${1:-5173}"

if ! curl -sf "http://127.0.0.1:${PORT}/" >/dev/null; then
  echo "Starting local server on ${PORT}..."
  ruby serve.rb "$PORT" &
  sleep 1
fi

if [[ ! -x ./bore ]]; then
  echo "Missing ./bore — download bore-cli first."
  exit 1
fi

echo ""
echo "Creating public link... leave this window open."
echo "Share the http://bore.pub:PORT address printed below with anyone."
echo ""
exec ./bore local "$PORT" --to bore.pub
