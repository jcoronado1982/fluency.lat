# Optimizaciones de infraestructura — Fase A y B + revisión (Jul 2026)

> **Histórico** (extraído de `INFRASTRUCTURE.md` al convertirlo en stub, 2026-07-16). Registra QUÉ
> se optimizó y por qué. Las reglas operativas vigentes que derivan de esto viven en
> `docs/infrastructure/AI_OPERATIONS_CONTEXT.md`; la política de caché en
> `docs/infrastructure/media-delivery-cache.md`.

## 3. Optimizaciones Fase A (Jul 2026)

Para soportar 500 usuarios concurrentes en servidores de 1 GB:

*   **Batch de tarjetas como transacción única:** `upsert_cards_batch` agrupa N tarjetas en `BEGIN TRANSACTION; ... COMMIT;` en una sola petición, eliminando N round-trips al WS compartido de Surreal.
*   **Índice en card_progress:** `DEFINE INDEX idx_card_progress_user ON card_progress FIELDS user_id;` — acota scans a filas del usuario.
*   **Conteo por prefijo en la DB:** `string::startsWith(deck, $prefix)` + `count()` sin traer filas al backend.
*   **Cache in-process:** racha diaria (`record_study_day`) y conteos estáticos (`list_categories_with_counts`) se memorizan con TTL 5 min.
*   **Watchdog de reconexión:** el backend auto-reconecta al WS de Surreal si muere (health-check cada 30s).

## 3.1 Optimizaciones Fase B (Jul 2026)

*   **Centinela sin forks por request:** `db_protection` en Caddy ya no usa `forward_auth` → socat → shell (6-8 procesos por CADA request, incluidos assets). Caddy evalúa directamente los archivos de estado (`/tmp/PROXY_CLOSED`, `/tmp/GATE_FILE`) con matchers `file` nativos. `sentinel-handler` y `traffic-manager` mantienen el invariante `PROXY_CLOSED existe ⟺ estado ≠ normal`; el puerto 8888 sigue sirviendo los endpoints de control (`/rojo`, `/amarillo`, `/normal`, `/status`, `/check`).
*   **Límite de RAM del backend en el proxy:** `deploy-oracle-backend.sh` ahora usa `--memory 512m` (`FLASHCARD_BACKEND_MEMORY_LIMIT`). Antes, un pico del backend (encode AVIF) podía provocar OOM global y tumbar Caddy; ahora Docker reinicia solo el backend.
*   **Proveedor de entrega de media configurable:** `MEDIA_DELIVERY_MODE=oracle|cloudflare` selecciona un adaptador sin cambiar handlers. En `oracle`, Caddy entrega directo y el navegador conserva URLs versionadas. En `cloudflare`, `/card_images/*` y `/card_audio/*` envían caché larga solo al CDN y el navegador revalida contra el edge. Sin versión, todos revalidan. La versión se obtiene solo de metadatos del archivo (fecha de modificación + tamaño): no regenera, no lee el contenido, no crea procesos y no agrega caché en RAM.
    El estudio normal y `landing-demo` comparten la precarga cancelable de la siguiente imagen/audio
    existente. La tarjeta visible tiene prioridad y la anticipación nunca ejecuta IA.
    El cambio requiere redesplegar backend y Caddy. No cambia el enrutamiento DNS: el modo
    `cloudflare` requiere un registro proxyado; el modo `oracle` requiere DNS-only o un hostname
    de origen separado para que el tráfico no atraviese Cloudflare.
    Guía canónica: [entrega y caché de imágenes y audio](docs/infrastructure/media-delivery-cache.md).
    El pipeline de producción está configurado para `cloudflare`. `fluency.lat`/`www` tienen proxy
    naranja; `qa.fluency.lat` permanece DNS-only y directo a Oracle, por lo que no usa caché CDN.
    Cloudflare quedó configurado con la regla activa `Media versionada` (solo imágenes/audio de
    producción, cache key estándar) y SSL/TLS **Full (strict)**. La configuración detallada del
    panel, costos, actualización bajo el mismo nombre y procedimiento de publicación están en la
    guía canónica.
    Para metadatos remotos se prefiere el ETag de Caddy (mtime de alta precisión + tamaño) dentro
    del mismo `HEAD`, evitando colisiones por redondeo sin hash, lectura de bytes ni RAM adicional.
