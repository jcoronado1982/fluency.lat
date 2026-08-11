#!/usr/bin/env bash
# Cambia a la rama dev-<módulo> y activa el sparse-checkout pareado.
# Uso: ./scripts/dev-module.sh flashcards|pronoun|admin|full
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODULE="${1:-}"

if [[ -z "$MODULE" ]]; then
  echo "Uso: $0 flashcards|pronoun|admin|full"
  exit 1
fi

case "$MODULE" in
  full)
    BRANCH="dev-full"
    sparse_profile="full"
    ;;
  flashcards|pronoun|admin)
    BRANCH="dev-${MODULE}"
    sparse_profile="$MODULE"
    ;;
  *)
    echo "Módulo desconocido: $MODULE"
    exit 1
    ;;
esac

cd "$ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "ERROR: no es un repositorio git"
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git checkout -b "$BRANCH" "origin/$BRANCH"
else
  echo "ERROR: rama $BRANCH no existe. Crear desde dev-full primero."
  exit 1
fi

git pull --ff-only origin "$BRANCH" 2>/dev/null || true

exec "$ROOT/scripts/sparse-module.sh" "$sparse_profile"
