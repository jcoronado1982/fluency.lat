#!/bin/bash
set -euo pipefail

ROOT="${REPO_ROOT:-/root/smart-proxy}"
PROXY_DIR="${PROXY_DIR:-$ROOT/infra-proxy}"

DEPLOY_BACKEND=false
DEPLOY_CADDY=false
START_MONITORS=true

usage() {
  echo "Usage: $0 [--all | --backend-only | --caddy-only] [--no-monitors]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      DEPLOY_BACKEND=true
      DEPLOY_CADDY=true
      ;;
    --backend-only)
      DEPLOY_BACKEND=true
      ;;
    --caddy-only)
      DEPLOY_CADDY=true
      ;;
    --no-monitors)
      START_MONITORS=false
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

if ! $DEPLOY_BACKEND && ! $DEPLOY_CADDY; then
  DEPLOY_BACKEND=true
  DEPLOY_CADDY=true
fi

mkdir -p \
  "$ROOT/portfolio" \
  "$ROOT/flashcard" \
  "$ROOT/qa_flashcard" \
  "$ROOT/repository/flashcard/card_audio" \
  "$ROOT/repository/flashcard/card_images" \
  "$ROOT/repository/flashcard/json" \
  "$ROOT/repository/qa_flashcard/card_audio" \
  "$ROOT/repository/qa_flashcard/card_images" \
  "$ROOT/repository/qa_flashcard/json" \
  "$PROXY_DIR"

# ───────────────────────────────────────────────────────────────────────
# OPTIMIZACIONES DEL KERNEL (TCP BBR & File Descriptors)
# ───────────────────────────────────────────────────────────────────────

echo "Checking TCP BBR configuration..."
if ! sysctl net.ipv4.tcp_congestion_control | grep -q "bbr"; then
  echo "Enabling TCP BBR..."
  modprobe tcp_bbr || true
  cat <<EOF > /etc/sysctl.d/99-bbr.conf
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
  sysctl --system || true
  echo "TCP BBR enabled successfully."
else
  echo "TCP BBR is already enabled."
fi

echo "Checking file descriptor limits..."
if ! grep -q "root soft nofile 65535" /etc/security/limits.conf; then
  echo "Configuring file descriptor limits..."
  cat <<EOF >> /etc/security/limits.conf
* soft nofile 65535
* hard nofile 65535
root soft nofile 65535
root hard nofile 65535
EOF
  echo "File descriptor limits configured successfully."
else
  echo "File descriptor limits are already configured."
fi

chmod +x \
  "$PROXY_DIR/deploy-caddy.sh" \
  "$PROXY_DIR/deploy-oracle-backend.sh" \
  "$PROXY_DIR/deploy-surrealdb.sh" \
  "$PROXY_DIR/bootstrap-oracle.sh" \
  "$PROXY_DIR/sync-json-to-oracle.sh" \
  "$PROXY_DIR/sync-qa-repository.sh" \
  "$PROXY_DIR/oracle-ram-monitor.sh" \
  "$PROXY_DIR/aws-health-monitor.sh"

cp "$PROXY_DIR/oracle-ram-monitor.sh" /usr/local/bin/oracle-ram-monitor.sh
cp "$PROXY_DIR/aws-health-monitor.sh" /usr/local/bin/aws-health-monitor.sh
chmod +x /usr/local/bin/oracle-ram-monitor.sh /usr/local/bin/aws-health-monitor.sh

if $DEPLOY_BACKEND; then
  # NOTA: SurrealDB ahora vive en OCI-1 (10.0.1.138), ya no se despliega en el proxy
  bash "$PROXY_DIR/deploy-oracle-backend.sh"
fi

if $DEPLOY_CADDY; then
  sh "$PROXY_DIR/deploy-caddy.sh"
fi

if $START_MONITORS; then
  pkill -f oracle-ram-monitor.sh 2>/dev/null || true
  pkill -f aws-health-monitor.sh 2>/dev/null || true
  nohup /usr/local/bin/oracle-ram-monitor.sh > /var/log/oracle-ram-monitor.log 2>&1 &
  nohup /usr/local/bin/aws-health-monitor.sh > /var/log/aws-health-monitor.log 2>&1 &
fi

if $DEPLOY_CADDY; then
  sleep 2
  docker ps -f name=caddy-smart --format '{{.Status}}'
fi

if $DEPLOY_BACKEND; then
  curl -sf "http://127.0.0.1:${BACKEND_PORT:-8080}/api/health" >/dev/null
  echo "Backend health OK"
fi

echo "Oracle bootstrap OK"
