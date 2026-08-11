#!/bin/bash

# Directorio de ejecución
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "🎨 Buscando archivos .png en la carpeta 'img'..."

# Contador de imágenes procesadas
count=0

# Buscar todos los .png en esta carpeta (no recursivo)
for file in *.png; do
    # Verificar si existen archivos que coincidan
    [ -f "$file" ] || continue

    output="${file%.png}.avif"
    echo "⚡ Convirtiendo: '$file' -> '$output' (Calidad optimizada: 85)..."
    
    # Convertir y redimensionar a exactamente 768x512 con ImageMagick (calidad 85)
    convert "$file" -resize 768x512! -quality 85 "$output"
    
    if [ $? -eq 0 ]; then
        echo "✅ Completado: '$output'"
        count=$((count + 1))
    else
        echo "❌ Error al convertir: '$file'"
    fi
done

echo "🎉 Proceso terminado. Se convirtieron $count imágenes."
