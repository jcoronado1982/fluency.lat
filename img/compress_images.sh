#!/bin/bash

# Obtener directorio del script
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "🎨 Ejecutando compresor de imágenes PNG/JPG en '$DIR' (Máximo: 500 KB)..."

python3 "$DIR/compress_images.py" --dir "$DIR" --max-kb 500 "$@"
