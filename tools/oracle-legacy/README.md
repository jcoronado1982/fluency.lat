# 🗄️ Oracle — Infraestructura archivada (respaldo apagado)

> **Estado: ARCHIVADO el 4 de agosto de 2026.** Oracle dejó de ser el servidor real de
> Fluency — proxy, backend y SurrealDB de producción corren en **GCP** desde esa fecha
> (ver [`docs/infrastructure/server_inventory.md`](../../docs/infrastructure/server_inventory.md)).
> Esta carpeta existe para **no perder nada** de la configuración/documentación de Oracle
> por si se decide reactivarlo en el futuro (el propio usuario planteó "en unos meses
> puede que quiera volver a Oracle"). Las máquinas de Oracle pueden seguir encendidas
> como respaldo frío, pero **ningún pipeline ni código activo las toca** a partir de esta
> fecha — ver "Qué se desconectó" abajo.
>
> Punto de entrada desde la documentación central: cualquier doc que mencione Oracle
> como servidor activo está desactualizado salvo que diga explícitamente "archivado,
> ver `tools/oracle-legacy/`".

## Qué vivía en Oracle (al momento de archivar)

| Nodo | IP pública | IP privada VCN | Rol |
|---|---|---|---|
| `server-reverse-proxy` (Backend Node / Proxy) | `157.151.199.170` | `10.0.1.67` | Caddy + backend Rust de producción + disco de assets (`card_images`, `card_audio`, `json`) |
| `server-oci-1` (DB dedicada) | `129.158.214.227` | `10.0.1.138` | Solo SurrealDB 3.2.3, puerto `8080`, límite Docker `800m` |

Specs completas, accesos, docker activo, RAM/CPU/disco: ver el snapshot congelado abajo
("Documentos movidos tal cual").

## Documentos movidos tal cual (contenido íntegro, sin editar)

- [`ARQUITECTURA_ORACLE_DB.md`](ARQUITECTURA_ORACLE_DB.md) — arquitectura de OCI-1,
  quirks de SurrealDB descubiertos ahí, tuning, historial de incidentes de esa DB.
- [`oracle-local-backend-deploy.md`](oracle-local-backend-deploy.md) — runtime del
  proxy Oracle: cómo se desplegaba el backend local, límites de memoria, centinela.
- [`wireguard-aws-oracle.md`](wireguard-aws-oracle.md) — túnel privado AWS↔Oracle
  (`10.10.0.0/30`) usado para que el espejo AWS sincronizara assets sin salir a
  internet pública.

Estos 3 archivos vivían en `docs/infrastructure/` y fueron **movidos** (no copiados) a
esta carpeta el 4 ago 2026 — su contenido no cambió, solo su ubicación.

## Qué se desconectó (y dónde revertir si se reactiva Oracle)

| Dónde | Qué se cambió al archivar | Cómo revertir |
|---|---|---|
| `azure-pipelines.yml` | `Mirror_Oracle` y `Mirror_OCI1` (stage `Deploy_Mirrors`) quedaron con `condition: false`. `Mirror_AWS` se independizó (ya no depende de `Mirror_OCI1`). | Quitar `condition: false` de ambos jobs; si se quiere volver a encadenar `Mirror_AWS` detrás de `Mirror_OCI1`, restaurar su `dependsOn`/`condition` original (ver historial git de este archivo). |
| `azure-pipelines.yml` (**gap corregido 5 ago 2026**) | El job `DeployFront` (stage `Deploy_Frontend`, "🚀 3. Deploy Front → Oracle Caddy") **no** se deshabilitó en el archivado del 4 ago — seguía usando `$(sshConn)=SrvPortfolio` (Oracle) para subir el SPA. Cada build se colgaba para siempre en el primer paso SSH esperando un host muerto, bloqueando la cola del agente `Default` para todos los builds siguientes (incidente real, ver `scripts/troubleshooting_library.skill.md`). Se le agregó `condition: false` al job (mismo patrón que `Mirror_Oracle`) y se ajustó la condición de `Deploy_Mirrors` para aceptar `Deploy_Frontend` en `Skipped` (antes exigía `succeeded`, lo que habría bloqueado también `Mirror_AWS`, el único mirror que sigue activo). **Consecuencia**: desde este fix, el frontend SPA NO se despliega a ningún lado vía pipeline — no hay todavía un service connection SSH hacia el proxy real (GCP, `10.128.0.5`). | Crear un service connection SSH hacia `10.128.0.5` (ver `docs/infrastructure/server_inventory.md` §GCP para credenciales/rol de esa VM), apuntar `DeployFront` ahí (nuevas rutas: Caddyfile real vive en `/mnt/sda/Caddyfile`, repo en `/mnt/sda/repository/flashcard` — no las rutas `/root/smart-proxy/...` de Oracle) y quitar `condition: false`. Si se reactiva Oracle en cambio, alcanza con quitar el `condition: false` tal cual está. |
| `backend/api_main/src/config.rs` | `ORACLE_HOST` default es la IP del proxy de GCP (`35.188.162.50`), no la de Oracle. | Cambiar el default (o, mejor, setear `ORACLE_HOST` como env var real en el entorno donde se despliegue). |
| `infra/proxy/Caddyfile` | `reverse_proxy` de `/db/*` (fluency.lat y qa.fluency.lat) apunta a `10.128.0.5:8080` (SurrealDB en GCP), no a `10.0.1.138:8080` (OCI-1). | Cambiar el target de esos dos bloques `handle /db/*` de vuelta a la IP de Oracle. |
| `azure-pipelines.yml` (`SURREAL_URL` del stage de build/deploy) | Apunta a `10.128.0.5:8080`. | Cambiar a `10.0.1.138:8080`. |
| `.agents/skills/sre-fluency-monitor/SKILL.md`, `sync-images-to-oracle/SKILL.md`, `sync-json-to-oracle/SKILL.md` | Ejemplos/IPs actualizados a GCP (`35.188.162.50`). | Restaurar las IPs de Oracle en esos skills si vuelven a ser el destino real. |
| `tools/fluency-monitor/mcp-server.js` y `server.js` | **Todavía** tienen `PROXY_IP`/`DB_IP` hardcodeadas a las IPs viejas de Oracle (`157.151.199.170` / `129.158.214.227`) — quedó como deuda técnica sin corregir en este archivado; si se reactiva Oracle, esto ya está "listo" sin tocar nada. Si en cambio se quiere que el monitor reporte GCP, hay que actualizar esas constantes. |

## Causa del último incidente conocido en Oracle (antes de migrar)

Ninguno relacionado con la migración — Oracle seguía funcionando correctamente cuando
se decidió mover el servidor real a GCP. El incidente de auth del 4 ago 2026 fue
posterior a la migración y ocurrió en GCP (causa real: `Surreal::new::<Ws>()` recibía
la URL con esquema `ws://` en vez de `host:puerto` pelado — ver commit
`d1db1e0` y `git log` de `connection.rs`). No es una razón para desconfiar de Oracle
si se reactiva.

## Checklist mínimo para reactivar Oracle como servidor real

1. Confirmar que `server-reverse-proxy` (`157.151.199.170`) y `server-oci-1`
   (`129.158.214.227`) siguen encendidos y con Docker corriendo (`docker ps` por SSH).
2. Revertir los 4 puntos de la tabla de arriba (pipeline, `config.rs`, `Caddyfile`,
   `SURREAL_URL` del pipeline).
3. Actualizar Cloudflare (si el origen de `fluency.lat` cambió a GCP, hay que volver
   a apuntarlo a Oracle) y el DNS-only de `qa.fluency.lat`.
4. Volver a levantar el túnel WireGuard AWS↔Oracle si el espejo AWS lo necesita
   (ver `wireguard-aws-oracle.md` en esta carpeta).
5. Restaurar en `docs/infrastructure/server_inventory.md` y
   `docs/infrastructure/AI_OPERATIONS_CONTEXT.md` las secciones de Oracle que fueron
   reemplazadas por las de GCP (o simplemente documentar que conviven ambos).
6. Cerrar el ciclo: correr `./scripts/verify-blueprints.sh` y actualizar esta misma
   carpeta con lo que haya cambiado mientras estuvo apagado.
