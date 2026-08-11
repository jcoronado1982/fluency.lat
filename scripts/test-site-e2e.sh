#!/usr/bin/env bash
# Prueba TODO el sitio con un solo comando, como lo haría un QA humano:
# navegación completa (wizard de onboarding, tour interactivo, catálogo con
# todas las categorías/niveles, tarjeta, menús, rutas públicas), roles
# distintos (admin / premium / user) y generación de imagen+voz con los
# servicios de producción EMULADOS (contrato {path}/{audio_url} de Gemini,
# sin llamar a las APIs reales) — detectando errores de consola, de página
# y respuestas API inesperadas en todo el recorrido. Correrlo SIEMPRE antes
# de promover un cambio de flashcards a producción (ver docs/QA_TO_PROD_FLOW.md).
#
# Uso (copiar y pegar desde la raíz del repo):
#   ./scripts/test-site-e2e.sh                # 3 navegadores (Chromium, Pixel 7, iPhone/WebKit) — más lento
#   ./scripts/test-site-e2e.sh --chromium     # solo escritorio (rápido, ~2 min) — el modo normal para iterar
#
# Requisitos: ninguno que tengas que preparar a mano. No hace falta tener
# ./start.sh corriendo de antemano ni exportar variables — el script detecta
# si el stack local ya responde en :5173 (Vite) y :8081/api/health (backend).
#   - Si NO responde: lanza `./start.sh local` en background, espera hasta 3 min
#     (log en $TMPDIR/fluency-test-site-e2e-start.log, normalmente /tmp) y lo
#     apaga (fuser -k en :8081/:5173) al terminar, pase lo que pase.
#   - Si YA estaba corriendo (p.ej. lo levantaste vos con ./start.sh): lo usa
#     tal cual y lo deja intacto al salir — no lo apaga.
#
# Duración aproximada: ~2 min con --chromium, varios minutos más con los 3
# navegadores (cada test corre 3 veces, una por proyecto de Playwright).
#
# Si falla:
#   1. Leé la salida de Playwright: nombra el test y la aserción exacta que
#      rompió (o el error de consola/página/API que el spec no esperaba).
#   2. Si el fallo es "el stack local no levantó": revisá el log de arranque
#      indicado arriba ($TMPDIR/fluency-test-site-e2e-start.log).
#   3. Para depurar un test puntual con navegador visible:
#      cd client && npx playwright test first-login-and-full-navigation --headed --project=desktop-chromium
#   4. El reporte HTML de Playwright (si se generó) queda en client/playwright-report/.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STARTED_STACK=false
START_LOG="${TMPDIR:-/tmp}/fluency-test-site-e2e-start.log"

is_up() {
  curl -sf -o /dev/null http://127.0.0.1:5173 \
    && curl -sf -o /dev/null http://127.0.0.1:8081/api/health
}

cleanup() {
  if [ "$STARTED_STACK" = true ]; then
    echo "🛑 Apagando el stack local que levantó este script..."
    fuser -k 8081/tcp 2>/dev/null || true
    fuser -k 5173/tcp 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! is_up; then
  echo "🚀 Stack local no detectado: levantando ./start.sh local (log: $START_LOG)..."
  (cd "$REPO_ROOT" && nohup ./start.sh local > "$START_LOG" 2>&1 &)
  STARTED_STACK=true
  for _ in $(seq 1 90); do
    is_up && break
    sleep 2
  done
  if ! is_up; then
    echo "ERROR: el stack local no levantó. Revisa $START_LOG" >&2
    exit 1
  fi
  echo "✅ Stack local listo."
fi

MODE="${1:---all-browsers}"
cd "$REPO_ROOT/client"
case "$MODE" in
  --chromium)
    npx playwright test --project=desktop-chromium
    ;;
  --all-browsers)
    npm run test:e2e
    ;;
  *)
    echo "Uso: $0 [--all-browsers|--chromium]" >&2
    exit 2
    ;;
esac

echo
echo "✅ Recorrido E2E completo del sitio: sin errores detectados ($MODE)"
