# 📚 Biblioteca de Lecciones Aprendidas (Troubleshooting Library)

Este documento es una base de conocimientos dinámica de errores técnicos, bugs de infraestructura y fallos de lógica encontrados durante el desarrollo. **Cualquier IA que solucione un problema NO TRIVIAL debe registrarlo aquí.**

---

## 🛑 Incidentes de Infraestructura

### 0. Post-mortems completos (en `docs/archive/`)
- [Audio mudo en modo Oracle (`ORACLE_REPOSITORY_ONLY`)](../docs/archive/INCIDENT_REPORT_AUDIO_ORACLE_MODE_2026-07.md) — 2026-07. Lección vigente: el backend del Oracle Proxy DEBE llevar `ORACLE_REPOSITORY_ONLY=false` (el default `true` del binario rompe todo lookup por prefijo).
- [Bloqueo de IA / migración Gemini 3.1](../docs/archive/INCIDENT_REPORT_GEMINI_LEAK_2026.md) — 2026.
- [Revisión de infra/pipeline en vivo](../docs/archive/reviews/2026-07-11-revision-infra-pipeline.md) — 2026-07-11.

### 0b. Migración de pipeline a Azure (2026-05-07) — 3 lecciones
- **SSL Mode con Postgres en Alpine**: el servidor tenía SSL deshabilitado y `sqlx` negocia SSL por defecto → `password authentication failed`. Solución: `?sslmode=disable` en `DATABASE_URL`. *(Contexto histórico: Postgres ya no es la DB del producto.)*
- **Zombie Build por caché Docker**: la pre-compilación con `main.rs` vacío + mtimes hacía que Docker no invalidara la caché y desplegara el binario vacío (contenedor moría sin logs). Solución: `COPY . .` + `cargo build` directo, sin truco de mtimes.
- **Errores de compilación ocultos** tras el zombie build. Protocolo: `cargo check` local SIEMPRE antes de push; si Cloud Run falla sin logs, sospechar binario corrupto/vacío por caché.

### 1. Error de Permisos en Cloud Run (Cross-Project)
- **Fecha:** 2026-05-04
- **Error:** `ERROR: (gcloud.run.deploy) Google Cloud Run Service Agent ... must have permission to read the image...`
- **Causa:** El agente de Azure DevOps tenía un proyecto de GCP por defecto (`xrubi-fd22e`), pero la imagen estaba en otro proyecto (`launch-490115`). Al omitir el flag `--project`, `gcloud` intentaba desplegar en el proyecto equivocado.
- **Solución:** Forzar siempre el proyecto en el comando de despliegue:
  ```bash
  gcloud run deploy [SERVICE] --project $(gcpProject) --image [IMAGE] ...
  ```

### 2. Fallo de Conexión Oracle CLI (API Keys)
- **Fecha:** 2026-05-04
- **Error:** `Permission denied (publickey)` o `Invalid private key`.
- **Causa:** Rutas relativas en el archivo `~/.oci/config` o falta de permisos `600` en la llave `.pem`.
- **Solución:** Usar siempre rutas ABSOLUTAS en el config de OCI y asegurar que la llave privada no sea legible por el grupo/otros.

### 5. Upgrade SurrealDB 1.5.5 → 3.2.3: sin compatibilidad cruzada de versión entre backend y DB
- **Fecha:** 2026-07-21
- **Error:** con la DB ya en 3.2.3 y el backend viejo (crate 1.5.5) corriendo, `/api/demo-feedback`
  colgaba 10+ s sin responder (probado directo en el proxy, sin Cloudflare de por medio). Al
  revés — backend nuevo (crate 3.2.3) contra DB vieja (1.5.5) — la conexión WS falla por completo:
  `WebSocket protocol error: SubProtocol error: Server sent no subprotocol`.
- **Causa:** el pipeline (`azure-pipelines.yml`) despliega `Mirror_Oracle` (backend) antes que
  `Mirror_OCI1` (DB) por diseño (`dependsOn: Mirror_Oracle`). Para un salto de versión MAYOR de
  SurrealDB, ese orden dejaba una ventana con backend y DB en versiones incompatibles — sea cual
  sea el orden, un lado se rompe (el `dependsOn` actual solo es seguro para redeploys dentro de la
  misma versión mayor).
- **Causa adicional (mismo upgrade):** un binario de una versión mayor no lee el storage on-disk de
  dos versiones mayores atrás — `surreal fix` de 3.2.3 sobre datos 1.5.5 responde "Fix is not
  implemented"; hace falta el peldaño de la versión intermedia (2.3.10) primero.
