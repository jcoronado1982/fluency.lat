FROM caddy:alpine
RUN apk add --no-cache socat curl
COPY sentinel-handler /usr/local/bin/
COPY traffic-manager /usr/local/bin/
COPY oracle-ram-monitor.sh /usr/local/bin/
COPY entrypoint.sh /entrypoint.sh
COPY Caddyfile /etc/caddy/Caddyfile
# Carpeta de publicación oficial
COPY . /usr/share/caddy/
RUN chmod +x /usr/local/bin/sentinel-handler /usr/local/bin/traffic-manager /usr/local/bin/oracle-ram-monitor.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
