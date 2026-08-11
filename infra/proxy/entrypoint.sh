#!/bin/sh
# Iniciar el monitor de RAM de Oracle en segundo plano
# Gestiona /tmp/ORACLE_HEALTHY para el overflow a GCP Cloud Run
/usr/local/bin/oracle-ram-monitor.sh &

# Iniciar servicios de control de la DB en segundo plano
socat TCP-LISTEN:8888,fork,reuseaddr EXEC:/usr/local/bin/sentinel-handler &
/usr/local/bin/traffic-manager &

# Iniciar Caddy en primer plano
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
