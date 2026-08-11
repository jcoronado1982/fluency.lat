#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
targets=(
  "$SCRIPT_DIR/sparse-module.sh"
  "$SCRIPT_DIR/sparse-cargo-sync.sh"
)

destructive_pattern='(^|[;&|[:space:]])rm[[:space:]]+-[^[:space:]]*([rR][^[:space:]]*[fF]|[fF][^[:space:]]*[rR])'

if grep -nE "$destructive_pattern" "${targets[@]}"; then
  echo "ERROR: el flujo sparse no puede contener rm recursivo y forzado." >&2
  exit 1
fi

if grep -nF 'sparse_prune_inactive_modules' "${targets[@]}"; then
  echo "ERROR: no se permite reintroducir poda manual en el flujo sparse." >&2
  exit 1
fi

echo "OK: sparse sin rm recursivo/forzado ni poda manual."
