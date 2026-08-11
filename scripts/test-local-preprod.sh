#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:---quick}"

case "$MODE" in
  --quick|--full|--all) ;;
  *)
    echo "Uso: $0 [--quick|--full|--all]" >&2
    echo "  --quick  unitarias, propiedades, snapshots, mocks, checks y build" >&2
    echo "  --full   quick + smoke HTTP + SurrealDB + E2E escritorio/móvil/WebKit" >&2
    echo "  --all    full + carga k6 corta, siempre limitada a localhost" >&2
    exit 2
    ;;
esac

run() {
  echo
  echo "==> $1"
  shift
  "$@"
}

media_manifest() {
  find "$REPO_ROOT/card_audio" "$REPO_ROOT/card_images" "$REPO_ROOT/img" \
    -type f -print0 2>/dev/null \
    | sort -z \
    | xargs -0 -r sha256sum
}

command -v cargo-nextest >/dev/null || {
  echo "ERROR: falta cargo-nextest (cargo install cargo-nextest --locked)" >&2
  exit 1
}

run "Cargo check: flashcards activo" \
  bash -c 'cd "$1/backend" && cargo check --locked -p api_main --no-default-features --features auth,flashcards' _ "$REPO_ROOT"
run "Cargo check: shell sin flashcards" \
  bash -c 'cd "$1/backend" && cargo check --locked -p api_main --no-default-features --features auth' _ "$REPO_ROOT"
run "Rust: Nextest (unitarias, propiedades, mocks, handler y snapshot)" \
  bash -c 'cd "$1/backend" && cargo nextest run --locked --workspace --no-fail-fast' _ "$REPO_ROOT"
run "Frontend: lógica pura + fast-check" \
  bash -c 'cd "$1/client" && npm test' _ "$REPO_ROOT"
run "Frontend: Vitest + React Testing Library" \
  bash -c 'cd "$1/client" && npm run test:components' _ "$REPO_ROOT"
run "Frontend: build de producción" \
  bash -c 'cd "$1/client" && npm run build' _ "$REPO_ROOT"
run "Planos del backend" "$REPO_ROOT/scripts/verify-blueprints.sh"

if [ "$MODE" = "--full" ] || [ "$MODE" = "--all" ]; then
  (
    media_lock="$REPO_ROOT/.local-preprod-media.lock"
    audit_dir="$(mktemp -d "${TMPDIR:-/tmp}/fluency-media-audit.XXXXXX")"
    before_manifest="$audit_dir/before.sha256"
    after_manifest="$audit_dir/after.sha256"

    finish_media_guard() {
      exit_status=$?
      trap - EXIT
      media_manifest > "$after_manifest"
      if ! cmp -s "$before_manifest" "$after_manifest"; then
        echo "ERROR: el gate local modificó media real. No se ejecutará ninguna limpieza automática." >&2
        diff -u "$before_manifest" "$after_manifest" || true
        exit_status=1
      fi
      unlink "$media_lock"
      unlink "$before_manifest"
      unlink "$after_manifest"
      if [ -f "$audit_dir/lock-response.txt" ]; then
        unlink "$audit_dir/lock-response.txt"
      fi
      rmdir "$audit_dir"
      exit "$exit_status"
    }

    touch "$media_lock"
    media_manifest > "$before_manifest"
    trap finish_media_guard EXIT

    lock_status="$(curl -sS -o "$audit_dir/lock-response.txt" -w '%{http_code}' \
      -X DELETE \
      -H 'Content-Type: application/json' \
      --data '{"category":"landing-demo","deck":"verbs-essentials","index":999999,"def_index":0,"form":"v1"}' \
      'http://127.0.0.1:5173/api/delete-image')"
    if [ "$lock_status" != "423" ]; then
      echo "ERROR: el backend local no confirmó el bloqueo de media (HTTP $lock_status; se esperaba 423)." >&2
      echo "Reinicia ./start.sh con el backend actualizado antes de ejecutar --full o --all." >&2
      exit 1
    fi

    run "Smoke HTTP del stack local" "$REPO_ROOT/scripts/smoke-local.sh"
    run "Integración con SurrealDB 3.2.3 local" "$REPO_ROOT/scripts/test-surreal-local.sh"
    run "Playwright: Chromium, Pixel 7 y iPhone 14/WebKit" \
      bash -c 'cd "$1/client" && npm run test:e2e' _ "$REPO_ROOT"

    if [ "$MODE" = "--all" ]; then
      command -v k6 >/dev/null || {
        echo "ERROR: falta k6 para --all" >&2
        exit 1
      }
      run "k6 local (5 VUs, 10 s)" k6 run "$REPO_ROOT/scripts/k6-local-smoke.js"
    fi
  )
fi

echo
echo "✅ Gate local de preproducción completado: $MODE"
