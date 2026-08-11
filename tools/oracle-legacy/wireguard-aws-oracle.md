# Túnel WireGuard AWS ↔ Oracle

> Red privada punto a punto entre el espejo AWS y el Oracle Proxy. Fuente ejecutable:
> [`infra/wireguard/setup-tunnel.sh`](../../infra/wireguard/setup-tunnel.sh). Inventario de las
> máquinas: [`server_inventory.md`](server_inventory.md). Última revisión: 2026-07-16.

## Propósito

Cuando el backend espejo de AWS sincroniza assets hacia Oracle (`SYNC_TO_ORACLE=true`), el SCP
viaja por este túnel cifrado en vez de internet pública: latencia ~120 ms → ~25 ms.

## Topología

| Nodo | IP pública | IP túnel | Config |
|---|---|---|---|
| AWS `alpine-aws-01` | `34.229.229.255` | `10.10.0.1/30` | `[Peer] AllowedIPs 10.10.0.2/32` |
| Oracle `server-reverse-proxy` | `157.151.199.170` | `10.10.0.2/30` | `[Peer] AllowedIPs 10.10.0.1/32` |

- Red: `10.10.0.0/30`. Interfaz: `wg0`. Puerto: **UDP 51820** en ambos. `PersistentKeepalive 25`.
- Claves en `/etc/wireguard/keys/` de cada nodo; config en `/etc/wireguard/wg0.conf`; servicio
  `wg-quick@wg0` (systemd, enabled).
- Con el túnel activo, el backend de AWS usa `ORACLE_HOST=10.10.0.2` para el SCP.

## Instalación / reinstalación

```bash
# En AWS:    sudo bash infra/wireguard/setup-tunnel.sh aws
# En Oracle: sudo bash infra/wireguard/setup-tunnel.sh oracle
# (interactivo: cada nodo muestra su clave pública y pide pegar la del otro)
```

## Verificación

```bash
wg show wg0            # debe mostrar "latest handshake" reciente
ping -c 3 10.10.0.2    # desde AWS (o 10.10.0.1 desde Oracle)
```

## Si el túnel cae

- El SCP hacia `10.10.0.2` falla → la sincronización de assets del espejo AWS se detiene
  (producción NO se cae: Oracle sirve todo desde su disco local).
- Recuperar: `systemctl restart wg-quick@wg0` en ambos nodos; si persiste, revisar que el
  UDP 51820 siga abierto en los firewalls de ambos clouds y re-ejecutar el setup.
- Workaround temporal: volver `ORACLE_HOST` a la IP pública `157.151.199.170` (más lento).
