#!/bin/bash
# Monitorea la salud del backend AWS y gestiona /tmp/AWS_HEALTHY
# Si AWS responde 200 en /api/health → crea el archivo
# Si AWS falla 3 veces consecutivas → elimina el archivo (activa overflow a Cloud Run)

AWS_URL="http://34.229.229.255:8080/api/health"
HEALTHY_FILE="/tmp/AWS_HEALTHY"
FAIL_THRESHOLD=3
CHECK_INTERVAL=15
fail_count=0

echo "[aws-health-monitor] Iniciando monitoreo de AWS backend..."

while true; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 8 "$AWS_URL")

    if [ "$HTTP_CODE" = "200" ]; then
        fail_count=0
        if [ ! -f "$HEALTHY_FILE" ]; then
            touch "$HEALTHY_FILE"
            echo "[aws-health-monitor] AWS OK — tráfico redirigido a AWS"
        fi
    else
        fail_count=$((fail_count + 1))
        echo "[aws-health-monitor] AWS fallo #$fail_count (HTTP $HTTP_CODE)"

        if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
            if [ -f "$HEALTHY_FILE" ]; then
                rm -f "$HEALTHY_FILE"
                echo "[aws-health-monitor] AWS CAÍDO — overflow activado → GCP Cloud Run"
            fi
        fi
    fi

    sleep "$CHECK_INTERVAL"
done
