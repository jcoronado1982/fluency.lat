#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/module_registry.sh"

usage() {
  cat <<'EOF'
Uso:
  ./scripts/validate-module.sh <modulo> [modulo...]

Valida una combinacion modular completa:
  - cargo check con todas las features activas
  - patrones sparse del registry
  - test de rutas del shell frontend
  - build frontend con solo los modulos seleccionados
EOF
}

modules=("$@")
if [[ ${#modules[@]} -eq 0 ]]; then
  usage
  exit 1
fi

for module in "${modules[@]}"; do
  if ! module_exists "$module"; then
    echo "Modulo desconocido: $module" >&2
    exit 1
  fi
done

echo "==> Validando modulos: ${modules[*]}"

echo "==> Seguridad sparse"
"$SCRIPT_DIR/test-sparse-safety.sh"

echo "==> cargo check ($(module_cargo_build_args_multi "${modules[@]}"))"
cargo check --manifest-path "$REPO_ROOT/backend/Cargo.toml" -p api_main $(module_cargo_build_args_multi "${modules[@]}")

echo "==> Patrones sparse"
module_all_patterns "${modules[@]}" | while IFS= read -r pattern; do
  if [[ -z "$pattern" ]]; then
    continue
  fi
  if [[ ! -e "$REPO_ROOT/$pattern" ]]; then
    echo "WARN: patron sin ruta local (puede ser normal si sparse esta activo): $pattern" >&2
  fi
done

if [[ -d "$REPO_ROOT/client/node_modules" ]]; then
  echo "==> npm run test:routing"
  (
    cd "$REPO_ROOT/client"
    npm run test:routing
  )

  echo "==> npm run build (perfil sintetico)"
  (
    cd "$REPO_ROOT/client"
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      export "$line"
    done < <(module_frontend_env_lines "${modules[@]}")
    npm run build
  )
else
  echo "WARN: client/node_modules no existe; se omite validacion frontend." >&2
fi

echo "OK: validacion completada para ${modules[*]}"