*   **Compresión en `/json/*`:** los decks JSON se sirven con zstd/gzip (−70 % egress). `browse` se mantiene: el backend lista directorios parseando ese HTML.
*   **Dependencias muertas eliminadas:** `sqlx` (Postgres aún no desarrollado), `google-cloud-storage` y `google-cloud-token` fuera de `api_main/Cargo.toml` — menos binario y menos tiempo de compilación. `openssl` vendored se conserva (lo requiere `native-tls` vía SurrealDB).
*   **Válvula de overflow conectada:** `oracle-ram-monitor.sh` siempre gestionó `/tmp/ORACLE_HEALTHY`, pero ningún matcher lo leía. Ahora `/api/*` de `fluency.lat` usa el snippet `api_with_overflow`: RAM libre > 250 MB → backend local; si no → GCP Cloud Run (scale-to-zero). Verificado funcionalmente con Caddy local (4 estados).
*   **Techos de RAM por contenedor** (la caja tiene 968 MB + 4 GB swap; medido en reposo: backend 43 MB, QA 14 MB, Caddy 80 MB): prod backend 512m, QA backend 128m + `cpu-shares 128` (`azure-pipelines.yml` — QA se usa poco y de noche; bajo contención cede la CPU a prod, con prod ocioso corre a velocidad completa), caddy-smart 384m. Los techos no reservan RAM; hacen determinista qué contenedor se reinicia ante un pico, en vez de dejar que el OOM killer del kernel tumbe la caja.
*   **Rotación de logs Docker:** `--log-opt max-size=10m --log-opt max-file=2` en backend y Caddy — con `RUST_LOG=info` y 500 usuarios los json-logs de Docker crecían sin límite.

## 3.2 Revisión y fixes (11 Jul 2026)

Detalle completo en `reviews/2026-07-11-revision-infra-pipeline.md`. Cambios operativos:

*   **Caché de audio corregida (bug de matcher Caddy):** el matcher `query v=* t=*` exige AMBOS
    parámetros (AND) — nunca matcheó, así que la política "immutable con versión" no estaba activa
    ni para imágenes; y `/card_audio/*` era `immutable` incondicional (audio regenerado quedaba
    stale hasta 1 año en navegadores de otras sesiones). Ahora el snippet `asset_cache_policy`
    (expression CEL, verificado en vivo) aplica a imágenes Y audio, prod y QA: `?v=`/`?t=` →
    caché larga en Cloudflare; sin versión → `no-cache` + ETag. Desde la revisión del
    versionado, el navegador conserva `no-cache` incluso para URLs versionadas y delega la
    copia duradera al CDN mediante `Cloudflare-CDN-Cache-Control`.
    `assets.rs` replica la política (audio ganó ETag/304 y dejó la heurística por nombre de archivo).
*   **Rotación de logs en SurrealDB (OCI-1):** `deploy-surrealdb-oci1.sh` ahora usa
    `--log-opt max-size=10m --log-opt max-file=2` (era el único contenedor sin rotación).
*   **Strays del centinela:** `deploy-caddy.sh` hace `pkill` de `traffic-manager`/`sentinel-handler`
    tras eliminar el contenedor (hubo un traffic-manager huérfano 71 días a nivel host duplicando
    el gate). Dentro del contenedor solo corre 1 instancia de cada uno (entrypoint).
*   **Credenciales Surreal fuera del YAML:** `SURREAL_USER`/`SURREAL_PASS` viven en el variable
    group `Flashcard-Secrets` (Azure DevOps). Pendiente recomendado: rotar el `root/root` real de la
    DB y dejar de reusar `OCI_PASSWORD` entre OCI-1 y AWS.
*   **iptables OCI-1:** eliminada la regla huérfana `ACCEPT tcp dpt:8001` (nada escucha ahí desde
    la migración del puerto); reglas persistidas en `/etc/iptables/rules-save`.
*   **Nota arm64:** ningún destino activo del pipeline es ARM (proxy y OCI-1 son x86_64; AWS t3.micro
    y Cloud Run también). El target `linux/arm64` del Stage 2 solo serviría para el worker Azure
    (ARM Ampere, fuera del pipeline) — candidato a eliminarse para acortar el build.

