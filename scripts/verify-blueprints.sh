#!/bin/bash
# =============================================================================
# verify-blueprints.sh — Detector de deriva código ↔ planos (docs/modules/)
#
# Regla de cierre (GEMINI.md): un trabajo no está terminado hasta que se testea
# Y se documenta. Este script verifica que toda ruta registrada en api_main
# tenga su entrada en docs/modules/<módulo>.md.
#
# Uso: ./scripts/verify-blueprints.sh          # exit 1 si hay rutas sin documentar
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

DOCS_DIR="docs/modules"
FAIL=0

# 1. Rutas registradas en el código (composition root + registros por módulo).
#    Se normalizan los wildcards de axum (*file_path → prefijo).
code_routes=$(grep -hoE '"/(api|card_images|card_audio)[^"]*"' \
        backend/api_main/src/main.rs backend/api_main/src/modules/*.rs 2>/dev/null \
    | tr -d '"' \
    | sed 's|\*[a-z_]*$||' \
    | sort -u)

if [ -z "$code_routes" ]; then
    echo "⚠️  No se encontraron rutas en el código (¿sparse sin backend?). Nada que verificar."
    exit 0
fi

echo "🔍 Verificando que cada ruta del backend está en un plano de $DOCS_DIR/ ..."
missing=0
while IFS= read -r route; do
    if ! grep -rqF -- "$route" "$DOCS_DIR"/*.md; then
        echo "  ❌ SIN DOCUMENTAR: $route"
        missing=$((missing + 1))
        FAIL=1
    fi
done <<< "$code_routes"

total=$(printf '%s\n' "$code_routes" | wc -l)
echo "   Rutas en código: $total — sin documentar: $missing"

# 2. Aviso inverso (no bloquea): rutas /api documentadas que ya no existen en el código.
echo "🔍 Buscando rutas documentadas que ya no existen en el código (aviso)..."
doc_routes=$(grep -rhoE '`/api/[a-zA-Z0-9/_:-]+`' "$DOCS_DIR"/*.md 2>/dev/null | tr -d '\`' | sort -u)
while IFS= read -r route; do
    [ -z "$route" ] && continue
    if ! printf '%s\n' "$code_routes" | grep -qF -- "$route"; then
        echo "  ⚠️  documentada pero no encontrada en código: $route"
    fi
done <<< "$doc_routes"

if [ "$FAIL" -eq 1 ]; then
    echo ""
    echo "❌ Planos desactualizados. Actualiza docs/modules/<módulo>.md en el MISMO cambio"
    echo "   que añadió/movió la ruta (regla de cierre de GEMINI.md)."
    exit 1
fi
echo "✅ Planos al día (backend)."

# 3. Frontend (aviso, NO bloquea): rutas literales de cada manifiesto de módulo
#    (`client/src/modules/<módulo>/index.jsx`) vs su plano en docs/modules/<módulo>.md.
#    Alcance limitado a propósito: solo detecta `path: '...'`/`path: "..."` LITERALES.
#    Varias rutas reales (flashcards, dashboard) se arman con constantes importadas
#    (ej. `DASHBOARD_HOME_PATH` de `modules/routingPaths.js`) y ese grep no las resuelve —
#    por eso esta sección es informativa, nunca hace fallar el script. No reemplaza
#    `npm run test:routing` (lógica real de resolución de rutas).
FRONTEND_MODULES_DIR="client/src/modules"
if [ -d "$FRONTEND_MODULES_DIR" ]; then
    echo ""
    echo "🔍 (aviso) Rutas literales del frontend vs docs/modules/<módulo>.md ..."
    for manifest in "$FRONTEND_MODULES_DIR"/*/index.jsx; do
        [ -f "$manifest" ] || continue
        module_dir=$(dirname "$manifest")
        module_name=$(basename "$module_dir")
        doc_file="$DOCS_DIR/$module_name.md"
        fe_routes=$(grep -oE "path:[[:space:]]*['\"][^'\"]+['\"]" "$manifest" \
            | grep -oE "['\"][^'\"]+['\"]" \
            | tr -d "'\"" \
            | sort -u)
        [ -z "$fe_routes" ] && continue
        if [ ! -f "$doc_file" ]; then
            echo "  ⚠️  módulo '$module_name' sin plano ($doc_file) — rutas literales encontradas: $(echo "$fe_routes" | tr '\n' ' ')"
            continue
        fi
        while IFS= read -r route; do
            [ -z "$route" ] && continue
            if ! grep -qF -- "$route" "$doc_file"; then
                echo "  ⚠️  $module_name: ruta literal '$route' no aparece en $doc_file"
            fi
        done <<< "$fe_routes"
    done
    echo "   (informativo — no afecta el exit code del script)"
fi

echo "✅ Planos al día."
