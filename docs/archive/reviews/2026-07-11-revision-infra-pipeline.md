# Revisión de Infraestructura y Pipeline — 2026-07-11

> Revisión en vivo (SSH) de los servidores Oracle + auditoría del `azure-pipelines.yml`.
> Estado general: **sano**. Los scripts desplegados en el proxy son idénticos a los del repo.
> Los hallazgos de esta revisión se repararon el mismo día — ver sección "Acciones tomadas".

## 1. Estado en vivo — Oracle Proxy (`server-reverse-proxy`, 157.151.199.170)

- **HW/SO real:** x86_64 AMD EPYC, Alpine Linux, 968 MB RAM (404 MB disponibles), disco 98 GB al 9 %.
- **Contenedores** (45 h uptime, límites Fase B aplicados):

| Contenedor | Límite RAM | Uso real | cpu-shares | Log rotation |
|---|---|---|---|---|
| `flashcard-backend-node` (:8080) | 512 MB | 57 MB | 1024 | 10m×2 ✅ |
| `caddy-smart` (:80/:443) | 384 MB | 92 MB | — | 10m×2 ✅ |
| `qa-flashcard-backend-node` (:8081) | 128 MB | 21 MB | 128 | 10m×2 ✅ |

- **Centinela:** estado `normal`; sin `/tmp/PROXY_CLOSED` ni `GATE_FILE`; `/tmp/ORACLE_HEALTHY` presente
  (válvula de overflow enruta al backend local). Invariante `PROXY_CLOSED ⟺ estado ≠ normal` cumplido.
- **Health:** prod y QA responden 200 local y vía Caddy.
- **Assets:** 194 MB imágenes + 73 MB audio + 45 MB json en `/root/smart-proxy/repository/flashcard/`.
- **Scripts desplegados** (`/root/smart-proxy/infra-proxy/`): idénticos byte a byte a `infra/proxy/` del repo. ✅

## 2. Estado en vivo — OCI-1 (`server-oci-1`, 129.158.214.227)

- **HW/SO real:** x86_64 AMD EPYC 7551, Alpine Linux, 968 MB RAM (460 MB disponibles), 71 días uptime.
- **SurrealDB v1.5.5:** límite 800m, `--network host`, `restart=always`; datos 9.3 MB en `/root/surreal_data`.
- **Tuning aplicado:** `vm.swappiness=10`, `net.core.somaxconn=4096`, swapfile 4 GB.
- **Exposición pública del :8080 verificada desde fuera: inaccesible.** iptables acepta 8080 solo
  desde `10.0.1.67` (proxy) y dropea el resto; además protege la security list de OCI.

## 3. Pipeline (azure-pipelines.yml)

- Diseño coherente con la regla de oro: build en `LocalBuild` (30 GB RAM), deploy en pool `Default` (Oracle 1 GB).
- 6 stages verificados; QA solo despliega frontend + backend Oracle; GCP/OCI-1/AWS condicionados a `main`.
- Verificación post-deploy correcta: health local, ruteo Caddy por 127.0.0.1, `/api/categories` no vacío.
- Cleanup borra el artefacto ADO (previene saturación de disco del agente).
- Trigger GitHub → Azure DevOps (definition id 2) operativo.
- Higiene de secretos del repo: `SECRETS_MAP.md`, `backend/.env`, `keys/*.pem`, `*.bak` ignorados y no trackeados. ✅

