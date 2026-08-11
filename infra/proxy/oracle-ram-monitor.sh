#!/bin/sh
# ============================================================
# oracle-ram-monitor.sh
# Monitor de RAM local del servidor Oracle.
# Si la RAM libre cae bajo el umbral, señaliza a Caddy para
# que haga overflow del tráfico API a Google Cloud Run.
# Corre en bucle cada 30 segundos.
# ============================================================

THRESHOLD_MB=250    # RAM libre mínima en MB antes de overflow
GATE_FILE="/tmp/ORACLE_HEALTHY"
INTERVAL=30

while true; do
    # Calcular RAM libre disponible en MB
    FREE_MB=$(free -m | awk '/^Mem:/ {print $7}')

    if [ -z "$FREE_MB" ]; then
        # No se pudo leer RAM → asumir fallo seguro
        rm -f "$GATE_FILE"
    elif [ "$FREE_MB" -gt "$THRESHOLD_MB" ]; then
        # Oracle tiene RAM suficiente → él atiende las peticiones
        touch "$GATE_FILE"
    else
        # RAM crítica → overflow a GCP Cloud Run para no colapsar
        rm -f "$GATE_FILE"
    fi

    sleep "$INTERVAL"
done
