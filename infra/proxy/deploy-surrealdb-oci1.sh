#!/bin/bash
# SurrealDB dedicado en OCI-1 (129.158.214.227 / 10.0.1.138).
# Optimizado para ~500 usuarios concurrentes con batching en frontend.
set -euo pipefail

CONTAINER="${SURREAL_CONTAINER:-surrealdb}"
DATA_DIR="${SURREAL_DATA_DIR:-/root/surreal_data}"
# 800m: servidor dedicado solo a SurrealDB + Alpine (~120m SO/Docker).
# En 968m total quedan ~150m de margen para picos del kernel.
MEMORY_LIMIT="${SURREAL_MEMORY_LIMIT:-800m}"
# Puerto en host network (Security List OCI ya permite 8080 en VCN).
BIND_PORT="${SURREAL_BIND_PORT:-8080}"
PROXY_PRIVATE_IP="${PROXY_PRIVATE_IP:-10.0.1.67}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/oci1-db-tuning.sh" ]]; then
  bash "$SCRIPT_DIR/oci1-db-tuning.sh"
fi

mkdir -p "$DATA_DIR"
chmod 777 "$DATA_DIR" 2>/dev/null || true
if [[ -d "$DATA_DIR/surreal.db" ]]; then
  chmod -R 777 "$DATA_DIR/surreal.db" 2>/dev/null || true
fi

echo "Deploying SurrealDB on OCI-1 (host network, limit=${MEMORY_LIMIT}, port=${BIND_PORT})..."
docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER" \
  --network host \
  --restart always \
  --memory "$MEMORY_LIMIT" \
  --memory-swap "$MEMORY_LIMIT" \
  --log-opt max-size=10m \
  --log-opt max-file=2 \
  --health-cmd "/surreal isready --endpoint http://localhost:${BIND_PORT}" \
  --health-interval 30s \
  --health-timeout 5s \
  --health-retries 3 \
  --health-start-period 20s \
  -v "$DATA_DIR:/data" \
  surrealdb/surrealdb:v3.2.3 \
  start --user root --pass root --bind "0.0.0.0:${BIND_PORT}" rocksdb:/data/surreal.db

sleep 2
curl -sf "http://127.0.0.1:${BIND_PORT}/health" >/dev/null
echo "SurrealDB OCI-1 OK (health check passed, accessible from proxy at ${PROXY_PRIVATE_IP} -> 10.0.1.138:${BIND_PORT})"
