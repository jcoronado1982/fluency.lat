#!/bin/bash
# Afinación de red y firewall para el nodo DB dedicado (OCI-1).
set -euo pipefail

PROXY_PRIVATE_IP="${PROXY_PRIVATE_IP:-10.0.1.67}"
SURREAL_PORT="${SURREAL_BIND_PORT:-8080}"

echo "Applying TCP BBR on OCI-1..."
if ! sysctl net.ipv4.tcp_congestion_control 2>/dev/null | grep -q bbr; then
  modprobe tcp_bbr 2>/dev/null || true
  cat > /etc/sysctl.d/99-bbr.conf <<EOF
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
  sysctl --system 2>/dev/null || sysctl -p /etc/sysctl.d/99-bbr.conf 2>/dev/null || true
fi

echo "Configuring firewall: SurrealDB port ${SURREAL_PORT} only from proxy (${PROXY_PRIVATE_IP})..."
# Limpiar reglas previas de 8080 abiertas al mundo
iptables -D INPUT -p tcp --dport "$SURREAL_PORT" -j ACCEPT 2>/dev/null || true
iptables -D INPUT -p tcp --dport "$SURREAL_PORT" -j ACCEPT 2>/dev/null || true
# Permitir loopback (health checks locales)
iptables -C INPUT -i lo -j ACCEPT 2>/dev/null \
  || iptables -I INPUT 1 -i lo -j ACCEPT
# Permitir solo desde el proxy por red privada VCN
iptables -C INPUT -p tcp -s "$PROXY_PRIVATE_IP" --dport "$SURREAL_PORT" -j ACCEPT 2>/dev/null \
  || iptables -I INPUT 1 -p tcp -s "$PROXY_PRIVATE_IP" --dport "$SURREAL_PORT" -j ACCEPT
# Bloquear el resto (localhost sigue funcionando por loopback)
iptables -C INPUT -p tcp --dport "$SURREAL_PORT" -j DROP 2>/dev/null \
  || iptables -A INPUT -p tcp --dport "$SURREAL_PORT" -j DROP

if command -v /etc/init.d/iptables >/dev/null 2>&1; then
  /etc/init.d/iptables save 2>/dev/null || true
fi

echo "OCI-1 network tuning OK"
