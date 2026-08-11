#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# heic_to_png.sh
# Convierte IMG_4535.heic → IMG_4535.png dentro de esta carpeta
# Uso: ./heic_to_png.sh [ruta/al/archivo.heic]
# ─────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_INPUT="$SCRIPT_DIR/IMG_4535.heic"
INPUT="${1:-$DEFAULT_INPUT}"

# Validar que el archivo existe
if [[ ! -f "$INPUT" ]]; then
  echo "❌  Archivo no encontrado: $INPUT"
  echo "    Copia IMG_4535.heic a la carpeta img/ y vuelve a ejecutar."
  exit 1
fi

# Construir nombre de salida: mismo nombre, extensión .png
BASENAME="$(basename "$INPUT" .heic)"
OUTPUT="$SCRIPT_DIR/${BASENAME}.png"

echo "📸  Convirtiendo: $INPUT"
echo "    → $OUTPUT"

heif-convert "$INPUT" "$OUTPUT"

echo "✅  Listo: $OUTPUT"
