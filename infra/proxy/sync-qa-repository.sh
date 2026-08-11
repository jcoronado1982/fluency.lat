#!/bin/bash
# Sincroniza contenido de referencia de producción hacia el repositorio QA.
# QA usa namespace DB propio pero comparte los JSON de mazos (datos de solo lectura).
set -euo pipefail

ROOT="${REPO_ROOT:-/root/smart-proxy}"
PROD_REPO="${PROD_REPO_PATH:-$ROOT/repository/flashcard}"
QA_REPO="${QA_REPO_PATH:-$ROOT/repository/qa_flashcard}"

if [[ ! -d "$PROD_REPO/json" ]]; then
  echo "ERROR: no existe $PROD_REPO/json"
  exit 1
fi

mkdir -p "$QA_REPO"/{json,card_audio,card_images}

echo "Sync QA json desde producción..."
rsync -a --delete "$PROD_REPO/json/" "$QA_REPO/json/"

# Assets generados: copiar solo lo que falta (QA puede tener audio/imagen propios de pruebas).
echo "Sync QA card_audio (solo archivos nuevos)..."
rsync -a "$PROD_REPO/card_audio/" "$QA_REPO/card_audio/" 2>/dev/null || true

echo "Sync QA card_images (solo archivos nuevos)..."
rsync -a "$PROD_REPO/card_images/" "$QA_REPO/card_images/" 2>/dev/null || true

echo "QA repository sync OK ($(find "$QA_REPO/json" -mindepth 1 -maxdepth 1 -type d | wc -l) categorías)"
