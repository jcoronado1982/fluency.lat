# Contexto operativo obligatorio para IA y mantenimiento

> Fuente de verdad de entrada para cualquier sesión que cambie infraestructura, rendimiento,
> caché, imágenes, audio, Caddy o pipeline. Última revisión: **4 de agosto de 2026**
> (migración de Oracle a GCP).
>
> Este archivo explica primero las restricciones reales. Los detalles de implementación viven en
> los documentos enlazados; no se debe proponer una optimización basándose solo en nombres de
> archivos, comentarios históricos o una arquitectura típica de nube.

## Orden de lectura y precedencia

1. Este documento: topología vigente, presupuesto de recursos y reglas de decisión.
2. [`server_inventory.md`](server_inventory.md): IPs, RAM, CPU, proveedor por máquina —
   **primera fuente; nunca SSH para datos que ya cubre** (regla doc-first de `GEMINI.md` raíz).
3. [`media-delivery-cache.md`](media-delivery-cache.md): versionado, Cloudflare, Caddy, navegador,
   imágenes/audio, precarga y cancelación.
4. [`pipeline-and-deploy.md`](pipeline-and-deploy.md): compilación, staging y despliegue.
5. Código ejecutable: `azure-pipelines.yml`, `infra/proxy/Caddyfile` e `infra/proxy/*.sh`.

> **Oracle está archivado** (respaldo apagado desde el 4 ago 2026 — ver
> [`tools/oracle-legacy/README.md`](../../tools/oracle-legacy/README.md)). Los docs que
> antes ocupaban los puntos 4-7 de esta lista (`oracle-local-backend-deploy.md`,
> `ARQUITECTURA_ORACLE_DB.md`, `wireguard-aws-oracle.md`) se movieron tal cual a
> `tools/oracle-legacy/` — siguen siendo útiles como referencia de arquitectura
> (el patrón proxy+DB por IP privada de VPC es el mismo en GCP), pero no describen el
> runtime vigente.

Si la documentación contradice el código ejecutable, **no se debe elegir silenciosamente uno**:
se verifica el runtime, se corrige la documentación en el mismo cambio y se registra la fecha. Los
documentos de incidentes e historiales explican el pasado; no prevalecen sobre esta lista.

## Arquitectura real: proxy + DB en GCP, cada uno de 1-2 GB

> Hasta el 4 ago 2026 esta topología eran "dos Oracle de 1 GB". El servidor real hoy es
> GCP (mismo patrón: proxy+backend en una VM, SurrealDB dedicada en otra, comunicación
> por IP privada de VPC). Detalle histórico de Oracle (archivado, no borrado):
> [`tools/oracle-legacy/README.md`](../../tools/oracle-legacy/README.md).

| Nodo | Recursos y rol vigente | No debe recibir |
|---|---|---|
| GCP Proxy `fluency-proxy-backend` — `35.188.162.50` / `10.128.0.4` | ~1 GB RAM (e2-micro), 2 vCPU, Alpine (`/` es tmpfs diskless de ~485 MB, cuidado con llenarlo — el disco persistente es `/mnt/sda`). Caddy, backend Rust de producción, disco de media/JSON. | Compilación Rust/Vite, SurrealDB, caché binaria de medios en el backend, procesos por cada asset. |
| GCP DB `fluency-db-surreal` — sin IP pública / `10.128.0.5` | ~2 GB RAM (e2-small), 2 vCPU, Alpine. **Solo SurrealDB 3.2.3** en `:8080`. | Caddy, backend Rust, generación de imagen/audio, compilación. |

La RAM de ambos nodos no se suma para un proceso: son máquinas separadas. Mover trabajo de una a
otra requiere red y cambia el riesgo; no convierte el sistema en una máquina de 3 GB.

El PC `LocalBuild` (~30 GB RAM) compila frontend y backend. El proxy de GCP solo recibe
artefactos, hace `docker pull`/`docker run`, sincroniza archivos y sirve tráfico. Esta
separación es deliberada.

⚠️ **Invariante de conexión a SurrealDB** (incidente real, 4 ago 2026): el backend usa
`Surreal::new::<Ws>(endpoint)`, que espera `endpoint` **sin** esquema (`host:puerto` pelado,
NO `ws://host:puerto`) — el tipo `Ws` ya fija el protocolo. Pasarle una URL con esquema no
da error: la conexión se cuelga hasta timeout y el backend degrada a `NullDbRepository`
(auth rota) sin aviso claro. Ver `connect()` en
`backend/api_main/src/infrastructure/storage/surreal/connection.rs`.

## Ruta del tráfico

