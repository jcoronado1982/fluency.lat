#!/bin/bash
# Aplica json/ del repo (staging del pipeline) al repositorio de producción en Oracle.
# rsync --update: solo sube archivos nuevos o más recientes que los de disco.
set -euo pipefail

SOURCE="${1:?source json directory required}"
DEST="${2:-/root/smart-proxy/repository/flashcard/json}"

if [[ ! -d "$SOURCE" ]]; then
  echo "ERROR: directorio origen no encontrado: $SOURCE"
  exit 1
fi

if [[ ! -f "$SOURCE/catalog-manifest.json" ]]; then
  echo "ERROR: falta catalog-manifest.json; ejecutar catalog:generate antes del deploy"
  exit 1
fi

mkdir -p "$DEST"

echo "Sync json/ → $DEST (incremental, sin borrar decks solo en Oracle)..."
rsync -a --update "$SOURCE/" "$DEST/"

# Archivos planos heredados que ya fueron migrados a mazos temáticos por nivel.
# La poda es intencionalmente explícita: no usar --delete porque Oracle puede
# contener decks generados o administrados fuera del repositorio.
LEGACY_JSON_PATHS=(
  "es_en/nouns/1-basic.json"
  "es_en/nouns/2-intermediate.json"
  "es_en/nouns/3-advanced.json"
  "es_en/verbs/1-basic.json"
  "es_en/verbs/2-intermediate.json"
  "es_en/verbs/3-advanced.json"
  "landing-demo/verbs-essentials.json"
  "nouns/1-basic.json"
  "nouns/2-intermediate.json"
  "nouns/3-advanced.json"
  "verbs/1-basic.json"
  "verbs/2-intermediate.json"
  "verbs/3-advanced.json"
)

PRUNED_JSON_COUNT=0
for relative_path in "${LEGACY_JSON_PATHS[@]}"; do
  # Si el archivo vuelve a versionarse, el staging gana y deja de considerarse legado.
  if [[ ! -e "$SOURCE/$relative_path" && -f "$DEST/$relative_path" ]]; then
    rm -f -- "$DEST/$relative_path"
    PRUNED_JSON_COUNT=$((PRUNED_JSON_COUNT + 1))
    echo "JSON legado eliminado: $relative_path"
  fi
done

# landing-demo ya no contiene datos JSON; la UI usa su fuente dentro del cliente.
rmdir "$DEST/landing-demo" 2>/dev/null || true

JSON_COUNT=$(find "$DEST" -name '*.json' | wc -l | tr -d ' ')
CAT_COUNT=$(find "$DEST" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')

if [[ "$CAT_COUNT" -eq 0 ]]; then
  echo "ERROR: sin categorías en $DEST tras el sync"
  exit 1
fi

echo "JSON → Oracle OK (${JSON_COUNT} archivos, ${CAT_COUNT} categorías, ${PRUNED_JSON_COUNT} legados eliminados)"
