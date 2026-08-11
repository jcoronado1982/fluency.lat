#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPARSE_STATE_FILE="$REPO_ROOT/.git/info/sparse-active-modules"

source "$SCRIPT_DIR/module_registry.sh"

usage() {
  cat <<'EOF'
Uso:
  ./scripts/sparse-module.sh list
  ./scripts/sparse-module.sh status
  ./scripts/sparse-module.sh full
  ./scripts/sparse-module.sh <modulo> [modulo...]

Perfiles:
  flashcards   shell + modulo flashcards
  pronoun      shell + modulo pronoun
  admin        shell + panel admin (sin modulos de estudio)
  full         repo completo

Ejemplos:
  ./scripts/sparse-module.sh pronoun
  ./scripts/sparse-module.sh flashcards
  ./scripts/sparse-module.sh flashcards pronoun
  ./scripts/sparse-module.sh admin
  ./scripts/sparse-module.sh full

Doc: docs/GIT_SPARSE_WORKFLOW.md
EOF
}

write_sparse_state() {
  printf '%s\n' "$@" > "$SPARSE_STATE_FILE"
}

clear_sparse_state() {
  rm -f "$SPARSE_STATE_FILE"
}

mode="${1:-}"

if [[ -z "$mode" ]]; then
  usage
  exit 1
fi

case "$mode" in
  list)
    print_modules_table
    exit 0
    ;;
  status)
    if git -C "$REPO_ROOT" sparse-checkout list >/dev/null 2>&1; then
      echo "Sparse checkout: activo"
      git -C "$REPO_ROOT" sparse-checkout list | head -20
      local_count="$(git -C "$REPO_ROOT" sparse-checkout list | wc -l)"
      if [[ "$local_count" -gt 20 ]]; then
        echo "... ($local_count patrones en total)"
      fi
    else
      echo "Sparse checkout: desactivado (repo completo)"
    fi
    if [[ -f "$SPARSE_STATE_FILE" ]]; then
      echo "Perfil activo (ultimo): $(tr '\n' ' ' < "$SPARSE_STATE_FILE")"
    fi
    exit 0
    ;;
  full)
    "$SCRIPT_DIR/test-sparse-safety.sh"
    git -C "$REPO_ROOT" sparse-checkout disable
    clear_sparse_state
    bash "$SCRIPT_DIR/sparse-cargo-sync.sh" full
    if [ -f "$REPO_ROOT/client/env-profiles/full.profile" ]; then
      cp "$REPO_ROOT/client/env-profiles/full.profile" "$REPO_ROOT/client/.env.development"
      cp "$REPO_ROOT/client/env-profiles/full.profile" "$REPO_ROOT/client/.env.development.local"
    fi
    echo "Sparse checkout desactivado. Workspace completo restaurado."
    exit 0
    ;;
esac

selected_modules=()
while [[ $# -gt 0 ]]; do
  if ! module_exists "$1"; then
    echo "Modulo desconocido: $1" >&2
    echo >&2
    usage >&2
    exit 1
  fi
  selected_modules+=("$1")
  shift
done

tmp_patterns="$(mktemp)"
trap 'rm -f "$tmp_patterns"' EXIT

module_all_patterns "${selected_modules[@]}" > "$tmp_patterns"

"$SCRIPT_DIR/test-sparse-safety.sh"
git -C "$REPO_ROOT" sparse-checkout init --no-cone
git -C "$REPO_ROOT" sparse-checkout set --stdin < "$tmp_patterns"

write_sparse_state "${selected_modules[@]}"

bash "$SCRIPT_DIR/sparse-cargo-sync.sh" "${selected_modules[@]}"

if [[ "${#selected_modules[@]}" -eq 1 ]] && [ -f "$REPO_ROOT/client/env-profiles/${selected_modules[0]}.profile" ]; then
  cp "$REPO_ROOT/client/env-profiles/${selected_modules[0]}.profile" "$REPO_ROOT/client/.env.development"
  cp "$REPO_ROOT/client/env-profiles/${selected_modules[0]}.profile" "$REPO_ROOT/client/.env.development.local"
fi

echo "Sparse checkout activo para modulos: ${selected_modules[*]}"
echo "Rama Git actual: $(git -C "$REPO_ROOT" branch --show-current)"
for module in "${selected_modules[@]}"; do
  echo "  - $module | backend: $(module_backend_feature "$module") | flags: $(module_frontend_flag "$module")"
done
echo "Build backend sugerido: cargo build -p api_main $(module_cargo_build_args_multi "${selected_modules[@]}")"
