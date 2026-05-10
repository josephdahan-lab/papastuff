#!/usr/bin/env bash
set -e

if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install Node 18+ from https://nodejs.org"
  exit 1
fi

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies…"
  npm install
fi

echo ""
echo "  ╔═══════════════════════════╗"
echo "  ║       PapaStuff 🚀         ║"
echo "  ╚═══════════════════════════╝"
echo ""

# Port 80 needs privileges. Either:
#   sudo PORT=80 ./start.sh
# or grant the node binary capability once:
#   sudo setcap cap_net_bind_service=+ep "$(readlink -f "$(which node)")"
# Override port at runtime:  PORT=8080 ./start.sh

exec node server.js
