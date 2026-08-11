#!/usr/bin/env bash
# Crea o actualiza una rama dev-* con solo los archivos del perfil modular indicado.
# Uso: ./scripts/create-dev-module-branch.sh admin|flashcards|pronoun [rama-base]
#
# dev-full NO se modifica: trabaja desde una rama temporal o la base que indiques.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${1:-}"
BASE_BRANCH="${2:-temp/setup-module-branches}"

source "$ROOT/scripts/module_registry.sh"

usage() {
  cat <<'EOF'
Uso:
  ./scripts/create-dev-module-branch.sh admin|flashcards|pronoun [rama-base]

Crea la rama dev-* pareada al perfil sparse y commitea:
  - archivos podados (solo shell + módulo activo)
  - Cargo.toml ajustado al workspace del perfil
  - client/.env.development del perfil
  - .branch-profile (metadatos del perfil)

Ramas resultantes:
  admin      → dev-admin      (solo shell + admin/auth)
  flashcards → dev-flashcards (shell + landing + dashboard + flashcards)
  pronoun    → dev-pronoun    (shell + admin + pronoun)

No toca dev-full. Ejecutar primero desde temp/setup-module-branches.
EOF
}

case "$PROFILE" in
  admin)
    BRANCH="dev-admin"
    MODULES=(admin)
    ;;
  flashcards)
    BRANCH="dev-flashcards"
    MODULES=(landing dashboard flashcards)
    ;;
  pronoun)
    BRANCH="dev-pronoun"
    MODULES=(pronoun)
    ;;
  *)
    usage
    exit 1
    ;;
esac

if ! git -C "$ROOT" rev-parse --verify "$BASE_BRANCH" >/dev/null 2>&1; then
  echo "ERROR: rama base '$BASE_BRANCH' no existe." >&2
  exit 1
fi

cd "$ROOT"

echo "==> Base: $BASE_BRANCH → Rama: $BRANCH (perfil: ${MODULES[*]})"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
  git reset --hard "$BASE_BRANCH"
else
  git checkout -b "$BRANCH" "$BASE_BRANCH"
fi

"$ROOT/scripts/sparse-module.sh" "${MODULES[@]}"

# sparse-checkout oculta archivos en disco pero no los saca del índice Git
sparse_git_rm_inactive_modules() {
  local active=("$@")
  local module path
  for module in flashcards pronoun; do
    if module_selected_contains "$module" "${active[@]}"; then
      continue
    fi
    while IFS= read -r path; do
      [[ -z "$path" ]] && continue
      if git ls-files -- "$path" | grep -q .; then
        echo "Git rm (fuera de perfil): $path"
        git rm -rf --sparse -- "$path"
      fi
    done < <(module_disk_paths "$module")
  done
}
sparse_git_rm_inactive_modules "${MODULES[@]}"

cp "$ROOT/client/env-profiles/$PROFILE.profile" "$ROOT/client/.env.development"

cat > "$ROOT/.branch-profile" <<EOF
# Perfil de rama — no editar a mano; regenerar con create-dev-module-branch.sh
branch=$BRANCH
profile=$PROFILE
modules=${MODULES[*]}
sparse_command=./scripts/sparse-module.sh ${MODULES[*]}
cargo_build=cargo build -p api_main $(module_cargo_build_args_multi "${MODULES[@]}")
frontend_flags=$(module_frontend_flag "$PROFILE")
env_profile=client/env-profiles/$PROFILE.profile
apply_env=cp client/env-profiles/$PROFILE.profile client/.env.development
EOF

git add -A

if git diff --cached --quiet; then
  echo "WARN: sin cambios respecto a la base; la rama ya estaba al día."
else
  git commit -m "$(cat <<EOF
chore: perfil modular $PROFILE en rama $BRANCH

Solo shell compartido + módulo(s): ${MODULES[*]}.
Cargo workspace y flags Vite ajustados al perfil.
Regenerar: ./scripts/create-dev-module-branch.sh $PROFILE
EOF
)"
fi

echo "==> Validando compilación..."
cargo check --manifest-path "$ROOT/backend/Cargo.toml" -p api_main \
  $(module_cargo_build_args_multi "${MODULES[@]}")

echo ""
echo "OK: rama $BRANCH lista."
echo "  Perfil: ${MODULES[*]}"
echo "  Build:  cargo build -p api_main $(module_cargo_build_args_multi "${MODULES[@]}")"
echo "  Flags:  $(module_frontend_flag "$PROFILE")"