```text
Producción
Usuario → Cloudflare → Caddy en GCP Proxy (fluency-proxy-backend)
                     ├─ SPA/HTML/JS/CSS → disco
                     ├─ /card_images y /card_audio → disco local, file_server
                     ├─ /json → disco local, file_server browse + compresión
                     └─ /api → backend Rust local si /tmp/ORACLE_HEALTHY existe
                               └─ GCP Cloud Run si el monitor detecta presión de RAM

Persistencia
Backend Rust → SurrealDB 10.128.0.5:8080 por VPC privada → GCP DB (fluency-db-surreal)

QA
Usuario → qa.fluency.lat DNS-only → Caddy directo, sin proxy/caché/WAF de Cloudflare
```

`/tmp/ORACLE_HEALTHY` lo gestiona `oracle-ram-monitor.sh`; el nombre es legado (viene de
cuando el proxy vivía en Oracle) pero el mecanismo sigue vigente sobre el proxy de GCP — no
renombrado en este archivado para no tocar el script sin necesidad. El umbral vigente es más
de 250 MB libres. El `X-Backend` de la respuesta permite distinguir `Oracle-Local` de
`GCP-Overflow` (ese header tampoco se renombró; sigue significando "local al proxy" vs
"overflow a Cloud Run").

## Presupuesto de RAM y CPU

| Proceso/contenedor | Techo vigente | Observación |
|---|---:|---|
| Backend Rust producción, GCP Proxy | `512m` (memory-swap `512m`, sin swap) | Verificado `docker inspect` 5 ago 2026. Incluye resolución/generación; el límite protege a Caddy de un OOM global. |
| Caddy, GCP Proxy | **sin límite** (`Memory: 0`) | Corrige un `384m` documentado antes que ya no reflejaba la realidad — verificado `docker inspect` 5 ago 2026. Monta `-v /tmp:/tmp` (obligatorio para la válvula `api_with_overflow`, ver `server_inventory.md`). |
| Backend QA, GCP Proxy | `128m`, `cpu-shares=128`, memory-swap `256m` | Solo cuando QA está desplegado; cede CPU a producción bajo contención. Verificado 5 ago 2026 con el contenedor `Exited (137)` — revisar si es OOM antes de asumir que sigue sano. |
| SurrealDB, GCP DB | `1200m`, memory-swap `2200m` | Corrige un `800m` documentado antes (dato desactualizado, no se sabe desde cuándo) — verificado `docker inspect` 5 ago 2026 (bytes exactos `1258291200`/`2306867200`). VM `e2-small` de 2 GB — hay margen sin usar. |

Los límites Docker son **techos, no reservas**. Que su suma supere la RAM física no significa que
esa memoria esté asignada permanentemente. Ambos hosts (Proxy y DB) tienen swap de 4 GB como
protección (verificado en vivo 5 ago 2026 — antes solo se documentaba en el Proxy), pero usarla de
forma sostenida degrada latencia y no sustituye RAM. Solo el Proxy tiene TCP BBR + fd-limits 65535;
la DB no los tiene (verificado, `cubic`/`pfifo_fast` sin tocar) — consistente con que ese tuning
ataja la latencia hacia clientes externos, que solo terminan en el Proxy.

Reglas obligatorias para este presupuesto:

- No compilar, convertir catálogos completos ni ejecutar `docker buildx` en el proxy de GCP
  (mismo veredicto que antes en Oracle: son VMs de 1 GB, no build agents).
- No guardar bytes completos de imágenes/audio en mapas del backend ni en `Blob` de JavaScript.
- No crear un proceso, SSH/SCP o hash completo por cada descarga.
- No aumentar límites porque “hay memoria libre” sin medir RSS, picos, swap y latencia bajo carga.
- No precargar varias tarjetas: solo la siguiente imagen y el siguiente audio existentes.
- No generar media durante precarga. Un `404` termina la anticipación.
- Mantener rotación Docker `10m × 2`; el disco también es un recurso finito.

## Dónde existe caché y quién hace qué

| Capa | Qué conserva | Política actual |
|---|---|---|
| Backend Rust | Solo metadatos pequeños/acotados; **no bytes de media** | Calcula/resuelve `?v=` con metadatos. |
| Caddy | No hay caché de aplicación configurada | `file_server` lee el archivo del volumen; entrega ETag/Last-Modified y headers. |
| Kernel Linux | Page cache normal y recuperable | Puede usar RAM libre para acelerar disco; el kernel la libera bajo presión. No es una copia administrada por la app. |
| Cloudflare edge | Imágenes/audio de producción versionados | Cache Rule `Media versionada`; el origen solicita 1 año mediante `Cloudflare-CDN-Cache-Control`. |
| Navegador | Caché HTTP | La identidad cambia con `?v=`; no se guardan catálogos binarios en RAM JavaScript. |