## 4. Hallazgos

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| H1 | Dos instancias de `traffic-manager` + socats duplicados en :8888; proceso zombi con doc de la arquitectura vieja | Media | ✅ Reparado (pkill en bootstrap + limpieza en vivo) |
| H2 | Contenedor `surrealdb` (OCI-1) sin rotación de logs Docker | Baja | ✅ Reparado (script + redeploy) |
| H3 | `INFRASTRUCTURE.md` decía "ARM Ampere A1, Ubuntu 22.04" para el proxy — es x86_64 AMD EPYC Alpine | Baja (doc) | ✅ Corregido |
| H4 | Build `arm64` en Stage 2: ningún destino activo es ARM (proxy/OCI-1/AWS/Cloud Run son x86_64); solo el worker Azure (fuera del pipeline) es ARM | Info | Documentado — decidir si se elimina |
| H5 | `SURREAL_PASS=root` hardcodeado en `azure-pipelines.yml` (mitigado por firewall VCN); reuso de `OCI_PASSWORD` en OCI-1 y AWS; `ORACLE_SSH_PASSWORD` como env var plana en Cloud Run | Media | ✅ YAML limpio (variable group). Pendiente recomendado: rotar `root/root` real y separar `OCI_PASSWORD` |
| H6 | Regla iptables huérfana en OCI-1 (ACCEPT :8001, ya nada escucha ahí); policy INPUT=ACCEPT depende del orden de reglas | Baja | ✅ Regla 8001 eliminada y persistida; policy documentada |
| H7 | **Matcher de caché de Caddy roto**: `query v=* t=*` exige ambos parámetros (AND) — la política `immutable` para URLs versionadas NUNCA estuvo activa (imágenes incluidas), y `/card_audio/*` era `immutable` incondicional → audio regenerado quedaba stale hasta 1 año en otras sesiones | **Alta** | ✅ Snippet `asset_cache_policy` (expression CEL) para imágenes+audio, prod+QA; verificado en vivo (immutable/no-cache/304) |

## 5. Acciones tomadas (2026-07-11)

Ver commits del día y `INFRASTRUCTURE.md` actualizado. Resumen:

1. `bootstrap-oracle.sh`: mata instancias previas de monitores antes de relanzar (evita duplicados de `traffic-manager`/`socat`). Limpieza en vivo aplicada en el proxy.
2. `deploy-surrealdb-oci1.sh`: añade `--log-opt max-size=10m --log-opt max-file=2`; redeploy aplicado en OCI-1 (downtime de segundos; el watchdog del backend reconectó).
3. `azure-pipelines.yml`: credenciales de Surreal fuera del YAML (variable group `Flashcard-Secrets`).
4. OCI-1: eliminada regla iptables ACCEPT :8001 (persistida en `/etc/iptables/rules-save`).
5. `INFRASTRUCTURE.md` y comentarios del pipeline corregidos (hardware real x86_64/Alpine).
6. **Caché de assets (H7)**: snippet `asset_cache_policy` en el Caddyfile (imágenes + audio, prod + QA)
   y `assets.rs` alineado (audio con ETag/304 y política por query, igual que imágenes). Desplegado
   en vivo y verificado: `?v=`/`?t=` → immutable 1 año; sin versión → no-cache + 304 en ~0.26 s.
7. Auditoría de arquitectura hexagonal/SOLID: backend y frontend conformes; desviaciones aceptadas
   documentadas en `docs/ARQUITECTURA_MODULAR.md` §8.1 y `client/CLAUDE.md` §2/§9.

## 6. Requisito de operación

- **Concurrencia mínima: 100 usuarios simultáneos** (objetivo de diseño Fase A: 500). Validada — §7.
- **Caché de assets:** carga ultra rápida vía Caddy, pero sin caché stale — al regenerar imagen/audio
  el usuario debe ver el contenido nuevo (política `?v=` → immutable 1 año; sin versión → `no-cache`/304).
- **QA:** se mantiene usable 24/7 pero SIN recursos dedicados (128m + cpu-shares 128: bajo contención
  cede toda la CPU a prod; se usa pocas veces y de noche). No eliminar; no ampliar.

## 7. Prueba de carga — 100 usuarios concurrentes (2026-07-11, `ab` desde cliente remoto)

