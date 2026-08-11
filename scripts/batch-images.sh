#!/usr/bin/env bash
# Enlaza imágenes AVIF existentes o genera faltantes → imagePath en JSON (Oracle).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

BIN="./target/release/api_main"

echo "🔧 Compilando backend..."
cargo build -p api_main --release 2>&1 | tail -5

echo ""
echo "========================================================"
echo "  IMÁGENES MASIVAS — todos los mazos / todas las categorías"
echo "========================================================"
echo ""
echo "Modos:"
echo "  $BIN --batch-link-images"
echo "  $BIN --batch-gen-images"
echo ""
echo "Opcional (un solo mazo):"
echo "  $BIN --batch-link-images adjectives 1-basic"
echo "  $BIN --batch-gen-images adjectives 1-basic"
echo ""

read -r -p "Modo: enlazar existentes (E) o generar faltantes (G)? [E/g]: " MODE
MODE="${MODE:-E}"
if [[ "$MODE" =~ ^[Gg] ]]; then
    BATCH_FLAG="--batch-gen-images"
else
    BATCH_FLAG="--batch-link-images"
fi

read -r -p "¿Procesar TODOS los mazos? [S/n]: " CONFIRM
CONFIRM="${CONFIRM:-S}"

if [[ "$CONFIRM" =~ ^[Nn] ]]; then
    read -r -p "Categoría: " CAT
    read -r -p "Deck (vacío = todos los decks de la categoría): " DECK
    if [[ -n "$DECK" ]]; then
        "$BIN" "$BATCH_FLAG" "$CAT" "$DECK"
    else
        "$BIN" "$BATCH_FLAG" "$CAT"
    fi
else
    "$BIN" "$BATCH_FLAG"
fi
