#!/bin/sh
set -e

PROXY_DIR="${PROXY_DIR:-/root/smart-proxy/infra-proxy}"
REPO_ROOT="${REPO_ROOT:-/root/smart-proxy}"

cd "$PROXY_DIR"
# stderr de BuildKit confunde la pestaña Errors en Azure; unificar streams
docker build -t fluency-proxy . 2>&1

docker rm -f caddy-smart 2>/dev/null || true

# Con el contenedor eliminado, cualquier traffic-manager/sentinel que siga vivo
# es un stray a nivel host (hubo uno huérfano 71 días duplicando el gate del centinela).
pkill -f 'traffic-manager' 2>/dev/null || true
pkill -f 'sentinel-handler' 2>/dev/null || true
# 384m: techo generoso (uso real ~80m). Hace determinista quién reinicia
# ante presión de RAM en la caja de 968m, en vez de dejarlo al OOM killer.
CADDY_MEMORY_LIMIT="${CADDY_MEMORY_LIMIT:-384m}"
MEDIA_DELIVERY_MODE="${MEDIA_DELIVERY_MODE:-oracle}"
case "$MEDIA_DELIVERY_MODE" in
  oracle)
    MEDIA_VERSIONED_BROWSER_CACHE_CONTROL="public, max-age=31536000, immutable"
    MEDIA_SHARED_CACHE_HEADER="X-Media-Shared-Cache-Control"
    MEDIA_VERSIONED_SHARED_CACHE_CONTROL="public, no-cache"
    ;;
  cloudflare)
    MEDIA_VERSIONED_BROWSER_CACHE_CONTROL="public, no-cache"
    MEDIA_SHARED_CACHE_HEADER="Cloudflare-CDN-Cache-Control"
    MEDIA_VERSIONED_SHARED_CACHE_CONTROL="public, max-age=31536000"
    ;;
  *)
    echo "MEDIA_DELIVERY_MODE inválido: $MEDIA_DELIVERY_MODE (use oracle o cloudflare)" >&2
    exit 1
    ;;
esac
docker run -d \
  --name caddy-smart \
  --network host \
  --memory "$CADDY_MEMORY_LIMIT" \
  --memory-swap "$CADDY_MEMORY_LIMIT" \
  --log-opt max-size=10m \
  --log-opt max-file=2 \
  -e MEDIA_DELIVERY_MODE="$MEDIA_DELIVERY_MODE" \
  -e MEDIA_VERSIONED_BROWSER_CACHE_CONTROL="$MEDIA_VERSIONED_BROWSER_CACHE_CONTROL" \
  -e MEDIA_SHARED_CACHE_HEADER="$MEDIA_SHARED_CACHE_HEADER" \
  -e MEDIA_VERSIONED_SHARED_CACHE_CONTROL="$MEDIA_VERSIONED_SHARED_CACHE_CONTROL" \
  -v "$REPO_ROOT/portfolio:/usr/share/caddy/portfolio" \
  -v "$REPO_ROOT/flashcard:/usr/share/caddy/flashcard" \
  -v "$REPO_ROOT/repository/flashcard:/usr/share/caddy/repository" \
  -v "$REPO_ROOT/qa_flashcard:/usr/share/caddy/qa_flashcard" \
  -v "$REPO_ROOT/repository/qa_flashcard:/usr/share/caddy/qa_repository" \
  -v caddy_data:/data \
  -v caddy_config:/config \
  -v /tmp:/tmp \
  --restart always \
  fluency-proxy

echo "Caddy deploy OK (media=$MEDIA_DELIVERY_MODE)"
