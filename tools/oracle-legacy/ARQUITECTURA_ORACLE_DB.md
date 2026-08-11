# Arquitectura Oracle + SurrealDB (Jul 2026)

> Canónico de IPs/specs/hardware: [`server_inventory.md`](server_inventory.md). Este documento
> solo cubre la arquitectura del split proxy/DB y la operación de SurrealDB. Ante discrepancia
> de datos de máquina, manda el inventario. Última revisión: 2026-07-21 (upgrade SurrealDB 3.2.3).

Documento de referencia para IA y desarrolladores. **Estado aplicado en producción** tras la migración de junio 2026.

---

## 1. Resumen en una frase

| Servidor | Rol |
|----------|-----|
| **Proxy Oracle** (`157.151.199.170`) | Caddy + Rust + assets estáticos (imágenes/audio/json) |
| **OCI-1 Oracle** (`129.158.214.227`) | **Solo SurrealDB** (base de datos de la app) |
| **Azure** (`172.202.197.64`) | **Solo Postgres** (suscripciones/pagos futuros) |

**NO confundir:** OCI-1 **no tiene Postgres**. Postgres está en Azure.

---

## 2. Mapa de servidores

```
Internet (fluency.lat)
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  PROXY — server-reverse-proxy                           │
│  IP pública:  157.151.199.170                           │
│  IP privada:  10.0.1.67                                  │
│  RAM: 968 MB (~527 MB disponibles tras migración)       │
│                                                         │
│  Contenedores ACTIVOS:                                  │
│    • caddy-smart          → :80 / :443                    │
│    • flashcard-backend-node → :8080 (Rust, prod)        │
│                                                         │
│  NO debe correr aquí:                                   │
│    ✗ surrealdb (movido a OCI-1)                         │
│    • qa-flashcard-backend-node → :8081 solo cuando      │
│      una publicación de QA lo despliega (128m)          │
└───────────────────────────┬─────────────────────────────┘
                            │
              Red privada VCN (10.0.1.0/24)
              WebSocket/TCP ~0.1–1 ms
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  OCI-1 — server-oci-1 (antes documentado como          │
│          "server-postgresql" — nombre histórico)        │
│  IP pública:  129.158.214.227                           │
│  IP privada:  10.0.1.138                                │
│  RAM: 968 MB (~436 MB disponibles)                      │
│                                                         │
│  Contenedor ACTIVO:                                       │
│    • surrealdb → :8080 (--network host)                 │
│      Límite memoria: 800 MB                             │
│                                                         │
│  NO debe correr aquí:                                   │
│    ✗ flashcard-backend-node (mirror eliminado)            │
│    ✗ caddy                                                │
│    ✗ postgres (nunca estuvo aquí; está en Azure)        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  AZURE — worker-alpine-native-1                         │
│  IP: 172.202.197.64:5432                                │
│  Postgres — auxiliar/futuro (pagos), NO en uso hoy      │
│  NO tocar para flashcards/progreso (eso es SurrealDB)   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Puertos y variables críticas

### Proxy (157)

| Puerto | Servicio | Notas |
|--------|----------|-------|
| 80/443 | Caddy | SSL, fluency.lat |
| 8080 | Rust prod | `reverse_proxy localhost:8080` en Caddyfile |

**Variables del backend Rust (prod):**
```bash
SURREAL_URL=10.0.1.138:8080    # IP PRIVADA de OCI-1 — NO usar 127.0.0.1
SURREAL_NS=flashcard
SURREAL_DB=flashcard
SURREAL_USER=root
SURREAL_PASS=root
LOCAL_STORAGE_PATH=/data       # montado desde /root/smart-proxy/repository/flashcard
SYNC_TO_ORACLE=false
```

### OCI-1 (129)

| Puerto | Servicio | Notas |
|--------|----------|-------|
| 8080 | SurrealDB | `--bind 0.0.0.0:8080`, `--network host` |

**Puerto 8001:** obsoleto en OCI-1. Se usa **8080** porque la Security List de OCI ya permitía 8080 en la VCN privada (8001 estaba bloqueado).

**Firewall iptables en OCI-1:**
- Acepta `:8080` solo desde `10.0.1.67` (proxy)
- Acepta loopback (`lo`) para health checks locales
- Bloquea el resto del tráfico a `:8080`

---

## 4. Flujo de tráfico de usuario

```
Usuario → fluency.lat
    │
    ├─ /card_images/*, /card_audio/*, /json/*
    │      → Caddy sirve desde disco local del PROXY
    │      → NO pasa por red ni por Rust
    │
    ├─ /api/*
    │      → Caddy → Rust :8080 (mismo proxy)
    │      → Rust → SurrealDB 10.0.1.138:8080 (red privada)
    │      → Rust lee/escribe assets en disco local
    │
    └─ /db/*
           → Caddy → 10.0.1.138:8080
           → Para mirrors externos (AWS, Cloud Run) vía wss://fluency.lat/db
```

---

## 5. Optimización de progreso (batching) — 500 usuarios

### Frontend (`client/src/modules/flashcards/hooks/useDeckSession.js`)

- `markAsLearned` es **optimista**: UI avanza sin esperar red
- Acumula en `pendingBatchRef` (Map en memoria)
- Flush automático cuando:
  - Se acumulan **8 tarjetas** (`BATCH_FLUSH_SIZE = 8`)
  - Cambio de deck o grupo
  - `beforeunload` (fetch con `keepalive: true`)
  - Desmontaje del componente

### Backend

- `POST /api/update-batch` — hasta 50 tarjetas por lote
- `POST /api/update-status` — sigue existiendo (reset de grupo, compatibilidad)

### Archivos clave

| Capa | Archivo |
|------|---------|
| Trait DB | `backend/core/src/ports/db_repository.rs` → `upsert_cards_batch` |
| Surreal impl | `backend/api_main/src/infrastructure/storage/surreal/card_progress_repository.rs` |
| Use case | `backend/mod_flashcards/src/lib.rs` → `update_cards_batch` |
| HTTP | `backend/api_main/src/api/endpoints/decks.rs` → `update_cards_batch` |
| Ruta | `backend/api_main/src/modules/flashcards.rs` → `/api/update-batch` |
| Adapter FE | `client/src/modules/flashcards/adapters/flashcardHttpAdapter.js` → `updateCardsBatch` |

---

## 6. Scripts de deploy — cuál usar dónde

| Script | Dónde ejecutar | Propósito |
|--------|----------------|-----------|
| `infra/proxy/bootstrap-oracle.sh` | **Proxy 157** | Caddy + Rust. **NO despliega SurrealDB** |
| `infra/proxy/deploy-oracle-backend.sh` | **Proxy 157** | Solo backend Rust |
| `infra/proxy/deploy-caddy.sh` | **Proxy 157** | Solo Caddy |
| `infra/proxy/deploy-surrealdb-oci1.sh` | **OCI-1 129** | SurrealDB dedicado (800m, host network) |
| `infra/proxy/oci1-db-tuning.sh` | **OCI-1 129** | BBR + firewall iptables |
| `infra/proxy/deploy-surrealdb.sh` | **Solo dev local** | Legacy, límite 256m, puerto 8001 |

### Configuración SurrealDB en OCI-1 (producción)

```bash
docker run -d \
  --name surrealdb \
  --network host \
  --restart always \
  --memory 800m \
  --memory-swap 800m \
  --log-opt max-size=10m \
  --log-opt max-file=2 \
  -v /root/surreal_data:/data \
  surrealdb/surrealdb:v3.2.3 \
  start --user root --pass root --bind 0.0.0.0:8080 rocksdb:/data/surreal.db
```

**Por qué 800 MB:** servidor dedicado solo a DB + Alpine ligero (~100 MB SO). Antes en proxy tenía 256 MB y colapsaba al 73%.

**Protocolo `rocksdb:` (no `file:`)**: desde SurrealDB 2.x el protocolo `file://` está deprecado a
favor de `rocksdb://` explícito. `file://` seguía funcionando en 1.5.5 pero no en 2.x/3.x.

---

## 7. Azure Pipelines (`azure-pipelines.yml`)

| Stage | Qué hace |
|-------|----------|
| Deploy Oracle (Mirror_Oracle) | Proxy: Caddy + Rust con `SURREAL_URL=10.0.1.138:8080` |
| Mirror_OCI1 | OCI-1: solo `deploy-surrealdb-oci1.sh` (`dependsOn: Mirror_Oracle` — el backend se despliega primero) |
| Mirror_AWS | AWS overflow (sin cambios de DB) |

**Importante:** el job `Mirror_OCI1` usa `$(ociSshConn)` — verificar que el service connection exista en Azure DevOps. Si falla, usar sshpass como fallback manual.

**⚠️ El orden `Mirror_Oracle` → `Mirror_OCI1` NO es seguro para un salto de versión mayor de
SurrealDB** (verificado empíricamente, jul 2026, migración 1.5.5→3.2.3): un cliente Rust más nuevo
no logra completar el handshake WebSocket contra un servidor más viejo (falla por completo,
"Server sent no subprotocol"), y un cliente más viejo contra un servidor más nuevo conecta pero
algunas queries se cuelgan (probado con `/api/demo-feedback`, 10+ s sin responder). Para un upgrade
de versión mayor de SurrealDB: **migrar la base de datos manualmente ANTES de disparar el
pipeline** (ver §14 "Migración de versión mayor"), de forma que cuando el pipeline despliegue el
backend nuevo, la DB ya esté en la versión correspondiente y `Mirror_OCI1` solo reinicie el
contenedor sobre datos ya migrados. El pipeline tal como está solo es seguro para redeploys dentro
de la misma versión mayor.

---

## 8. Caddyfile — rutas DB

```caddyfile
# fluency.lat y qa.fluency.lat
handle /db/* {
    uri strip_prefix /db
    reverse_proxy 10.0.1.138:8080   # NO usar localhost:8001
}
```

---

## 9. Errores comunes que confunden a la IA

| Error | Realidad |
|-------|----------|
| "OCI-1 es el servidor Postgres" | **Falso.** Postgres está en **Azure** `172.202.197.64` |
| "SurrealDB está en el proxy" | **Falso desde jun 2026.** Está en OCI-1 `10.0.1.138:8080` |
| "Usar SURREAL_URL=127.0.0.1:8001 en prod" | **Falso.** Solo válido en dev local |
| "Puerto SurrealDB es 8001 en OCI-1" | **Falso.** Es **8080** (VCN firewall) |
| "Rust corre en OCI-1" | **Falso en prod.** Rust solo en proxy; OCI-1 solo DB |
| "Subir SURREAL_MEMORY_LIMIT a 350m en proxy" | **Obsoleto.** Surreal ya no está en proxy |
| "QA siempre está eliminado" | Estado histórico. El pipeline de la rama `qa` puede desplegar `qa-flashcard-backend-node` en `:8081` con límite `128m`. |

---

## 10. Desarrollo local vs producción

| Entorno | SURREAL_URL | Notas |
|---------|-------------|-------|
| **Producción** | `10.0.1.138:8080` | Solo accesible desde red privada Oracle |
| **Local (`start.sh`)** | `127.0.0.1:8001` | SurrealDB en Docker local, modo `memory` |
| **PC del desarrollador** | No puede usar IP privada `10.0.1.138` | Usar Surreal local o túnel VPN |

**Probar producción:** ir a `https://fluency.lat` — no requiere deploy local.

---

## 11. Sentinel / monitoreo RAM

| Servidor | Monitor | Estado jun 2026 |
|----------|---------|-----------------|
| Proxy 157 | `oracle-ram-monitor.sh` + Sentinel en Caddy | Activo |
| OCI-1 129 | `ram-monitor` + `ram-responder` | **Desactivado** (eran del rol "postgresql" histórico) |

Umbral Sentinel proxy: `THRESHOLD_MB=250` en `oracle-ram-monitor.sh`.

---

## 12. Limpieza realizada (jun 2026)

- `docker system prune` en ambos servidores (~2.7 GB proxy, ~1.4 GB OCI-1)
- Imágenes antiguas de `flashcard-backend` eliminadas
- Contenedor `surrealdb` eliminado del proxy
- Datos `/root/surreal_data` eliminados del proxy (viven solo en OCI-1)
- Mirror `flashcard-backend-node` eliminado de OCI-1
- `qa-flashcard-backend-node` eliminado del proxy (durante redeploy manual)

---

## 13. Checklist para próximo deploy o intervención de IA

1. **¿Dónde va SurrealDB?** → Solo OCI-1 (`deploy-surrealdb-oci1.sh`)
2. **¿Dónde va Rust/Caddy?** → Solo Proxy (`bootstrap-oracle.sh --backend-only`)
3. **SURREAL_URL en prod** → `10.0.1.138:8080` (IP privada)
4. **No aumentar RAM en proxy para Surreal** → ya no vive ahí
5. **Límite memoria Surreal** → `800m` en OCI-1 (dedicado + Alpine)
6. **Comunicación** → red privada VCN, no IP pública `129.158.214.227`
7. **Postgres** → Azure, sin cambios
8. **Validar tras deploy:**
   ```bash
   curl https://fluency.lat/api/health
   curl http://10.0.1.138:8080/health   # desde proxy
   docker logs flashcard-backend-node | grep SurrealDB
   ```

---

## 14. Historial de cambios (jun 2026)

1. Batching frontend + endpoint `POST /api/update-batch`
2. Migración SurrealDB: Proxy → OCI-1 (datos vía `tar` + scp)
3. Red privada `10.0.1.67` → `10.0.1.138:8080`
4. `--network host` + BBR en OCI-1
5. Límite memoria Surreal: 256m → **800m**
6. Firewall iptables: solo proxy puede conectar a `:8080`
7. Limpieza Docker y servicios huérfanos
8. Scripts nuevos: `deploy-surrealdb-oci1.sh`, `oci1-db-tuning.sh`
9. `bootstrap-oracle.sh`: ya no llama `deploy-surrealdb.sh`
10. **(jul 2026)** Upgrade SurrealDB 1.5.5 → 3.2.3: `UPDATE`→`UPSERT`, `type::thing`→`type::record`,
    `string::startsWith`→`string::starts_with`, protocolo `file:`→`rocksdb:`. Ver §15 para el
    procedimiento de migración de datos y la advertencia de compatibilidad de versión en §7.

---

## 15. Migración de versión mayor de SurrealDB (procedimiento probado, jul 2026)

Un binario de una versión mayor no lee de forma fiable el storage on-disk de una versión mayor
anterior (probado: `surreal fix` de 3.2.3 sobre datos 1.5.5 falla con "Fix is not implemented" —
solo sabe arreglar la versión inmediatamente anterior). El camino verificado, para cualquier salto
de versión mayor futuro:

1. **Backup primero, fuera del servidor**: `tar` de `/root/surreal_data` + `surreal export` lógico
   (binario de la versión ORIGEN), ambos copiados fuera de OCI-1.
2. **Parar el contenedor viejo**, copiar `/root/surreal_data` (nunca mover ni modificar el
   original hasta confirmar el resultado).
3. **Peldaño de la versión intermedia**: `docker run --rm -v <copia>:/data
   surrealdb/surrealdb:v<intermedia> fix rocksdb:/data/surreal.db` — arregla el layout on-disk de
   un salto mayor a la vez. Si el salto cruza más de una frontera mayor (p. ej. 1.x→3.x), repetir
   por cada una (1.x→2.x, luego 2.x→3.x) o, como en jul 2026, usar el export lógico del peldaño
   intermedio como puente hacia la versión final (paso 4).
4. Levantar el contenedor de la versión intermedia sobre esa copia ya arreglada, confirmar que los
   datos se leen bien, y `surreal export` desde ahí — ese export ya es compatible con la versión
   final (la exportación garantizada compatible con 3.x requiere SurrealDB ≥ 2.6.0 en el lado que
   exporta).
5. Levantar la versión FINAL sobre un data dir **vacío** (`chmod 777` primero — permission denied
   si no) e `surreal import` el export del paso 4.
6. **Verificar antes de cortar**: contar filas por tabla en origen y destino, comparar contra el
   inventario tomado antes de empezar.
7. Recién ahí mover el data dir migrado a la ruta canónica (`/root/surreal_data`) y correr
   `deploy-surrealdb-oci1.sh` normal. El data dir original queda intacto con otro nombre — nunca se
   borra, es el rollback.
8. **Coordinar con el deploy del backend** (ver advertencia de §7): la DB debe migrar ANTES de que
   el backend nuevo se despliegue, no después — al revés, el backend nuevo ni siquiera logra
   conectar.

Índice HTTP: los headers cambiaron de `NS`/`DB` (1.5.5) a `Surreal-NS`/`Surreal-DB` (3.x); y
seleccionar un namespace/database que no existe por header ya no lo crea implícitamente — hay que
`DEFINE NAMESPACE`/`DEFINE DATABASE IF NOT EXISTS` antes (afecta scripts de test que usan `/sql`
directo, no al SDK de la app).

---

## 16. Bitácora completa del upgrade a 3.2.3 (21-22 jul 2026)

Registro cronológico real del upgrade, para que la próxima persona (IA o humana) que toque esto
entienda exactamente qué pasó, por qué tomó 4 corridas de pipeline, y qué verificar si algo similar
vuelve a ocurrir. Resumen ejecutivo: **el upgrade terminó correctamente, verificado con datos
reales (login real de un usuario, sin errores en logs, sin pérdida de un solo registro en ningún
punto del proceso).**

### Qué se hizo

- **Código** (`backend/api_main/src/infrastructure/storage/surreal/`): `UPDATE`→`UPSERT` donde el
  patrón dependía de crear-si-no-existe, `type::thing`→`type::record`,
  `string::startsWith`→`string::starts_with`, `DEFINE TABLE IF NOT EXISTS` al conectar (3.x ya no
  tolera `SELECT` sobre tabla nunca escrita), `CryptoProvider` de rustls instalado explícito en
  `main()` (conflicto `aws-lc-rs`/`ring` nuevo en el árbol de dependencias). El SDK Rust reemplazó
  serde por el trait `SurrealValue` — ver quirks completos en `backend/CLAUDE.md`.
- **Infra**: `infra/proxy/deploy-surrealdb-oci1.sh`/`deploy-surrealdb.sh` con tag `v3.2.3` y
  protocolo `rocksdb:` (antes `file:`). `backend/Dockerfile` fijado a `rust:1.95-slim-bookworm`
  (ver incidente #1 abajo). `azure-pipelines.yml`: `Deploy_Mirrors`/`Mirror_OCI1`/`Mirror_AWS` con
  `succeeded(...)` explícito (ver incidente #2 abajo).
- **Datos**: migración 1.5.5 → 2.3.10 (`surreal fix`) → export → 3.2.3 (`surreal import`),
  procedimiento en §15. Se ejecutó **3 veces completas** durante la sesión (cada vez que hubo que
  revertir producción a 1.5.5 por un incidente, había que volver a migrar antes del siguiente
  intento) — siempre sobre el data dir en ese momento, siempre con verificación de conteos antes de
  cortar, nunca con pérdida de filas.

### Los 4 incidentes reales (todos contenidos, ninguno con pérdida de datos)

1. **Build del backend falló en CI** — `backend/Dockerfile` seguía en `rust:1.88-slim`; las
   dependencias nuevas de `surrealdb` 3.2.3 (`fastnum`, `roaring`) exigen rustc ≥1.94/1.90. Al
   arreglarlo con `rust:1.95-slim` (sin sufijo) apareció un segundo problema: ese tag apunta a
   Debian trixie, mientras el runtime (`debian:bookworm-slim`) es Debian 12 — glibc incompatible,
   binario que compila pero no arranca. Fijado a `rust:1.95-slim-bookworm` (mismo Debian que el
   runtime), validado con `docker build --no-cache` + `ldd` antes de cada push subsiguiente.
2. **Corrupción parcial de storage** — con el backend sin desplegar (incidente #1 en curso),
   `Mirror_OCI1` igual corrió (su condición solo miraba la rama, no el éxito de `Mirror_Oracle`) y
   redesplegó SurrealDB 3.2.3 contra datos que yo había revertido a formato 1.5.5 minutos antes. El
   contenedor no pudo arrancar y corrompió el storage al intentarlo ("Corrupt or unsupported
   format_version: 7"). Recuperado desde una copia intacta guardada minutos antes. Arreglado
   agregando `succeeded(...)` real a las 3 condiciones afectadas del pipeline.
3. **Asimetría `SerdeWrapper` en fechas (primera tanda)** — una vez desplegado, `demo_feedback`,
   y latente en SRS/suscripciones/progreso de pronoun: `SerdeWrapper<T>` sobre una struct completa
   serializa fechas como string, pero un bind nativo o `#[derive(SurrealValue)]` directo produce
   datetime nativo — mezclar ambos en la misma fila revienta la lectura. Arreglado con structs
   locales `#[derive(SurrealValue)]` directas (mismo patrón que `SurrealUser`) en los 3 repositorios
   afectados, validado localmente (incluido un caso de estudio con SRS real, HTTP end-to-end) antes
   de un 3er push.
4. **El mismo bug, en `upsert_user` (login roto)** — se me pasó la función más crítica de todas en
   la tanda anterior: `upsert_user` escribía fechas vía `SerdeWrapper` (string) pero las leía con
   `SurrealUser` (nativo) — se ejecuta en CADA login, así que rompía el login de forma reproducible
   al 100%, no intermitente. Detectado por el usuario en producción real ("el login no autentica"),
   confirmado en la DB (el usuario que acababa de intentar loguearse tenía `created_at`/`last_login`
   en string; los otros 2, sin login desde el incidente #3, seguían en formato nativo — coincide
   exactamente con el mecanismo). Mitigado en caliente en la DB mientras se arreglaba el código.
   Arreglado, auditados sistemáticamente TODOS los usos restantes de `SerdeWrapper` en el módulo
   (no quedó ninguna asimetría más), y verificado con un login real del usuario tras el 4to deploy:
   `last_login` quedó en formato nativo (`type::is_datetime() = true`) después de la escritura real.

### Verificación final (21-22 jul 2026, post 4ta corrida de pipeline)

```
user: 3 filas (email.coronado@gmail.com, noerojasc8@gmail.com, safe.jcoronado@gmail.com)
demo_feedback: 3 filas
user_activity_stats: 3 filas
daily_stats: 2 filas
card_progress: 0 filas (igual que antes de migrar — sin actividad real de estudio todavía)
Imagen del contenedor: surrealdb/surrealdb:v3.2.3
```

Sin pérdida de un solo registro en ningún punto (verificado por conteo antes/después en cada una de
las 3 migraciones de datos completas). Login real confirmado funcionando con datos correctos.
Backend y DB en la misma versión mayor, sin ventana de incompatibilidad pendiente.

**Backups que quedan disponibles** (ninguno se borró): `~/oracle_backups/` en la máquina local
(exports `.surql` + tar del storage original 1.5.5), y en OCI-1 varias copias con nombre
`surreal_data_1.5.5_original*`/`surreal_data_*_verified_*` sin tocar desde antes del primer corte.

---

## 17. Optimizaciones futuras — solo activar con tráfico real medido

> Contexto (22 jul 2026): `registeredUsers: 3`, `onlineUsers: 1`, `card_progress: 0 filas`. **No
> hay tráfico real todavía.** Snapshot en vivo vía `fluency-monitor` MCP: Proxy con ~400-420 MB
> disponibles de 968 MB, DB con ~470-500 MB disponibles, `surrealdb` usando 133 MB de un tope de
> 800 MB, load average <0.25 en ambos nodos, swap ≈0. **No estamos al límite** — hay margen no
> exprimido, pero tampoco hay carga real que justifique tocar nada hoy. Antes de aplicar cualquiera
> de estas, seguir el "Protocolo antes de optimizar" de
> [`AI_OPERATIONS_CONTEXT.md`](AI_OPERATIONS_CONTEXT.md) (medir bajo carga real, no por sensación).

### Candidata válida (verificada contra el binario real)

- **`--query-timeout` / env `SURREAL_QUERY_TIMEOUT`**: existe de verdad — confirmado con
  `docker run --rm surrealdb/surrealdb:v3.2.3 start --help`. "Duración máxima que puede correr un
  set de statements." Hoy **no está configurado** en `infra/proxy/deploy-surrealdb-oci1.sh`
  (arranca sin timeout). Si en el futuro aparecen queries pesadas concurrentes bajo tráfico real,
  agregar `--query-timeout 5s` (o el valor que la medición real indique) al `docker run` de ese
  script es una protección razonable contra una query colgada acaparando RocksDB. No aplicar un
  valor a ciegas: medir la duración real de las queries más pesadas primero.

### Descartada — no reintentar sin volver a verificar

- **`--kvs-ca-size <tamaño>` para acotar la caché de bloques de RocksDB**: **no existe** en el
  binario. Lo que sí existe es `--kvs-ca` / `--kvs-crt` / `--kvs-key` — rutas a certificados TLS
  para conectarse a un **KV store remoto** (cluster TiKV/FoundationDB), sin relación con tamaño de
  caché, y que además no aplican aquí porque el motor configurado es `rocksdb:/data/surreal.db`
  (local), no un KV remoto. Si una IA futura vuelve a proponer un flag de SurrealDB, verificarlo
  primero contra `docker run --rm surrealdb/surrealdb:v3.2.3 start --help` antes de creer la
  recomendación.

---

*Última revisión: 22 jul 2026 — upgrade SurrealDB 1.5.5 → 3.2.3 completo y verificado con login
real de producción tras 4 corridas de pipeline (detalle completo en §16). §17 agregada el mismo
día tras descartar dos propuestas de optimización de IA (una basada en un nombre de contenedor
legado, otra en un flag inexistente).*
