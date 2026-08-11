#!/usr/bin/env bash
# Ajusta Cargo.toml al perfil sparse activo.
# Seguridad: este script no elimina carpetas manualmente. La materializacion de archivos
# versionados pertenece exclusivamente a `git sparse-checkout`; los archivos locales,
# ignorados o no versionados nunca se podan aqui.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/module_registry.sh"

sparse_restore_cargo_from_git() {
  git -C "$REPO_ROOT" show HEAD:backend/Cargo.toml > "$REPO_ROOT/backend/Cargo.toml"
  git -C "$REPO_ROOT" show HEAD:backend/api_main/Cargo.toml > "$REPO_ROOT/backend/api_main/Cargo.toml"
}

sparse_patch_workspace_members() {
  local modules=("$@")
  local members_line
  members_line="$(module_workspace_members "${modules[@]}")"
  local ws="$REPO_ROOT/backend/Cargo.toml"
  sed -i "s|^members = \[.*\]|members = [${members_line}]|" "$ws"
}

sparse_patch_api_main() {
  local modules=("$@")
  local api="$REPO_ROOT/backend/api_main/Cargo.toml"
  local tmp
  tmp="$(mktemp)"

  cp "$api" "$tmp"

  if ! module_selected_contains flashcards "${modules[@]}"; then
    sed -i '/^mod_flashcards = /d' "$tmp"
    sed -i '/^flashcards = /d' "$tmp"
    sed -i 's/default = \["flashcards", "auth"\]/default = ["auth"]/' "$tmp"
    sed -i 's/default = \["auth", "flashcards"\]/default = ["auth"]/' "$tmp"
  fi

  if ! module_selected_contains pronoun "${modules[@]}"; then
    sed -i '/^pronoun_practice = /d' "$tmp"
  fi

  if module_selected_contains pronoun "${modules[@]}" \
    && ! module_selected_contains flashcards "${modules[@]}"; then
    sed -i 's/default = \["flashcards", "auth"\]/default = ["auth", "pronoun_practice"]/' "$tmp"
  elif module_selected_contains admin "${modules[@]}" \
    && [[ "${#modules[@]}" -eq 1 ]]; then
    sed -i 's/default = \["flashcards", "auth"\]/default = ["auth"]/' "$tmp"
  fi

  mv "$tmp" "$api"
}

sparse_sync_for_modules() {
  local modules=("$@")
  sparse_restore_cargo_from_git
  sparse_patch_workspace_members "${modules[@]}"
  sparse_patch_api_main "${modules[@]}"
}

sparse_restore_full() {
  sparse_restore_cargo_from_git
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if [[ "${1:-}" == "full" ]]; then
    sparse_restore_full
    echo "Cargo workspace restaurado (full)."
  else
    sparse_sync_for_modules "$@"
  fi
fi
