#!/usr/bin/env sh
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROJECT_DIR"
if [ -x "$PROJECT_DIR/.tools/node/bin/node" ]; then
  PATH="$PROJECT_DIR/.tools/node/bin:$PATH"
  export PATH
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 22.12 or newer, then run npm ci." >&2
  exit 1
fi
exec npm run "${1:-dev}"