| Objetivo | Concurrencia | Requests | Fallos | RPS | p50 | p95 |
|---|---|---|---|---|---|---|
| `/api/health` (Caddy→backend) | 100 | 2000 | 0 | 130 | 390 ms | 7.4 s* |
| `/api/health` keep-alive | 100 | 3000 | 0 | 113 | 380 ms | 5.4 s* |
| Imagen AVIF `?v=` (file_server) | 100 | 2000 | 0 | 190 | 362 ms | 1.3 s |
| Revalidación 304 (ETag) | 1 | — | 0 | — | 260 ms | — |

\* La cola p95 es del **uplink del cliente de prueba**, no del servidor: durante toda la carga el
proxy registró `load average 0.00`, RAM libre estable (~454 MB), contenedores en 0 % CPU, y la
válvula de overflow NO saltó (`X-Backend: Oracle-Local` todo el tiempo). 100 usuarios reales
generan ~10-30 req/s sostenidos — un orden de magnitud por debajo de lo medido desde un solo
cliente. **Veredicto: el requisito de ≥100 concurrentes se cumple con margen amplio**, con dos
backstops (overflow a Cloud Run si RAM < 250 MB; centinela 503 si la DB entra en amarillo/rojo).

## 8. Hallazgo informativo — catalog-manifest.json (no incidente)

`/json/catalog-manifest.json` da 404 en prod: los pasos del pipeline que lo generan y sincronizan
(`generate-catalog-manifest.mjs` + check duro en `sync-json-to-oracle.sh`) existen solo en
`dev-login`; el `main` desplegado nunca los corrió. El backend de prod usa el fallback por listado
de directorios y `/api/categories` responde correctamente (verbs 208, nouns 1041, …). Se
autocorrige al mergear a `main`.

## 9. Sincronización garantizada (cerrado el mismo día)

Los scripts de infra se copian **del repo al servidor en cada deploy** — nada vive solo en el
servidor. Para que ningún deploy futuro revierta los fixes, los commits se aplicaron en AMBAS ramas:

- `dev-login`: `8b187eb6` (fixes revisión) + `b1d88921` (no-cache en `/json`).
- `main`: cherry-picks idénticos `0fd2fce7` + `892be909`, pusheados el 2026-07-11 → pipeline
  disparado automáticamente (GitHub → Azure). El merge futuro de `dev-login` será limpio
  (mismo contenido). `client/CLAUDE.md` se excluyó del cherry-pick (no existe en `main`;
  llega con el merge de la rama).

Regla operativa: **cualquier cambio manual en el proxy/OCI-1 debe commitearse en el repo en la
misma sesión** — el siguiente deploy lo sobreescribe con lo que haya en la rama desplegada.

**Hallazgo (H9): cada push a `main`/`qa` dispara el pipeline DOS veces** — el trigger nativo de
Azure (conexión GitHub, `trigger:` del yml) y el GitHub Action `trigger-azure-pipeline.yml` son
redundantes (verificado: push `892be909` encoló builds 255 y 256 con 2 s de diferencia; el
duplicado 256 se canceló a mano, igual que los pares cancelados del historial del 10 jul).
Recomendación: eliminar el workflow de GitHub (el trigger nativo encola primero y es el fiable);
decisión pendiente del propietario.

### Nota multi-usuario y caché (2026-07-11)

Hoy TODOS los usuarios usan los mazos generales; la creación de mazos propios será una feature
premium **aún no programada**. La caché ya es segura para ambos escenarios:

- **Media por usuario (ya existe)**: al regenerar imagen/audio, `user_path_segment(email)` entra
  en el filename para usuarios no-admin → URL distinta por usuario; la caché del navegador
  (indexada por URL) no puede cruzar contenido entre usuarios ni con el general (admin/demo).
- **Mazos propios (futuro premium)**: deberán viajar por `/api/*` (DB), sin cabeceras de caché —
  el navegador no los cachea. Al programarlos, seguir el mismo patrón de namespacing por usuario
  si generan archivos en disco.
- **Mazos generales** (`/json/*`): `no-cache` explícito desde este fix — sin él, `file_server`
  emitía `Last-Modified` y el navegador aplicaba caché heurística (stale potencial de días).
