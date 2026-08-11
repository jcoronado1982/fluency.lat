#!/bin/bash

# Directorio de ejecución
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "🎨 Buscando archivos .avif en la carpeta 'img'..."

# Contador de imágenes procesadas
count=0

# Buscar todos los .avif en esta carpeta (no recursivo)
for file in *.avif; do
    # Verificar si existen archivos que coincidan
    [ -f "$file" ] || continue

    output="${file%.avif}.png"
    echo "⚡ Convirtiendo: '$file' -> '$output'..."
    
    # Convertir con ImageMagick (convert / magick)
    if command -v convert >/dev/null 2>&1; then
        convert "$file" "$output"
    elif command -v magick >/dev/null 2>&1; then
        magick "$file" "$output"
    else
        echo "❌ Error: ImageMagick (convert / magick) no está instalado."
        exit 1
    fi
    
    if [ $? -eq 0 ]; then
        echo "✅ Completado: '$output'"
        count=$((count + 1))
    else
        echo "❌ Error al convertir: '$file'"
    fi
done

echo "🎉 Proceso terminado. Se convirtieron $count imágenes."
