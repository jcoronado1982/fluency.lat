#!/usr/bin/env bash
set -euo pipefail

prompt="${*:-}"
if [[ -z "$prompt" ]]; then
  prompt="$(cat)"
fi

backend_url="${BACKEND_URL:-http://127.0.0.1:${PORT:-8080}}"

curl -s "${backend_url%/}/api/local-agent/turn" \
  -H 'Content-Type: application/json' \
  -d "{\"prompt\":$(printf '%s' "$prompt" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"