Cloudflare no almacena los archivos originales como fuente de verdad. La fuente de verdad continúa
siendo `/mnt/sda/repository/flashcard` en el proxy de GCP (antes `/root/smart-proxy/repository/flashcard`
  en Oracle Proxy — la ruta cambió con la migración del 4 ago 2026). Un `MISS` lee el origen; un `HIT` lo
sirve el edge. Las copias antiguas pueden permanecer hasta su expulsión, pero dejan de solicitarse
cuando cambia `?v=`.

## Invariante de actualización de imágenes y audio

Los nombres físicos pueden permanecer iguales. El backend devuelve, por ejemplo:

```text
/card_images/.../tarjeta.avif?v=<mtime-nanosegundos>-<tamaño>
/card_audio/.../tarjeta.ogg?v=<mtime-nanosegundos>-<tamaño>
```

Al sobrescribir el archivo, debe cambiar su metadata y por tanto la URL. No se regenera el resto del
catálogo, no se calcula hash del contenido y no se purga toda Cloudflare. Antes de modificar esta
estrategia, leer la explicación y los fallbacks en `media-delivery-cache.md`.

La cache key de Cloudflare debe incluir la query completa. **Nunca activar `Ignore Query String` ni
excluir `v`/`t`**, porque haría equivalentes versiones con bytes distintos.

## Configuración externa vigente

- Registrador: Spaceship; DNS autoritativo: Cloudflare.
- `fluency.lat` y `www.fluency.lat`: proxy naranja de Cloudflare.
- `qa.fluency.lat`: A directo al proxy (hoy GCP, antes Oracle), nube gris/DNS-only.
- TLS: **Full (strict)**; Caddy conserva certificados válidos en el origen.
- Cache Rule: `Media versionada`, solo hosts de producción y paths `/card_images/` o
  `/card_audio/`, `Eligible for cache`, cache key estándar.
- No están habilitados para este flujo Cache Reserve, Cloudflare Images ni R2.
- Variable de despliegue de producción: `MEDIA_DELIVERY_MODE=cloudflare`; el rollback admite
  `oracle`, pero requiere redesplegar backend y Caddy y usar acceso directo al origen.

Observación en vivo del 14 de julio de 2026: Cloudflare respondió una AVIF versionada con
`CF-Cache-Status: MISS` y `Cache-Control: public, max-age=14400`; Caddy directo por QA respondió
`Cache-Control: public, no-cache` y
`Cloudflare-CDN-Cache-Control: public, max-age=31536000`. El valor de cuatro horas es el Browser
Cache TTL predeterminado de Cloudflare. No rompe la actualización porque cada reemplazo obtiene un
`?v=` nuevo, pero una futura sesión no debe afirmar que el header visible siempre será `no-cache`.
Si se desea revalidación estricta en el navegador, configurar Browser Cache TTL como **Respect
Existing Headers** o una Cache Response Rule específica y volver a medir; no cambiar esto por
suposición durante otro trabajo.

## Cliente: prioridad, precarga y cancelación

- La tarjeta visible siempre tiene prioridad.
- Solo después de resolver sus medios se anticipan la imagen y el audio existentes de la tarjeta
  siguiente.
- Cambiar rápido de tarjeta aborta resolución/descarga anterior y descarta respuestas tardías.
- La precarga usa solo endpoints `resolve-*`; nunca `generate-image` ni `synthesize-speech`.
- JavaScript conserva como máximo 24 entradas pequeñas de metadatos con TTL; los bytes pertenecen a
  la caché HTTP del navegador.
- El estudio normal y `landing-demo` comparten esta política. No corregir uno dejando el otro atrás.

## Pipeline: qué copia y cuánto cuesta

El pipeline actual transfiere en cada despliegue todo `json/` a
`/tmp/flashcard-json-staging` mediante `CopyFilesOverSSH`; después `sync-json-to-oracle.sh` hace
`rsync -a --update` al repositorio definitivo sin borrar decks exclusivos del origen. En el run 279
se transfirieron 2.978 archivos (~46 MB) y el staging tardó ~12 minutos, aunque el `rsync` final tomó
unos 3 segundos. También transfiere los 157 audios de `landing-demo` (~25 segundos). No copia todo
el catálogo normal de imágenes/audio.

Este staging completo es un costo conocido del pipeline, no carga del usuario ni caché de Caddy.
Optimizarlo es una tarea separada: primero se debe preservar el manifiesto generado, la semántica
sin `--delete`, los decks solo presentes en el origen y la capacidad de recuperación. No sustituirlo
por un borrado/sync agresivo para ahorrar minutos.