- **Incidente real derivado (jul 2026):** ni el stage `Deploy_Mirrors` ni el job `Mirror_OCI1`
  verificaban `succeeded('Build_Backend')`/`succeeded('Mirror_Oracle')` — `dependsOn` en Azure
  DevOps solo define orden, no éxito. Con `Build_Backend` (cross-compile) fallado, `Mirror_OCI1`
  igual corrió y redesplegó SurrealDB a la imagen v3.2.3 (ya actualizada en el repo) contra datos
  todavía en formato 1.5.5 (restaurados manualmente minutos antes) — el contenedor no pudo arrancar
  y **corrompió parcialmente el storage RocksDB** al intentarlo ("Corrupt or unsupported
  format_version: 7"). Se recuperó desde una copia intacta guardada minutos antes, sin pérdida de
  datos, pero fue un corte real. Arreglado agregando `succeeded(...)` explícito a las condiciones
  de `Deploy_Mirrors`, `Mirror_OCI1` y `Mirror_AWS` en `azure-pipelines.yml`.
- **Solución:** migrar la base de datos a la versión final ANTES de disparar el pipeline (manual,
  fuera del flujo automático), de forma que cuando `Mirror_Oracle` despliegue el backend nuevo la
  DB ya esté en la versión correcta y `Mirror_OCI1` solo reinicie el contenedor sobre datos ya
  migrados. Procedimiento completo de migración de datos (peldaño de versión intermedia, export,
  import, verificación de conteos): [`ARQUITECTURA_ORACLE_DB.md` §15](../docs/infrastructure/ARQUITECTURA_ORACLE_DB.md).
- **Otras trampas del mismo upgrade** (documentadas en `backend/CLAUDE.md` y `ARQUITECTURA_ORACLE_DB.md`):
  `UPDATE` ya no crea el registro si no existe (usar `UPSERT`); `SELECT`/`UPDATE` sobre una tabla
  nunca escrita ahora es error `NotFound`, no vacío; headers HTTP del endpoint `/sql` cambiaron de
  `NS`/`DB` a `Surreal-NS`/`Surreal-DB`; el SDK Rust reemplazó serde por el trait `SurrealValue`
  (puente `SerdeWrapper` para tipos de dominio en `core`, que no puede depender de `surrealdb`).
- **Trampa adicional descubierta tras el deploy — asimetría de `SerdeWrapper` en fechas:**
  `SerdeWrapper<T>` sobre una struct COMPLETA (no un `chrono::DateTime<Utc>` desnudo) serializa sus
  campos de fecha como **string** (puente serde genérico vía un `Serializer`/`Deserializer` propio
  del SDK) — pero un **bind individual** de `chrono::DateTime<Utc>`, o un campo dentro de una struct
  con `#[derive(SurrealValue)]` **directo** (sin `SerdeWrapper`), produce/espera un **datetime
  nativo**. Si la misma fila se escribe por un camino y se lee por el otro, la deserialización
  revienta ("invalid type: datetime, expected an RFC 3339 formatted date and time string" o al
  revés "Expected datetime, got string"). Rompió en caliente `demo_feedback.created_at` justo
  después del deploy (arreglado con un `UPDATE ... SET created_at = <string> created_at` puntual) y
  se encontró latente en `get_srs_review_candidates` (SRS, vivo en producción), `subscription_repository.rs`
  y `pronoun_repository.rs::update_progress` (ninguno de los dos últimos vivo en el build de
  producción hoy — features `subscriptions`/`pronoun_practice` no están en `default` de
  `api_main/Cargo.toml`, y `pronoun_practice` ni siquiera compila en la rama `dev-flashcards`).
  **Solución consistente**: cuando una fila mezcla escrituras nativas (binds individuales o structs
  `#[derive(SurrealValue)]` directas) con lecturas de un tipo de dominio en `core`, usar un struct
  local en el archivo del repositorio con `#[derive(SurrealValue)]` directo + `From<...>` (mismo
  patrón que `models.rs` para `SurrealUser`) — nunca `SerdeWrapper` sobre la struct de dominio
  completa. `SerdeWrapper` solo es seguro cuando TANTO la escritura COMO la lectura de esa fila
  pasan por el mismo `SerdeWrapper<MismoTipo>` (caso `demo_feedback` en régimen normal, una vez
  arreglado el dato viejo).

---

## ⚙️ Errores de Aplicación

### 3. Regeneración Infinita de Imágenes (Flashcards)
- **Fecha:** 2026-04-29
- **Error:** El sistema regeneraba imágenes de verbos irregulares en cada carga.
- **Causa:** El `imagePath` no estaba normalizado para las formas `past/participle`, causando un mismatch con el nombre en GCS.
- **Solución:** Normalizar el slug del asset antes de verificar su existencia en el repositorio de datos.

### 4. Estilos `composes` desincronizados en dev (Vite HMR) — falso bug visual
- **Fecha:** 2026-07-17
- **Error:** Tras editar `Flashcard.module.css`, los botones que otros módulos toman por `composes` (p.ej. `rotateVoiceBtn` en `DefinitionList.module.css`/`ConjugationTable.module.css`) mantenían estilos viejos (color/trazo) en el dev server y en las capturas del arnés, aunque el CSS fuente era correcto. El elemento mostraba DOS hashes distintos del mismo archivo (p.ej. `_rotateVoiceBtn_1fl7l_381` viejo + `_rotateVoiceBtn_1ap0x_383` nuevo).
- **Causa:** El HMR de Vite no re-transforma a los consumidores de `composes` cuando cambia el archivo compuesto: la cadena queda apuntando al hash de la versión anterior, cuyas reglas con ámbito ya no matchean el DOM nuevo. **Solo ocurre en dev**; un build de producción compila todo consistente.
- **Solución:** `touch` (o edición trivial) de los `.module.css` que componen desde el archivo editado para forzar su re-transform, y re-verificar. Diagnóstico rápido: en DevTools/Playwright, mirar `className` del elemento — si aparecen dos hashes distintos para la misma clase lógica, es este bug, no el CSS. No "arreglar" el CSS a ciegas: verificar primero con `getComputedStyle` tras sincronizar.

### 5. `imagePath` roto en masa: esquema viejo de rutas no migrado (`es_en`, `es_de`, `en_es`)
- **Fecha:** 2026-07-25
- **Error:** En `en_es`, 2410 de 2462 `imagePath` no vacíos (98%) apuntaban a archivos inexistentes, usando un esquema plano viejo (`/card_images/<cat>/<nivel>/<nivel>_card_N_defM.avif`) en vez del esquema actual por mazo (`/card_images/<cat>/<nivel>/<mazo>/<nivel>_<mazo>_card_N_defM.avif`). Al investigar la causa raíz se encontró que **`es_en` mismo** (la fuente maestra) también tenía 168 rutas rotas con el mismo patrón, concentradas en `pronouns` (105/173) y `phrasal_verbs` (63/285) — los archivos base (`*.json` sin `_e_`) se quedaron con la ruta vieja mientras sus equivalentes fusionados (`*_e_*.json`) sí se migraron. Como `es_de` copia `imagePath` tal cual desde `es_en` (ver `docs/modules/flashcards.md`), heredó exactamente las mismas 258 rutas rotas.
- **Causa:** Una migración de imágenes a subcarpetas por mazo no se aplicó de forma completa: los mazos "merge" (`*_e_*.json`) sí quedaron apuntando a la ruta nueva, pero los mazos base no, y `en_es` (generado antes de esa migración) nunca se actualizó en absoluto.
- **Solución:** Arreglo en cascada, nunca por índice sino cruzando por contenido (mismo patrón que `docs/EN_ES_CONTENT_AUDIT.md`, que ya había auditado texto pero explícitamente no tocó imágenes):
  1. `es_en` primero (la fuente): para cada ruta rota, buscar dentro del propio `es_en` otra copia de la misma tarjeta/definición (mismo `category`+`nivel`+`name`+`usage_context_en` o mismo índice de definición) que sí tenga imagen válida, y usar esa ruta. Si ninguna copia en todo `es_en` tenía imagen válida (nunca se generó para esa palabra), limpiar a `""` — nunca inventar una ruta.
  2. `es_de`: como es 1:1 posicional con `es_en` (mismo archivo, mismo índice de card/definición — verificado antes de aplicar), copiar directamente el `imagePath` ya corregido de `es_en` por posición.
  3. `en_es`: NO es 1:1 posicional con `es_en` (árbol de archivos distinto en ~13 mazos, y el propio `EN_ES_CONTENT_AUDIT.md` señala que el cruce debe ser "por contenido, nunca por índice"). Cruce por `usage_context_en` exacto dentro del mismo archivo relativo primero, luego misma categoría+nivel en cualquier archivo (prefiriendo el archivo base sobre el merge si hay ambigüedad), luego por `meaning`(en_es) == `name`(es_en) como último recurso. Lo no resuelto (~175 de 2410, típicamente conceptos gramaticales sin imagen posible como "myself"/"each other", o palabras eliminadas de `es_en` como "plutonium"/"victory"/"worry") se limpió a `""`.
  - Verificación en cada paso: JSON válido + conteo de rutas rotas en 0 (excluyendo vacíos intencionales) antes de pasar a la siguiente dirección.
- **Lección**: cuando un idioma se construye copiando/derivando de otro (`es_de` ← `es_en`, o en general cualquier dirección nueva), **el idioma fuente debe verificarse limpio primero** — un bug ahí se propaga silenciosamente a todo lo que se derive de él. Y una migración de esquema de rutas (imágenes, audio, lo que sea) no está completa hasta que se verifica con un script, no revisando archivos al azar: acá el 61% de `pronouns` y 22% de `phrasal_verbs` llevaban meses rotos sin que nadie lo notara porque el resto de categorías (90%+ del contenido) sí funcionaba.

### 6. Se paga en LemonSqueezy pero el usuario nunca pasa a premium (webhook apuntando a un túnel muerto)
- **Fecha:** 2026-08-03
- **Error:** Pagos reales (test mode) completados en LemonSqueezy — 9 suscripciones `active` para la misma cuenta — y la tabla `subscription` de SurrealDB **vacía**: el rol seguía en `viewer` y la pantalla de éxito del checkout se quedaba esperando.
- **Causa:** El webhook configurado en LemonSqueezy apuntaba a una URL de **quick-tunnel efímero de cloudflared** (`https://<palabras-al-azar>.trycloudflare.com/api/webhooks/lemonsqueezy`) que ya no existía; el túnel vigente de esta máquina es el nombrado (`launch.lat` → `localhost:8081`, ver `/etc/cloudflared/config.yml`). LemonSqueezy entregaba a la nada. El código del backend estaba bien: `variant_id`, firma y secreto coincidían.
- **Cómo diagnosticarlo rápido (sin adivinar):**
  1. `SELECT * FROM subscription` en SurrealDB — si está vacía, el webhook no llegó (o fue rechazado).
  2. `GET https://api.lemonsqueezy.com/v1/subscriptions` con `LEMON_SQUEEZY_API_KEY` — confirma si el cobro existe de verdad (y con qué email/variant).
  3. `GET https://api.lemonsqueezy.com/v1/webhooks` — **acá salta el fallo**: la URL registrada vs el túnel realmente activo.
- **Solución:** apuntar el webhook a la URL viva (`https://launch.lat/api/webhooks/lemonsqueezy` en local con el túnel nombrado; `https://fluency.lat/...` en prod) y **reenviar el evento perdido**: firmar el payload con `LEMON_SQUEEZY_WEBHOOK_SECRET` (HMAC-SHA256 hex en `X-Signature`) y hacer POST al backend — el handler es idempotente (`UPSERT`), así que reenviar es seguro.
- **Lección:** un quick-tunnel (`trycloudflare.com`) cambia de URL en cada arranque; nunca registrarlo como webhook permanente. Si el checkout "no activa", el orden de sospecha es **entrega del webhook → email de la cuenta → variant_id → código**, no al revés.

### 7. Premium optimista post-pago sobrevivía a logout y se heredaba entre cuentas (hueco de seguridad)
- **Fecha:** 2026-08-04
- **Error:** Tras el fix del incidente #6 (premium optimista mientras confirma el webhook), un usuario reportó que reautenticándose (dev-guest u otra cuenta) el navegador seguía mostrando "premium" — y que tras reiniciar el backend/DB en dev (subscription borrada) el estado no era consistente. Root cause distinto del #6: `pendingPremiumStorage.js` guardaba la marca en una clave de `localStorage` **sin dueño** (solo un timestamp) y `AuthContext.logout()` nunca la borraba. Sobrevivía a cerrar sesión y la heredaba la SIGUIENTE cuenta que iniciara sesión en ese navegador (incluido `dev-guest`), mostrando premium sin haber pagado.
- **Causa:** El diseño original solo contempló "¿cuánto dura el optimismo?" (ventana de tiempo) y no "¿de quién es esta marca?" ni "¿qué pasa si la sesión termina?". Faltaba el email como parte de la clave, y `logout()` limpia `auth_token`/`auth_user` pero no barre otras claves de `localStorage` relacionadas con la sesión.
- **Solución:** `pendingPremiumStorage.js` ahora guarda `{email, until}` (JSON) y `isPendingPremiumActive(email)` exige que coincida con la cuenta actual; `AuthContext.logout()` y el logout forzado por 401 de `httpClient.js` la borran explícitamente; ventana acortada de 15 min a 2 min (un webhook normal llega en segundos, "momentáneo" era la intención original, no 15 min). Tests de regresión en `context/AuthContext.test.jsx` (logout revierte el rol, no se hereda entre cuentas, una marca huérfana de otro email se ignora, se restaura correctamente tras un reload de la MISMA cuenta).
- **Lección:** cualquier estado optimista de UI que otorgue un privilegio (aunque sea "solo visual", con el backend como autoridad real) necesita, desde el diseño: (1) atarse a la identidad de la sesión, nunca ser global: (2) una vía explícita de invalidación en CADA camino de fin de sesión, incluidos los implícitos (401 forzado), no solo el logout feliz. Pensar "¿qué pasa si otra cuenta entra después en este mismo navegador?" antes de escribir a `localStorage` sin espacio de nombres por usuario.

### 8. `mv` sobre un Caddyfile con bind mount de un solo archivo: el contenedor sigue sirviendo el default de fábrica sin ningún error
- **Fecha:** 2026-08-04
- **Error:** Se reemplazó `/mnt/sda/Caddyfile` (host, GCP) con `mv nuevo.Caddyfile Caddyfile` para agregar política de caché (`Cache-Control`). `caddy validate` y `caddy reload` corrieron sin errores, pero los headers nuevos nunca aparecían en las respuestas — ni la política de caché ni siquiera un `header` simple sin matcher.
- **Causa:** Docker bind-monta un archivo individual (`-v /mnt/sda/Caddyfile:/etc/caddy/Caddyfile`) por **inodo**, no por ruta. `mv` reemplaza el inodo en esa ruta del host; el mount del contenedor queda apuntando al inodo viejo (huérfano) o, si el archivo original nunca existía tal cual al crear el contenedor, Docker sirve el `Caddyfile` de fábrica de la imagen `caddy:alpine`. `caddy adapt --config /etc/caddy/Caddyfile` **dentro** del contenedor confirmó esto: mostraba contenido distinto al que existía en el host. `caddy reload`/`validate` no lo detectan porque leen lo que el contenedor ve, que es válido — solo no es el archivo que uno cree estar editando.
- **Diagnóstico que sí lo encontró:** comparar `cat` del archivo en el host vs `docker exec <contenedor> cat` de la misma ruta montada — divergían.
- **Solución:** reemplazar el CONTENIDO del archivo montado en el mismo inodo (`cat nuevo > Caddyfile`, nunca `mv`), o si ya se hizo `mv`, un `docker restart <contenedor>` (no hace falta `recreate`) fuerza a Docker a resolver el mount de nuevo contra la ruta actual.
- **Lección:** para cualquier bind mount de UN SOLO ARCHIVO (no directorio) en Docker, escribir siempre sobre el mismo inodo (`cat >`, editores que truncan+escriben in-place) — nunca `mv`/`rename` el reemplazo. Si algo se edita así por error, `restart` del contenedor es la forma barata de recuperarse sin perder volúmenes de datos (certificados TLS en este caso, preservados en mounts de directorio separados).

### 9. Login roto en producción cada vez que el overflow desvía a Cloud Run: `SURREAL_URL` sin el sufijo `/rpc`
- **Fecha:** 2026-08-04
- **Error:** `"Autenticación no disponible: DB no configurada en este entorno"` (el mensaje exacto de
  `null_db_repository.rs`) al intentar loguearse, justo después de activar la válvula de overflow
  a Cloud Run (`X-Backend: CloudRun-Overflow` en la respuesta confirmaba que el tráfico estaba
  yendo por ahí).
- **Diagnóstico engañoso (casi 2 horas perdidas):** se sospechó primero de `encode gzip zstd`
  rompiendo el *upgrade* de WebSocket del passthrough `/db/*` en Caddy (hipótesis razonable: gzip
  necesita "hijackear" la conexión, incompatible con WS) — se probó excluyendo `/db/*` de `encode`
  con un matcher y **no cambió nada**. Se probó sacando `encode` del Caddyfile por completo — **la
  falla seguía igual**. La pista real llegó al notar que un `curl` con el upgrade de WebSocket daba
  `400` **por defecto** (curl negocia HTTP/2 por ALPN sobre TLS y el mecanismo clásico
  `Connection: Upgrade` no aplica a HTTP/2) pero `101` al forzar `--http1.1` — es decir, la ruta
  `/db/*` de Caddy **nunca estuvo rota**; el método de prueba (`curl` sin forzar HTTP/1.1) era el
  que daba una lectura equivocada.
- **Causa real:** el cliente de SurrealDB (SDK Rust y el CLI oficial `surreal sql`) **no agrega
  `/rpc` automáticamente** a la URL base — hay que incluirlo explícito. `SURREAL_URL` de Cloud Run y
  del mirror de AWS estaba en `wss://fluency.lat/db` (sin `/rpc`); tras pasar por
  `uri strip_prefix /db` de Caddy, la conexión llegaba a la raíz `/` de SurrealDB, que no maneja el
  *upgrade* de WebSocket y respondía con un `200 OK` normal en vez de `101` — el cliente interpreta
  eso como `WebSocket error: HTTP error: 200 OK` y el backend degrada a `NullDbRepository`.
  Verificado con el CLI oficial: `-e "wss://fluency.lat/db"` → falla con ese error exacto;
  `-e "wss://fluency.lat/db/rpc"` → conecta y hace `signin` sin problema.
- **Solución:** `SURREAL_URL=wss://fluency.lat/db/rpc` en Cloud Run (`gcloud run services update
  --update-env-vars`) y en `azure-pipelines.yml` (stage `Deploy_GCP` y job `Mirror_AWS`) — dos
  lugares, ambos con el mismo valor incompleto.
- **Lección:** cuando una hipótesis "suena razonable" (compresión + WebSocket es un problema
  clásico y documentado en otros proxies) pero la corrección no cambia el síntoma, **descartarla
  activamente en vez de seguir ajustándola** — sacar la variable por completo (aquí, borrar
  `encode` entero) para confirmar antes de invertir más tiempo en esa dirección. Además: al probar
  un *upgrade* de WebSocket con `curl` sobre HTTPS, forzar `--http1.1` explícitamente — de lo
  contrario ALPN puede negociar HTTP/2 y dar una falla que no tiene nada que ver con el servidor
  real.

### 10. "El fix del login no se ve" — no era el mismo bug: `JWT_SECRET`/`SUPER_ADMIN_EMAIL` distintos entre el backend local de GCP y Cloud Run
- **Fecha:** 2026-08-04 (mismo día que el incidente #9, tras el fix de `/rpc`)
- **Error:** el usuario reportó que tras el fix de `/rpc` "no veo el cambio" en el login de
  producción. La sospecha inicial obvia era "el deploy no ha llegado a producción" — pero el
  fix de `/rpc` YA estaba verificado en vivo (curl directo a Cloud Run devolvía `InvalidToken`
  401, no el error de "DB no configurada").
- **Causa real (bug DISTINTO, no una regresión del #9):** con la válvula de overflow activa, el
  tráfico alterna aleatoriamente (según RAM libre del proxy) entre el backend local de la VM de
  GCP y Cloud Run. Comparando el env completo de ambos contenedores (`docker inspect` local vs
  `gcloud run services describe`) se encontró que **`JWT_SECRET` y `SUPER_ADMIN_EMAIL` no
  coincidían** entre los dos: un JWT firmado por un backend fallaba la verificación de firma en
  el otro, y el email admin reconocido como `SUPER_ADMIN_EMAIL` no era el mismo. El síntoma para
  el usuario es indistinguible de "el fix no se aplicó": sesión que a veces funciona y a veces no,
  dependiendo de qué backend atendió esa request en particular.
- **Diagnóstico:** listar el env COMPLETO de ambos backends lado a lado (no solo las variables
  que uno sospecha relevantes) — `SURREAL_*` estaba bien en ambos, pero nadie había comparado
  `JWT_SECRET`/`SUPER_ADMIN_EMAIL` hasta este punto porque el incidente #9 ya "explicaba" el
  síntoma de login roto.
- **Solución:** `gcloud run services update flashcard-backend --project launch-490115 --region
  us-east1 --update-env-vars="JWT_SECRET=<mismo-valor-que-local>,SUPER_ADMIN_EMAIL=<mismo-valor-que-local>"`.
  Verificado con login de prueba directo a AMBOS backends (`127.0.0.1:8080` en la VM y la URL de
  Cloud Run) devolviendo la misma respuesta (`InvalidToken` 401) tras el fix.
- **Lección:** cuando dos despliegues del mismo backend conviven detrás de un balanceador/overflow
  (aquí: local GCP + Cloud Run), CUALQUIER secreto o config que afecte identidad/sesión (`JWT_SECRET`,
  `SUPER_ADMIN_EMAIL`, y por extensión cualquier futuro secreto de firma) debe verificarse **idéntico
  en ambos** como parte del checklist de deploy — no asumir que arreglar un síntoma de login
  ("DB no configurada") cubre todos los caminos de falla de login. Ante "no veo el cambio" después
  de confirmar que el fix SÍ está desplegado, la siguiente sospecha es drift de config entre
  réplicas del backend, no que el deploy no haya llegado.

### 11. Login roto en Cloud Run/AWS otra vez, ya con `/rpc` puesto: `connect()` conectaba siempre SIN TLS aunque `SURREAL_URL` fuera `wss://`
- **Fecha:** 2026-08-04 (mismo día, tercera vuelta sobre el mismo síntoma)
- **Error:** con el fix del incidente #9 (`/rpc`) y el del #10 (`JWT_SECRET`/`SUPER_ADMIN_EMAIL`)
  ya desplegados y verificados, el usuario reportó login roto en producción **otra vez**, con el
  mismo mensaje exacto: `"Autenticación no disponible: DB no configurada en este entorno"`.
- **Primer verificador engañoso (aprendido del propio #9 pero mal aplicado aquí):** probar
  `/api/auth/google` con un `id_token` inventado y ver `{"detail":"InvalidToken"}` **no prueba
  nada sobre la DB** — `google_login()` valida el token de Google ANTES de tocar el repositorio de
  usuarios (`auth.rs::google_login`, paso 1 de 3); un token inválido nunca llega al código que
  distingue DB real de `NullDbRepository`. Verificación real usada: forjar un JWT de SESIÓN propio
  (no un id_token de Google) firmado con el mismo `JWT_SECRET` que corre en el backend, y pegarle a
  `/api/auth/me` — ese sí ejecuta `user_repo.get_user_by_email(...)` de verdad. Con el email admin
  real, la DB real devuelve sus datos reales (`onboarding_completed`, `picture`, `study_language`
  poblados); `NullDbRepository::get_user_by_email` siempre devuelve `Ok(None)` **sin error**, así
  que la única forma de notar la diferencia es comparando esos campos, no el código HTTP.
- **Causa real:** `Surreal::new::<Ws>(bare_endpoint)` en `connection.rs` (el propio fix del
  incidente original de conexión, 4 ago) le quitaba el esquema a `SURREAL_URL` pero **siempre**
  usaba el tipo `Ws` (motor SIN TLS del SDK) para conectar, sin mirar si el esquema original era
  `ws://` o `wss://`. En el SDK de `surrealdb`, `Ws`/`Wss` son motores de transporte DISTINTOS
  elegidos por el parámetro de TIPO genérico, no inferidos del string (confirmado leyendo el
  propio doc-comment del crate: *"The WS scheme used to connect to `ws://` endpoints"* / *"The WSS
  scheme..."*). Para la conexión interna (`ws://10.128.0.5:8080`, sin TLS, misma VPC) el bug era
  invisible porque nunca hubo TLS de por medio. Pero Cloud Run y el mirror de AWS llegan a la DB
  por `wss://fluency.lat/db/rpc` (público, vía Cloudflare + Caddy) — conectar ahí con `Ws` intenta
  un WebSocket sin TLS, y Cloudflare (con "Always Use HTTPS") responde `308 Permanent Redirect` en
  vez de completar el *upgrade*; los 6 reintentos de arranque fallan igual y el backend queda
  permanentemente en `NullDbRepository` hasta el próximo reinicio del proceso.
- **Cómo se aisló sin adivinar:** se leyeron los logs REALES de arranque (`gcloud logging read`
  sobre la revisión de Cloud Run) — mostraban literalmente `WebSocket error: HTTP error: 308
  Permanent Redirect` en los 6 intentos. Para descartar "problema de red específico de Cloud Run"
  se reprodujo el log **idéntico** en el mirror de AWS (nube y región totalmente distintas, mismo
  binario) — dos entornos de red independientes fallando igual apunta al código, no a la red de un
  proveedor. Un intento de reproducir el `308` con `curl` desde una tercera red no lo logró (dio
  `101` con `--http1.1` o `400` con ALPN por defecto a HTTP/2, nunca `308`) — la pista final fue
  leer el código fuente del propio crate `surrealdb` (vendored en `~/.cargo/registry`) y confirmar
  que `Ws`/`Wss` son tipos con comportamiento de transporte distinto, no solo etiquetas.
- **Solución:** `connect()` ahora detecta `wss://`/`https://` en el string ANTES de pelarlo y llama
  a `Surreal::new::<Wss>(...)` en ese caso, `Surreal::new::<Ws>(...)` en el resto (`ws://`/sin
  esquema) — commit con el detalle en `backend/api_main/src/infrastructure/storage/surreal/connection.rs`.
- **Lección:** (1) al pelar un esquema de una URL para satisfacer una API que lo pide "sin
  esquema", verificar si esa API tiene variantes de tipo/función que dependían de la información
  que se está descartando — acá el fix del incidente de conexión original resolvió el cuelgue pero
  introdujo silenciosamente esta regresión de TLS, invisible mientras solo se probó contra la
  conexión interna sin TLS. (2) Un test con un token/credencial claramente inválido que falla
  temprano en la cadena de validación **no prueba que las capas posteriores (DB) estén sanas** —
  hay que forjar una credencial VÁLIDA (con el secreto real) para ejercer el camino completo. (3)
  reproducir el mismo síntoma en dos infraestructuras independientes (Cloud Run + AWS) antes de
  invertir tiempo en teorías de red específicas de un proveedor (IPv6, ASN, etc.) — si falla igual
  en ambas, el código es sospechoso antes que la red.

### 12. Catálogo de categorías se queda abierto para siempre al cerrar la guía de onboarding (primer login)
- **Fecha:** 2026-08-04
- **Reporte del usuario:** "cuando me logeo por primera vez, abro las categorías, selecciono la
  categoría, hace como que cierra pero se queda abierta" — solo pasaba la primera vez que se
  logueaba (el tour de onboarding, `FlashcardOnboardingTour.jsx`, solo corre entonces).
- **Cómo se aisló:** no se pudo adivinar leyendo código a solas — varios de los caminos de cierre
  del catálogo (`handleVerbDeckClick`, `changeGroup` vía `setSelectedGroup`, el `handleTap` del tour
  en el paso `elegir-subtema`) se auditaron y funcionaban bien. Se levantó el entorno local
  (`./start.sh`), se emitió un JWT vía `POST /api/auth/dev-guest` y se reprodujo con Playwright
  (`channel='chrome'`) el flujo completo: wizard de onboarding → tour interactivo → abrir catálogo
  → elegir categoría → elegir mazo. Ese camino cerraba bien. El bug apareció al reproducir que un
  usuario real, en cualquiera de los pasos donde el tour fuerza el catálogo abierto
  (`elegir-categoria`, `catalogo-nivel`, `elegir-subtema`, todos con `prep.catalog: true` en
  `onboardingNavigationPlan.js`), toca el botón "X" para cerrar la guía en vez de completar el paso.
- **Causa:** `handleClose`/`handleFinish` en `FlashcardOnboardingTour.jsx` solo hacían
  `setIsDismissed(true)` (oculta el tooltip de la guía) — nunca tocaban `isCatalogVisible`. El
  único lugar que cierra el catálogo al terminar la guía es el `useEffect` de `prep` (línea ~349),
  que solo corre cuando `activeStep` pasa a `null` (paso final natural) — cerrar a mitad de guía deja
  `activeStep` con su valor de ese paso, ese efecto no vuelve a correr, y `isCatalogVisible` queda
  atascado en `true` sin nada que lo apague.
- **Solución:** `handleClose` ahora también hace `setIsCatalogVisible(false)`, `setIsSidebarOpen(false)`
  y `setIsFloatingMenuOpen(false)` al mismo tiempo que `setIsDismissed(true)` — mismo cierre que ya
  hacía el efecto de `prep` para el paso final, replicado para la salida manual.
- **Verificación:** script Playwright reprodujo `catalog_open=True` tras cerrar la guía ANTES del
  fix y `catalog_open=False` después, en el mismo paso (`elegir-categoria`, catálogo forzado
  abierto por el tour). `npx eslint` (0 avisos) y `npm test` (todos los `test:*` + Vitest) en verde.
- **Lección:** cualquier acción que "salga" de un flujo guiado que fuerza estados de UI abiertos
  (`prep.catalog`/`sidebar`/`floatingMenu` aquí) debe limpiar esos mismos estados al salir — no basta
  con que el camino de finalización NATURAL (última pantalla) lo haga; las salidas anticipadas (botón
  X, Escape, navegación) son un segundo camino de salida que necesita el mismo cleanup.
- **SEGUNDA CAUSA RAÍZ (la principal, encontrada después):** el fix de arriba era real pero no era
  el camino que el usuario recorría. El reporte persistió y al reproducir el flujo EXACTO
  (dashboard → menú flotante "Categorías" → elegir categoría → elegir mazo) el catálogo cerraba y
  **se reabría solo**. Causa: el efecto de `FlashcardPage.jsx` (~línea 248) que consume
  `location.state.openCatalog` "limpiaba" el state con `window.history.replaceState({}, '', ...)`,
  que borra la entrada del historial del navegador pero **NO** el `location.state` en memoria de
  React Router. Eso era inofensivo mientras el efecto solo dependía de `location.state`/`pathname`
  (corría 1 vez por navegación), pero el commit `72bb031` (2 ago 2026) le agregó
  `currentCategory`/`currentDeckName` como dependencias (para `markDeckFinished`) — desde entonces
  cada selección de categoría o mazo re-ejecutaba el efecto con el state viejo aún truthy y
  `setIsCatalogVisible(true)` reabría el catálogo recién cerrado. Solo se manifestaba entrando vía
  menú "Categorías"/PWA nav **desde fuera de `/flashcard`** (único camino que navega con state);
  con el uiBridge (ya estando en `/flashcard`) no había state y todo cerraba bien — por eso la
  primera reproducción no lo atrapó. **Solución:** consumir el state vía el router
  (`navigate({ pathname, search }, { replace: true })`) — anula `location.state` de verdad; el
  efecto re-corre una vez con `state=null` y sale por el early-return. Se preserva `location.search`
  para no matar `?onboarding_tour=` si estuviera activo.
- **Lección (2):** `window.history.replaceState` NO limpia el `location.state` de React Router — para
  consumir un state de navegación de una sola vez, usar `navigate(..., { replace: true })`. Y al
  agregar dependencias a un efecto existente, revisar si el efecto asumía correr "una sola vez por
  navegación": las nuevas deps pueden resucitar un state ya consumido.
- **Lección (3):** reproducir con el CAMINO DE ENTRADA exacto del usuario, no uno equivalente: el
  mismo botón "Categorías" se comporta distinto según la ruta de partida (uiBridge vs navigate con
  state), y el primer repro usó el camino que no fallaba.
- **Prevención permanente (mismo día):** se creó la suite E2E de navegación total
  `client/e2e/first-login-and-full-navigation.spec.js` + el comando único
  `./scripts/test-site-e2e.sh` (levanta el stack si hace falta y corre toda la suite Playwright en
  3 navegadores). Cubre como regresión explícita las DOS causas de este incidente, y además: primer
  login completo (wizard + tour hasta la primera lección), walkthrough de todas las rutas/menús/
  categorías/niveles/controles, roles `admin`/`premium`/`user` (rol efectivo forzado reescribiendo
  `/api/auth/me`), y generación de imagen+voz con los servicios de producción emulados (contrato
  real de `generate-image`/`synthesize-speech`/`delete-audio` sobre assets locales — el flujo de UI
  es motor del prompt → confirmación). Cualquier error de consola/página/API fuera del allowlist
  comentado rompe el test. Correr SIEMPRE antes de promover a producción.

### 13. Pipeline colgado para siempre tras el archivado de Oracle: un job vivo apuntaba a un host muerto y bloqueaba TODA la cola
- **Fecha:** 2026-08-05 (día siguiente al archivado de Oracle, 4 ago)
- **Síntoma:** varios pushes/merges a `main`/`qa` en el mismo día (5 PRs de sync entre ramas)
  quedaron en Azure Pipelines como `inProgress`/`notStarted` durante 20+ minutos sin avanzar —
  `fluency.lat` seguía sirviendo el bundle viejo mucho después de lo que tarda un deploy normal
  (~25-30 min). Reportado por el usuario: "porque no avanza el pipelien lleva rato alli".
- **Cómo se aisló:** `az pipelines runs list` mostró los runs `inProgress` con `startTime` de hace
  17+ minutos (vs. ~7 min del último run exitoso). `az devops invoke --resource timeline` sobre
  esos builds mostró el job "🚀 3. Deploy Front → Oracle Caddy" con su primer paso (`Checkout`)
  todavía `inProgress`. Como este repo también hospeda los agentes self-hosted de Azure Pipelines
  (`systemctl list-units | grep vsts.agent` → pools `Default` y `LocalBuild`, ambos corriendo en
  esta misma máquina), se pudo leer el log del worker en vivo
  (`/opt/azp-agent/_diag/Worker_*.log`) y ver el proceso real: `git fetch --depth=1 origin
  <sha>` seguido de `git index-pack` activamente transfiriendo datos (no colgado en el sentido
  literal, solo anormalmente lento — pero el verdadero bloqueo estaba un paso después). El pool
  `Default` mostró un único agente online (`jcoronado-ubuntu-22`) — el pipeline procesa un build
  a la vez en ese pool, así que un job atascado bloquea la cola completa para los builds
  siguientes.
- **Causa real:** al archivar Oracle el 4 ago (`tools/oracle-legacy/README.md`), se deshabilitaron
  con `condition: false` los jobs `Mirror_Oracle`/`Mirror_OCI1` (stage `Deploy_Mirrors`, más
  adelante en el pipeline) — pero se **olvidó** el job `DeployFront` (stage `Deploy_Frontend`,
  "🚀 3. Deploy Front → Oracle Caddy", MUCHO antes en el pipeline), que sigue usando
  `$(sshConn)=SrvPortfolio` → la IP muerta de Oracle para subir el SPA vía `CopyFilesOverSSH`/`SSH`.
  Cada build nuevo llegaba a ese job, se quedaba esperando una conexión SSH a un host apagado, y
  nunca terminaba — bloqueando el único agente del pool `Default` para todo lo que viniera detrás
  en la cola (de ahí el "lleva rato allí" con 5 builds acumulados de los merges de sincronización
  de ramas del mismo día).
- **Solución:** `condition: false` en el job `DeployFront` (mismo patrón que `Mirror_Oracle`).
  Como `Deploy_Mirrors` exigía `succeeded('Deploy_Frontend')` (no aceptaba `Skipped`), se cambió a
  `in(dependencies.Deploy_Frontend.result, 'Succeeded', 'Skipped')` — si no, deshabilitar
  `Deploy_Frontend` habría bloqueado también `Mirror_AWS`, el único mirror que sigue activo.
  `Deploy_GCP` (el deploy real del backend) no necesitó cambios: su `condition:` nunca referenciaba
  a `Deploy_Frontend`, solo lo tenía en `dependsOn` (orden, no gate) — confirmado leyendo
  la semántica real de Azure Pipelines: un `condition:` explícito REEMPLAZA el `succeeded()`
  implícito de todas las dependencias; solo bloquea por las que menciona explícitamente.
  Los 5 runs colgados/en cola se cancelaron (`az devops invoke --http-method PATCH ...
  {"status":"cancelling"}`) y se borraron con `./scripts/cleanup-ado-builds.sh` una vez
  `completed/canceled`.
- **Consecuencia abierta (no resuelta en este fix):** con `DeployFront` deshabilitado, el frontend
  SPA no se despliega a ningún lado vía pipeline — no existe todavía un service connection SSH
  hacia el proxy real (GCP, `10.128.0.5`, ver `docs/infrastructure/server_inventory.md` §GCP).
  Documentado como pendiente en `tools/oracle-legacy/README.md`.
- **Lección:** al desconectar infraestructura vieja, buscar TODAS las referencias por variable/host
  (`grep sshConn`/`grep <IP vieja>`), no solo el stage "obvio" (`Deploy_Mirrors` tenía el nombre
  "Mirror" en el nombre y fue lo primero que se tocó; `Deploy_Frontend` no tiene "Oracle" en el
  nombre del stage aunque sí en el `displayName`, y quedó fuera del barrido). Un job colgado en un
  pool de un solo agente self-hosted no falla con un error visible — bloquea silenciosamente TODO
  lo que venga después en la cola, y el único síntoma visible es "no avanza", sin logs de error en
  ningún lado obvio hasta que se lee el timeline/worker log del build específico.

### 14. `is_production` daba `true` en local: admin/premium generaban imagen por Gemini directo también en dev, saltándose Ollama+ComfyUI y el diálogo Gemini/Local del frontend
- **Fecha:** 2026-08-05
- **Síntoma:** reportado por el usuario — al generar una imagen (y creía que también el audio,
  que en realidad siempre fue Gemini por diseño) el resultado salía por Gemini incluso probando
  en local, y el diálogo admin "¿Gemini o Local?" (`Flashcard.jsx::handleRegenerateImage`) parecía
  no tener efecto.
- **Causa real:** `backend/api_main/src/config.rs::Settings::from_env` calcula `is_production`
  con `|| surreal_ns == "flashcard"` (agregado en el commit `6ac6499`, "detección ultra robusta").
  Pero `"flashcard"` es el namespace **por defecto**, compartido por local Y producción
  (`backend/CLAUDE.md` §Persistencia — solo QA usa `qa_flashcard` para diferenciarse). El
  `backend/.env` local real tiene `SURREAL_URL=127.0.0.1:8001` + `SURREAL_NS=flashcard`, así que
  esa sola cláusula daba `is_production=true` en dev. Ese flag alimenta
  `image_use_cases.rs::get_or_generate_image` → `use_direct_gemini_prod = is_production &&
  (role=="premium"||is_admin) && !is_demo`, que cuando es `true` usa `req.prompt` crudo contra
  `gemini-3.1-flash-lite-image` y NUNCA consulta el `promptEngine` que manda el frontend — el
  pipeline local (Ollama refina el prompt, ComfyUI/Flux2 renderiza) quedaba código muerto en la
  práctica, porque solo admin/premium pueden generar imágenes y ambos roles siempre caían en el
  atajo directo, tanto en prod como en local.
- **Cómo se aisló:** se leyó `git log -p` sobre `config.rs` para ver quién introdujo la cláusula
  y por qué (commit `6ac6499`, un commit después de `f4f5b03` que agregó el atajo de Gemini
  directo para prod). Se replicó la fórmula exacta en Python contra los valores reales de
  `backend/.env` → confirmó `is_production=True` en dev. `grep -rn "is_production"` acotó el
  blast radius a solo 2 usos reales (`config.rs` línea 90 para `flashcard_prompt_engine`, y
  `image_use_cases.rs` línea 568) — bajo riesgo para tocar la heurística.
- **Solución:** la cláusula del namespace ahora exige que `SURREAL_URL` NO sea localhost/127.0.0.1
  para contar (`compute_is_production()` en `config.rs`, extraída a función pura + 5 tests
  unitarios cubriendo local real, prod GCP, y QA compartiendo el host remoto de prod). Producción
  y QA (comparten SurrealDB remota, se diferencian solo por namespace) siguen detectándose bien;
  local deja de dar falso positivo. Al hacerlo se destapó bit-rot preexistente y no relacionado:
  3 helpers `#[cfg(test)]` (`gemini_tts_provider.rs`, `routing_tts_provider.rs`,
  `lemonsqueezy_provider.rs`) construían `Settings { ... }` a mano sin el campo `is_production`
  desde que se agregó en `f4f5b03` — `cargo test` llevaba tiempo sin poder compilar porque nadie
  lo corría (solo `cargo check`, que no compila `#[cfg(test)]`). Se completaron con
  `is_production: false`.
- **Lección:** una heurística de "producción" basada en valores que ambos entornos comparten por
  defecto (namespace, nombre de DB) es una trampa — cualquier condición nueva debe probarse
  explícitamente contra los valores reales de `backend/.env` local, no solo razonarse en
  abstracto. Y `cargo check` no sustituye a `cargo test`: un campo de struct puede faltar en un
  literal `#[cfg(test)]` durante meses sin que ningún gate de CI lo note si el gate no compila
  tests.

### 15. Generar imagen en producción daba 403 `API_KEY_SERVICE_BLOCKED`: no toda clave de Gemini sirve para la Interactions API
- **Fecha:** 2026-08-05
- **Síntoma:** reportado por el usuario al probar producción —
  `[trace=…] image model: Gemini image API 403 Forbidden: … "reason": "API_KEY_SERVICE_BLOCKED",
  "service": "generativelanguage.googleapis.com"`, método
  `InteractionsService.CreateInteractionHttp`. La generación de imagen quedaba muerta para
  premium/admin en prod (que es justo donde se usa el atajo directo a Gemini, ver
  `docs/modules/media-generation.md` §Imágenes paso 0).
- **Causa real:** `GeminiInteractionsImageProvider` usaba **solo** `settings.gemini_api_key`
  (`GEMINI_API_KEY`), que en este proyecto es la clave de **Agent Platform** (`launch-490115`,
  crédito promocional). Esa clave **no tiene habilitado** el endpoint
  `generativelanguage.googleapis.com/v1beta/interactions`. No es cuestión de cuota ni de modelo:
  es el control de acceso del servicio por clave.
- **Cómo se aisló:** mandando el MISMO request a `/v1beta/interactions` con cada clave del
  proyecto y comparando el error. Truco útil: con un body vacío (`-d '{}'`) se distingue
  "clave bloqueada" de "clave válida" sin gastar una generación —
  `403 API_KEY_SERVICE_BLOCKED` = bloqueada; `400 "Provide a 'agent', or 'model' parameter"` =
  la clave pasó el control de acceso y solo faltaba el cuerpo. Resultado: `GEMINI_API_KEY` → 403;
  `GEMINI_TTS_API_KEY` y `GEMINI_TTS_API_KEY_BACKUP` (ambas de Google AI Studio) → 400. Después
  se confirmó con el body real: HTTP 200 y un JPEG de ~667 KB.
- **Solución:** `resolve_api_key` en
  `api_main/src/infrastructure/ai/gemini_interactions_image_provider.rs` con la cadena
  `GEMINI_IMAGE_API_KEY` (dedicada, opcional) → `GEMINI_TTS_API_KEY` (AI Studio, la que hoy tiene
  acceso) → `GEMINI_API_KEY` (último recurso). El nombre `TTS` es legado: identifica el proyecto
  de AI Studio, no el servicio. Producción quedó funcionando sin cambiar ninguna env var, porque
  `GEMINI_TTS_API_KEY` ya estaba en el contenedor. Ojo con el descarte de claves vacías: va **por
  candidato**, no al final de la cadena — filtrarlo al final hace que un
  `GEMINI_IMAGE_API_KEY=` vacío deshabilite el provider en vez de caer al siguiente (bug que tuvo
  la primera versión del fix; hay test de regresión).
- **Lección:** en este proyecto conviven varias claves de Gemini de **proyectos distintos** con
  permisos distintos (ver `SECRETS_MAP.md`), y ya había un precedente documentado del mismo tipo
  ("No usa `GCP_API_KEY` en batch TTS: provoca 403 `API_KEY_SERVICE_BLOCKED`"). Antes de asumir
  que una clave de Gemini sirve para un endpoint nuevo, probarla contra ese endpoint concreto.

### 16. La Interactions API es conversacional: con la frase cruda, "responde" en vez de dibujar
- **Fecha:** 2026-08-05 (destapado justo después de arreglar el 403 de la entrada #15)
- **Síntoma:** `[trace=…] image model: Gemini image: no image block in interaction response`, con
  HTTP 200 del API y fallo en ~1.1 s (demasiado rápido para una generación real).
- **Causa real:** el atajo de producción (`use_direct_gemini_prod`, ver
  `docs/modules/media-generation.md` §Imágenes paso 0) manda `req.prompt` **crudo** — la frase de
  la tarjeta, sin pasar por el refinado de Ollama — y `finalize_prompt` la reenviaba tal cual. El
  endpoint `/v1beta/interactions` es **conversacional**: si el input suena a diálogo, el modelo
  CONTESTA. Con `input="I could help you."` (deck `1-basic/modal_auxiliaries`) devolvió 200 y un
  bloque `text`: *"That's very kind of you to offer! As an AI, I don't need help…"*, sin imagen.
  Afecta a todo un deck: los auxiliares modales son frases conversacionales.
- **Cómo se aisló:** el prompt exacto salió del log de producción
  (`docker logs flashcard-backend-node | grep "Solicitud de imagen"` — loguea email, rol, deck y
  prompt), y se reprodujo mandando ese mismo `input` al endpoint. Clave: comparar el `steps[]` de
  una respuesta buena (`model_output` → `content[0].type=image`) contra la mala
  (`model_output` → `content[0].type=text`).
- **Solución:** envolver la frase en una instrucción explícita de fotografía
  (`"Candid photorealistic DSLR photograph … Depict: {frase} …"`). Verificado: las mismas frases
  que fallaban ("I could help you.", "Can I help you?", "You should have told me.", "We must
  leave now.") devuelven imagen. ⚠️ El landing demo usa **el mismo modelo**
  (`GEMINI_IMAGE_MODEL == "gemini-3.1-flash-lite-image"`), así que discriminar por nombre de
  modelo habría cambiado también sus imágenes, que son visibles en la landing. Se discrimina por
  **intención de construcción**: `for_raw_phrase()` (atajo de prod, envuelve) vs `new()` (demo,
  cuya entrada ya viene refinada y pasa sin tocar). Hay test que fija ambos comportamientos.
- **Lección extra (diagnosticabilidad):** el error original decía solo "no image block", lo que
  hizo indistinguible "el modelo respondió texto" de "cambió el formato de la API" y obligó a
  reproducirlo a mano. Ahora el error cita el texto devuelto o, si no hay, describe la forma de
  la respuesta (`status` + tipos de steps). **Un error de integración que no incluye lo que llegó
  obliga a una reproducción manual; incluirlo lo convierte en diagnóstico de una lectura.**

---

## 📜 Protocolo de Auto-Documentación para IAs
1. **Identificación:** Si pierdes más de 10 minutos en un error o necesitas más de 3 intentos para arreglarlo, es un candidato para la biblioteca.
2. **Registro:** Crear una nueva entrada con: **Error**, **Causa** y **Solución**.
3. **Persistencia:** Realizar un `git commit` específico para actualizar esta biblioteca.

**EL OBJETIVO ES NO TROPEZAR DOS VECES CON LA MISMA PIEDRA.**
