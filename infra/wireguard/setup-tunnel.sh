#!/usr/bin/env bash
# =============================================================================
# WireGuard — Túnel privado AWS (34.229.229.255) ↔ Oracle (157.151.199.170)
#
# Objetivo: Reemplazar SCP por internet público con una red privada directa.
# Los archivos de imágenes y audio viajan por el túnel cifrado sin tocar
# la internet pública → latencia AWS→Oracle baja de ~120 ms a ~25 ms.
#
# Uso:
#   En AWS  → sudo bash setup-tunnel.sh aws
#   En Oracle → sudo bash setup-tunnel.sh oracle
#
# IPs del túnel WireGuard:
#   AWS    → 10.10.0.1/30
#   Oracle → 10.10.0.2/30
# =============================================================================
set -euo pipefail

ROLE="${1:-}"

AWS_PUBLIC_IP="34.229.229.255"
ORACLE_PUBLIC_IP="157.151.199.170"
WG_PORT=51820
WG_IFACE="wg0"
AWS_WG_IP="10.10.0.1/30"
ORACLE_WG_IP="10.10.0.2/30"

# ---------------------------------------------------------------------------
install_wireguard() {
    if command -v wg &>/dev/null; then
        echo "✅ WireGuard ya instalado."
        return
    fi
    echo "📦 Instalando WireGuard..."
    if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y wireguard
    elif command -v yum &>/dev/null; then
        yum install -y wireguard-tools
    else
        echo "❌ Gestor de paquetes no soportado. Instala wireguard-tools manualmente." && exit 1
    fi
}

generate_keypair() {
    local name="$1"
    local dir="/etc/wireguard/keys"
    mkdir -p "$dir"
    if [[ ! -f "$dir/${name}.privkey" ]]; then
        wg genkey | tee "$dir/${name}.privkey" | wg pubkey > "$dir/${name}.pubkey"
        chmod 600 "$dir/${name}.privkey"
    fi
    echo "$(cat "$dir/${name}.pubkey")"
}

# ---------------------------------------------------------------------------
setup_aws() {
    echo "🔧 Configurando nodo AWS (${AWS_PUBLIC_IP})..."
    install_wireguard

    local priv_key
    priv_key=$(cat /etc/wireguard/keys/aws.privkey 2>/dev/null || { generate_keypair aws; cat /etc/wireguard/keys/aws.privkey; })

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 Clave PÚBLICA de AWS (cópiala al nodo Oracle):"
    cat /etc/wireguard/keys/aws.pubkey
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    read -rp "Pega aquí la clave PÚBLICA de Oracle: " ORACLE_PUBKEY

    cat > /etc/wireguard/${WG_IFACE}.conf <<EOF
[Interface]
Address    = ${AWS_WG_IP}
PrivateKey = ${priv_key}
ListenPort = ${WG_PORT}
PostUp     = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown   = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey           = ${ORACLE_PUBKEY}
Endpoint            = ${ORACLE_PUBLIC_IP}:${WG_PORT}
AllowedIPs          = 10.10.0.2/32
PersistentKeepalive = 25
EOF

    chmod 600 /etc/wireguard/${WG_IFACE}.conf
    systemctl enable --now wg-quick@${WG_IFACE}
    echo "✅ WireGuard activo en AWS. IP túnel: 10.10.0.1"
    echo ""
    echo "📝 Actualiza ORACLE_HOST en el backend .env:"
    echo "   ORACLE_HOST=10.10.0.2"
    echo "   (El SCP ahora viajará por el túnel privado)"
}

# ---------------------------------------------------------------------------
setup_oracle() {
    echo "🔧 Configurando nodo Oracle (${ORACLE_PUBLIC_IP})..."
    install_wireguard

    local priv_key
    priv_key=$(cat /etc/wireguard/keys/oracle.privkey 2>/dev/null || { generate_keypair oracle; cat /etc/wireguard/keys/oracle.privkey; })

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 Clave PÚBLICA de Oracle (cópiala al nodo AWS):"
    cat /etc/wireguard/keys/oracle.pubkey
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    read -rp "Pega aquí la clave PÚBLICA de AWS: " AWS_PUBKEY

    cat > /etc/wireguard/${WG_IFACE}.conf <<EOF
[Interface]
Address    = ${ORACLE_WG_IP}
PrivateKey = ${priv_key}
ListenPort = ${WG_PORT}

[Peer]
PublicKey           = ${AWS_PUBKEY}
Endpoint            = ${AWS_PUBLIC_IP}:${WG_PORT}
AllowedIPs          = 10.10.0.1/32
PersistentKeepalive = 25
EOF

    chmod 600 /etc/wireguard/${WG_IFACE}.conf
    systemctl enable --now wg-quick@${WG_IFACE}
    echo "✅ WireGuard activo en Oracle. IP túnel: 10.10.0.2"
}

# ---------------------------------------------------------------------------
verify_tunnel() {
    echo ""
    echo "🧪 Verificando túnel..."
    if wg show ${WG_IFACE} | grep -q "latest handshake"; then
        echo "✅ Handshake exitoso — túnel activo."
    else
        echo "⚠️  Sin handshake aún. Espera unos segundos y ejecuta: wg show ${WG_IFACE}"
    fi

    if [[ "$ROLE" == "aws" ]]; then
        echo "Probando ping a Oracle (10.10.0.2)..."
        ping -c 3 10.10.0.2 && echo "✅ Conectividad OK" || echo "❌ Sin respuesta"
    else
        echo "Probando ping a AWS (10.10.0.1)..."
        ping -c 3 10.10.0.1 && echo "✅ Conectividad OK" || echo "❌ Sin respuesta"
    fi
}

# ---------------------------------------------------------------------------
case "$ROLE" in
    aws)    setup_aws;    verify_tunnel ;;
    oracle) setup_oracle; verify_tunnel ;;
    *)
        echo "Uso: $0 <aws|oracle>"
        echo ""
        echo "  aws    → Ejecutar en el servidor AWS (34.229.229.255)"
        echo "  oracle → Ejecutar en el servidor Oracle (157.151.199.170)"
        exit 1
        ;;
esac
