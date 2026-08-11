#!/bin/sh
# ============================================================
# bootstrap-gcp.sh
#
# Reproduce en el proxy de GCP (`fluency-proxy-backend`, 35.188.162.50)
# el tuning de SO y la config de Caddy aplicados a mano el 4 ago 2026.
# Existe porque esa sesion configuro todo por SSH directo, sin dejar
# nada scripteado -- si esta VM se recrea de cero, este script es la
# unica forma de no tener que repetir todo a mano otra vez.
#
# Equivalente (pero NO idéntico) a bootstrap-oracle.sh: mismo patron de
# idempotencia y de arranque de monitors, pero las rutas son las de GCP
# (disco persistente en /mnt/sda, / es tmpfs diskless) y el Caddyfile es
# el minimo real de GCP (infra/proxy/Caddyfile.gcp), NO el "completo"
# infra/proxy/Caddyfile del repo (ese trae centinela db_protection y
# otros dominios que esta VM no usa).
#
# Uso: bash bootstrap-gcp.sh [--skip-os-tuning] [--skip-caddy] [--no-monitors]
#
# Requiere correr como root en la VM (via SSH), con este archivo y
# Caddyfile.gcp + oracle-ram-monitor.sh sincronizados en $PROXY_DIR
# (por defecto /mnt/sda/infra-proxy, el mismo destino que usa el
# pipeline para infra/proxy/* -- ver azure-pipelines.yml job Mirror_Oracle
# como referencia del patron de sync, aunque ese job hoy despliega a
# Oracle, no a esta VM).
# ============================================================
set -eu

PROXY_DIR="${PROXY_DIR:-/mnt/sda/infra-proxy}"
CADDY_HOST_FILE="${CADDY_HOST_FILE:-/mnt/sda/Caddyfile}"
CADDY_CONTAINER="${CADDY_CONTAINER:-caddy-smart}"
SWAP_FILE="${SWAP_FILE:-/mnt/sda/swapfile}"
SWAP_SIZE_MB="${SWAP_SIZE_MB:-4096}"

SKIP_OS_TUNING=false
SKIP_CADDY=false
START_MONITORS=true

for arg in "$@"; do
  case "$arg" in
    --skip-os-tuning) SKIP_OS_TUNING=true ;;
    --skip-caddy) SKIP_CADDY=true ;;
    --no-monitors) START_MONITORS=false ;;
    *)
      echo "Uso: $0 [--skip-os-tuning] [--skip-caddy] [--no-monitors]"
      exit 1
      ;;
  esac
done

if $SKIP_OS_TUNING; then
  echo "Saltando tuning de SO (--skip-os-tuning)."
else
  # ------------------------------------------------------------
  # SWAP: 4 GB en disco persistente (/mnt/sda), NUNCA en / (tmpfs
  # diskless de ~485 MB en esta VM -- un swapfile ahi viviria en RAM
  # y seria contraproducente, ademas de llenar el tmpfs).
  # ------------------------------------------------------------
  echo "Checking swap configuration..."
  # `swapon --show` no existe en BusyBox (solo GNU util-linux) -- usar
  # /proc/swaps, que es portable entre ambos. Verificado en vivo: BusyBox
  # swapon con --show solo imprime el usage y sale con error silencioso.
  if grep -q "^$SWAP_FILE " /proc/swaps 2>/dev/null; then
    echo "Swap ya activo en $SWAP_FILE."
  else
    if [ ! -f "$SWAP_FILE" ]; then
      echo "Creando swapfile de ${SWAP_SIZE_MB}MB en $SWAP_FILE..."
      fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" 2>/dev/null || \
        dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB"
      chmod 600 "$SWAP_FILE"
      mkswap "$SWAP_FILE"
    fi
    swapon -p -2 "$SWAP_FILE"
    echo "Swap activado."
  fi
  if ! grep -q "$SWAP_FILE" /etc/fstab 2>/dev/null; then
    echo "$SWAP_FILE swap swap defaults,pri=-2 0 0" >> /etc/fstab
    echo "Swap agregado a /etc/fstab (persistente entre reinicios)."
  fi

  # ------------------------------------------------------------
  # TCP BBR + fq qdisc (mismo tuning que Oracle -- ver
  # bootstrap-oracle.sh y oci1-db-tuning.sh, que hacen esto mismo
  # ahi). Persiste via el servicio OpenRC `sysctl` (runlevel boot,
  # ya habilitado en Alpine), que relee /etc/sysctl.d/*.conf en cada
  # arranque -- confirmado leyendo /etc/init.d/sysctl en vivo.
  # ------------------------------------------------------------
  echo "Checking TCP BBR configuration..."
  if ! sysctl net.ipv4.tcp_congestion_control 2>/dev/null | grep -q "bbr"; then
    echo "Enabling TCP BBR..."
    modprobe tcp_bbr 2>/dev/null || true
    cat > /etc/sysctl.d/99-bbr.conf <<EOF
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
    # NOTA: `sysctl --system` no aplico el archivo de forma confiable
    # en esta VM (verificado en vivo, 4 ago 2026) -- aplicar con -w
    # directo ademas de dejar el archivo para que el servicio lo
    # relea en el proximo arranque.
    sysctl -w net.core.default_qdisc=fq
    sysctl -w net.ipv4.tcp_congestion_control=bbr
    echo "TCP BBR enabled successfully."
  else
    echo "TCP BBR is already enabled."
  fi

  # ------------------------------------------------------------
  # File descriptor limits (igual que Oracle).
  # ------------------------------------------------------------
  echo "Checking file descriptor limits..."
  if ! grep -q "root soft nofile 65535" /etc/security/limits.conf 2>/dev/null; then
    echo "Configuring file descriptor limits..."
    cat >> /etc/security/limits.conf <<EOF
