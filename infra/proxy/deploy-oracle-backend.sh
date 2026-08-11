#!/bin/bash
set -euo pipefail

IMAGE="${FLASHCARD_BACKEND_IMAGE:-gcr.io/launch-490115/flashcard-backend:latest}"
CONTAINER="${FLASHCARD_BACKEND_CONTAINER:-flashcard-backend-node}"
REPO_PATH="${FLASHCARD_REPO_PATH:-/root/smart-proxy/repository/flashcard}"
ENV_FILE="${FLASHCARD_BACKEND_ENV:-}"
# 512m: el proxy (968m) comparte RAM con Caddy + centinela + Docker.
# Sin límite, un pico del backend (encode AVIF) puede provocar OOM global
# y tumbar Caddy; con límite, Docker reinicia solo el backend (restart always).
MEMORY_LIMIT="${FLASHCARD_BACKEND_MEMORY_LIMIT:-512m}"
# cpu-shares es peso relativo SOLO bajo contención (default Docker: 1024).
# QA usa un valor bajo → producción se lleva la CPU cuando ambos compiten;
# con prod ocioso, QA corre a velocidad completa igualmente.
CPU_SHARES="${FLASHCARD_BACKEND_CPU_SHARES:-1024}"

load_deploy_env() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    return 0
  fi
  if [[ -n "${FLASHCARD_DEPLOY_ENV_B64:-}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source <(printf '%s' "$FLASHCARD_DEPLOY_ENV_B64" | base64 -d)
    set +a
    unset FLASHCARD_DEPLOY_ENV_B64
    return 0
  fi
  if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    return 0
  fi
  return 0
}

load_deploy_env

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${GEMINI_API_KEY:?GEMINI_API_KEY is required}"
: "${GCP_API_KEY:?GCP_API_KEY is required}"
: "${GOOGLE_CLIENT_ID:?GOOGLE_CLIENT_ID is required}"
: "${JWT_SECRET:?JWT_SECRET is required}"
: "${SUPER_ADMIN_EMAIL:?SUPER_ADMIN_EMAIL is required (admin login + TTS generation in prod)}"
: "${GOOGLE_CREDENTIALS_JSON:?GOOGLE_CREDENTIALS_JSON is required (base64 SA JSON)}"

mkdir -p "$REPO_PATH"/{card_audio,card_images,json}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=docker-gcr-auth.sh
source "$SCRIPT_DIR/docker-gcr-auth.sh"
trap gcr_docker_auth_cleanup EXIT

gcr_docker_login
docker pull "$IMAGE"
gcr_docker_auth_cleanup
trap - EXIT
docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true

# ORACLE_REPOSITORY_ONLY=false es obligatorio aquí: este backend convive con el
# repositorio (montado en /data). El default del binario es true (modo espejo),
# que lo haría tratarse a sí mismo como remoto vía SSH (sin contraseña en este
# contenedor) y los listados por prefijo (audio legacy) fallarían siempre.
docker run -d \
  --name "$CONTAINER" \
  --network host \
  --restart always \
  --memory "$MEMORY_LIMIT" \
  --memory-swap "$MEMORY_LIMIT" \
  --cpu-shares "$CPU_SHARES" \
  --log-opt max-size=10m \
  --log-opt max-file=2 \
  -v "$REPO_PATH:/data" \
  -e LOCAL_STORAGE_PATH="/data" \
  -e SYNC_TO_ORACLE="false" \
  -e ORACLE_REPOSITORY_ONLY="false" \
  -e MEDIA_DELIVERY_MODE="${MEDIA_DELIVERY_MODE:-oracle}" \
  -e PORT="${BACKEND_PORT:-8080}" \
  -e RUST_LOG="${RUST_LOG:-info}" \
  -e DATABASE_URL="$DATABASE_URL" \
  -e GEMINI_API_KEY="$GEMINI_API_KEY" \
  -e GEMINI_TTS_API_KEY="${GEMINI_TTS_API_KEY:-}" \
  -e GCP_API_KEY="$GCP_API_KEY" \
  -e GOOGLE_CREDENTIALS_JSON="$GOOGLE_CREDENTIALS_JSON" \
  -e GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e SUPER_ADMIN_EMAIL="$SUPER_ADMIN_EMAIL" \
  -e SURREAL_URL="${SURREAL_URL:-10.128.0.5:8080}" \
  -e SURREAL_NS="${SURREAL_NS:-flashcard}" \
  -e SURREAL_DB="${SURREAL_DB:-flashcard}" \
  -e SURREAL_USER="${SURREAL_USER:-root}" \
  -e LEMON_SQUEEZY_API_KEY="${LEMON_SQUEEZY_API_KEY:-}" \
  -e LEMON_SQUEEZY_STORE_ID="${LEMON_SQUEEZY_STORE_ID:-}" \
  -e LEMON_SQUEEZY_VARIANT_MONTHLY="${LEMON_SQUEEZY_VARIANT_MONTHLY:-}" \
  -e LEMON_SQUEEZY_VARIANT_ANNUAL="${LEMON_SQUEEZY_VARIANT_ANNUAL:-}" \
  -e LEMON_SQUEEZY_WEBHOOK_SECRET="${LEMON_SQUEEZY_WEBHOOK_SECRET:-}" \
  "$IMAGE"

rm -f /tmp/gcp-deploy-key.json /tmp/flashcard-backend.env

sleep 2
curl -sf "http://127.0.0.1:${BACKEND_PORT:-8080}/api/health" >/dev/null
echo "Oracle backend deploy OK"