La verificación del origen debe conectar con:

```bash
curl -skI --resolve fluency.lat:443:127.0.0.1 \
  'https://fluency.lat/card_images/<archivo>?v=pipeline-check'
```

`Host: fluency.lat` sobre `https://127.0.0.1` no conserva SNI y produjo el falso fallo del run 279.
El commit `59f2eab7` corrigió ese guard. La prueba solo hace `HEAD`; no carga media en RAM.

## Protocolo antes de “optimizar”

Una IA o persona debe responder estas preguntas con evidencia antes de cambiar código:

1. ¿El tiempo está en resolver metadatos, descargar bytes, decodificar, generar IA, DB o pipeline?
2. ¿La medición atravesó Cloudflare, QA directo, localhost o un backend remoto?
3. ¿Se midieron RSS, swap, CPU, red y número de solicitudes, o solo percepción visual?
4. ¿El cambio agrega bytes/procesos/cachés por usuario y cuánto consume con 100 usuarios?
5. ¿Respeta actualización bajo el mismo nombre y conserva la query `?v=`?
6. ¿Afecta estudio normal y demo? ¿Cancela trabajo abandonado?
7. ¿Funciona en `oracle` y `cloudflare` o rompe el puerto/adaptador hexagonal?
8. ¿La ganancia compensa complejidad, riesgo de OOM, contenido stale y costo externo?

Una optimización no es correcta solo porque reduce latencia en una máquina grande. Para este sistema
debe reducir o acotar trabajo sin trasladar un costo ilimitado a RAM, CPU, el proxy, generación IA o
facturación. Si no hay medición, primero instrumentar o reproducir; no agregar una caché nueva.

## Verificación mínima después de un cambio

1. `curl https://fluency.lat/api/health`: 200, `server: cloudflare`, `X-Backend` conocido.
2. `curl https://qa.fluency.lat/api/health`: 200 directo Caddy cuando QA está desplegado.
3. Repetir una URL versionada real: `CF-Cache-Status` debe pasar normalmente de `MISS` a `HIT`.
4. Sobrescribir un archivo de prueba o comparar metadata: resolver de nuevo debe producir otro
   `?v=` y mostrar bytes nuevos sin regenerar el catálogo.
5. Confirmar en ambos contenedores el mismo `MEDIA_DELIVERY_MODE`.
6. Navegar rápido: solicitudes anteriores canceladas; ninguna generación causada por precarga.
7. Revisar RAM/swap de ambas VMs de GCP (proxy y DB) y logs con rotación, no solo el resultado funcional.

## Errores que no se deben repetir

- Tratar las dos VMs de GCP (proxy y DB) como una sola bolsa de RAM.
- Mover SurrealDB de la VM dedicada al proxy o usar `127.0.0.1:8001` en producción.
- Poner `SYNC_TO_ORACLE=true` u omitir `ORACLE_REPOSITORY_ONLY=false` en el backend local del proxy
  (el nombre de estas variables es legado de Oracle; el efecto aplica igual en GCP).
- Pasar una URL con esquema (`ws://...`) a `Surreal::new::<Ws>()` — cuelga en vez de fallar
  con un error claro (incidente real, 4 ago 2026).
- Añadir una caché binaria en Rust/JavaScript para “igualar” la rapidez visual de una imagen.
- Hacer precarga de varias tarjetas o invocar IA durante anticipación.
- Cachear HTML, API o JSON con la regla de media.
- Ignorar query strings en Cloudflare o declarar immutable un asset sin versión.
- Purgar todo Cloudflare como procedimiento normal de actualización.
- Compilar o regenerar el catálogo completo en un servidor de 1 GB.
- Asumir que un stage lento de JSON significa que Caddy o los usuarios están consumiendo RAM.
- Validar HTTPS local solo con header `Host` y perder el SNI.
- Confundir el nombre legado del contenedor `flashcard-backend-node` (o el label ambiguo
  "Rust/Node" que traía `tools/fluency-monitor/mcp-server.js` antes del 22 jul 2026) con un runtime
  Node.js real. El backend de producción es 100% Rust/Axum; verificar con
  `curl https://fluency.lat/api/health` (`"service":"flashcard-rust-backend"`) antes de proponer
  una "migración a Rust" que no tiene nada que migrar.
- Proponer flags o variables de SurrealDB sin verificarlos contra el binario real
  (`docker run --rm surrealdb/surrealdb:v3.2.3 start --help`). Ejemplo real descartado:
  `--kvs-ca-size` no existe (se confundió con `--kvs-ca`, que es una ruta de certificado TLS para
  un KV store remoto, no un tamaño de caché). Detalle en `ARQUITECTURA_ORACLE_DB.md` §17.

