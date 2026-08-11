#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/module_registry.sh"

usage() {
  cat <<'EOF'
Uso:
  ./scripts/export-module.sh <modulo> [salida.tar.gz]

Ejemplos:
  ./scripts/export-module.sh pronoun
  ./scripts/export-module.sh flashcards /tmp/flashcards-module.tar.gz
EOF
}

module="${1:-}"
output="${2:-$REPO_ROOT/dist/${module:-module}-module.tar.gz}"

if [[ -z "$module" ]]; then
  usage
  exit 1
fi

if ! module_exists "$module"; then
  echo "Modulo desconocido: $module" >&2
  exit 1
fi

mkdir -p "$(dirname "$output")"

tmp_files="$(mktemp)"
tmp_paths="$(mktemp)"
trap 'rm -f "$tmp_files" "$tmp_paths"' EXIT

mapfile -t patterns < <(module_all_patterns "$module")

git -C "$REPO_ROOT" ls-files -z -- "${patterns[@]}" > "$tmp_paths"

while IFS= read -r -d '' path; do
  if [[ -e "$REPO_ROOT/$path" ]]; then
    printf '%s\0' "$path" >> "$tmp_files"
  fi
done < "$tmp_paths"

if [[ ! -s "$tmp_files" ]]; then
  echo "No se encontraron archivos trackeados para exportar el modulo '$module'." >&2
  exit 1
fi

tar -C "$REPO_ROOT" --null -czf "$output" --files-from="$tmp_files"

echo "Modulo exportado: $output"
echo "Backend feature: $(module_backend_feature "$module")"
echo "Frontend flags sugeridos: $(module_frontend_flag "$module")"