* soft nofile 65535
* hard nofile 65535
root soft nofile 65535
root hard nofile 65535
EOF
  else
    echo "File descriptor limits are already configured."
  fi
fi

if $SKIP_CADDY; then
  echo "Saltando actualizacion de Caddyfile (--skip-caddy)."
else
  # ------------------------------------------------------------
  # Caddyfile: sobrescribir el CONTENIDO del archivo montado, nunca
  # `mv` -- Docker bind-monta un archivo individual por inodo, no por
  # ruta; un `mv` lo desconecta silenciosamente (el contenedor sirve
  # el Caddyfile de fabrica sin ningun error visible). Ver
  # troubleshooting_library.skill.md entrada 8.
  # ------------------------------------------------------------
  if [ -f "$PROXY_DIR/Caddyfile.gcp" ]; then
    echo "Validando Caddyfile.gcp antes de aplicar..."
    if command -v docker >/dev/null && docker ps --format '{{.Names}}' | grep -q "^${CADDY_CONTAINER}\$"; then
      docker cp "$PROXY_DIR/Caddyfile.gcp" "${CADDY_CONTAINER}:/tmp/Caddyfile.validate"
      docker exec "$CADDY_CONTAINER" caddy validate --config /tmp/Caddyfile.validate --adapter caddyfile
      docker exec "$CADDY_CONTAINER" rm -f /tmp/Caddyfile.validate
      cat "$PROXY_DIR/Caddyfile.gcp" > "$CADDY_HOST_FILE"
      docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
      echo "Caddyfile aplicado y recargado sin downtime."
    else
      echo "AVISO: contenedor $CADDY_CONTAINER no encontrado corriendo -- copiando Caddyfile sin validar/recargar."
      cat "$PROXY_DIR/Caddyfile.gcp" > "$CADDY_HOST_FILE"
    fi
  else
    echo "AVISO: $PROXY_DIR/Caddyfile.gcp no encontrado -- Caddyfile no actualizado."
  fi
fi

if $START_MONITORS; then
  # ------------------------------------------------------------
  # oracle-ram-monitor.sh: gestiona /tmp/ORACLE_HEALTHY para la
  # valvula de overflow a Cloud Run (api_with_overflow en el
  # Caddyfile). Nombre de archivo/script legado de Oracle, logica
  # identica. Arranca via nohup -- NO sobrevive un reboot de la VM
  # (igual que en Oracle); si hace falta esa garantia, agregar un
  # servicio OpenRC que llame a este script con --no-monitors omitido.
  # ------------------------------------------------------------
  if [ -f "$PROXY_DIR/oracle-ram-monitor.sh" ]; then
    cp "$PROXY_DIR/oracle-ram-monitor.sh" /usr/local/bin/oracle-ram-monitor.sh
    chmod +x /usr/local/bin/oracle-ram-monitor.sh
    pkill -f oracle-ram-monitor.sh 2>/dev/null || true
    nohup /usr/local/bin/oracle-ram-monitor.sh > /var/log/oracle-ram-monitor.log 2>&1 &
    echo "oracle-ram-monitor.sh (re)iniciado."
  else
    echo "AVISO: $PROXY_DIR/oracle-ram-monitor.sh no encontrado -- monitor no iniciado."
  fi
else
  echo "Saltando monitors (--no-monitors)."
fi

echo "bootstrap-gcp.sh completado."
