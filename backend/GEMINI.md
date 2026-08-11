# Backend — Fluency (backend/)

> **Documentación exclusiva del backend Rust.** Frontend: `client/GEMINI.md`. Protocolo general
> e índice: `GEMINI.md` (raíz). Módulo concreto: `docs/modules/<módulo>.md`.

Workspace Rust (Axum + Tokio) con arquitectura **Clean/Hexagonal y monolito modular**: el dominio
no conoce la infraestructura; los módulos de negocio se activan por Cargo features.

## Estructura del workspace

```
backend/
├── core/            ← fluency_core: dominio (models/) + puertos (ports/) — SIN dependencias de infra
├── mod_shell/       ← casos de uso del shell: auth (OAuth→JWT), tutor, presence, subscriptions, daily_stats, local_agent
├── mod_flashcards/  ← DeckUseCases + audio/image use cases + batch  (feature `flashcards`)
├── mod_pronoun/     ← StoryUseCases (crate `pronoun_practice`; ausente en sparse dev-flashcards)
└── api_main/        ← composition root:
    ├── src/main.rs             wiring de adapters + rutas del shell
    ├── src/config.rs           Settings (env vars)
    ├── src/modules/            registro de rutas POR módulo (flashcards.rs, pronoun_practice.rs, shell.rs)
    ├── src/api/endpoints/      handlers HTTP (delgados: mapean HTTP ↔ use cases)
    └── src/infrastructure/     adapters: SurrealDB, storage, media_delivery, ai/ (Gemini gRPC, TTS, ComfyUI, AVIF)
```

**Regla de dependencias (inviolable)**: `core` no importa de nadie; `mod_*` importa solo `core`;
`api_main` importa todo y cablea. Un `mod_*` jamás importa de `api_main` ni de otro `mod_*`.

## Cargo features (módulos enchufables)

| Feature | Activa |
|---|---|
| `flashcards` (default) | mod_flashcards + endpoints decks/generation |
| `pronoun_practice` | mod_pronoun + endpoints de práctica |
| `auth` | login OAuth/JWT, presencia, endpoints admin |
| `subscriptions` | suscripciones |
| `payments` | proveedor de pago LemonSqueezy (checkout + webhooks) |

```bash
cargo build -p api_main                                                    # default
cargo build -p api_main --no-default-features --features auth,flashcards   # solo flashcards
cargo check -p api_main    # SIEMPRE antes de push (protocolo del pipeline)
```

## Receta: añadir un endpoint a un módulo

1. Lógica en el crate del módulo (`mod_<x>/src/…`) como caso de uso — nunca en el handler.
2. Si necesita infra nueva: definir el **puerto** en `core/src/ports/`, implementar el **adapter**
   en `api_main/src/infrastructure/`, cablear en `main.rs` (AppState solo expone use cases).
3. Handler delgado en `api_main/src/api/endpoints/<x>.rs`.
4. Registrar la ruta en `api_main/src/modules/<x>.rs` (no en `main.rs`, salvo rutas del shell).
5. Compilar con la feature activada Y desactivada: nada debe romperse sin el módulo.
6. **Cerrar el trabajo**: documentar el endpoint (entrada exacta, respuesta, invariantes) en
   `docs/modules/<módulo>.md` y correr `./scripts/verify-blueprints.sh` — falla si la ruta no
   está en el plano (regla de cierre de `GEMINI.md` raíz).

## Persistencia y degradación

- **SurrealDB 3.2.3** vía WS (`SURREAL_URL`; en prod `10.128.0.5:8080` por VPC privada de GCP —
  antes `10.0.1.138:8080` en Oracle, migrado el 4 ago 2026, ver `tools/oracle-legacy/README.md`).
  ⚠️ `Surreal::new::<Ws>(endpoint)`/`Surreal::new::<Wss>(endpoint)` esperan `endpoint` **sin**
  esquema (`host:puerto`, no `ws://host:puerto`) — pasarle uno con esquema no da error, cuelga
  hasta timeout (incidente real del 4 ago 2026). `Ws` y `Wss` son motores de transporte DISTINTOS
  (sin TLS / con TLS) elegidos por el parámetro de TIPO, no inferidos del string — `connect()` en
  `api_main/src/infrastructure/storage/surreal/connection.rs` decide cuál tipo usar mirando el
  esquema ANTES de pelarlo (`wss://`/`https://` → `Wss`; el resto → `Ws`). Pelar el esquema sin
  esa decisión deja **siempre** una conexión sin TLS — invisible para la conexión interna directa
  (`ws://10.128.0.5:8080`, misma VPC, nunca hubo TLS), pero rompe Cloud Run/AWS (que llegan a la
  DB por `wss://fluency.lat/db/rpc` vía Cloudflare): Cloudflare responde `308 Permanent Redirect`
  a un intento de WS sin TLS, y el backend degrada a `NullDbRepository` (incidente real del mismo
  día, ver `scripts/troubleshooting_library.skill.md` entrada 11).
  Namespace/DB lógicos: `SURREAL_NS`/`SURREAL_DB` (default `"flashcard"` si no se fijan) —
  permiten que prod y QA compartan la misma instancia de SurrealDB con datos separados por
  namespace (`flashcard` vs `qa_flashcard`), leídos en `async_main()` de `api_main/src/main.rs`.
  ⚠️ Hasta el 4 ago 2026 (migración de QA a GCP) estos valores estaban **hardcodeados** a
  `"flashcard","flashcard"` en la llamada a `connect_surreal_with_retry`, ignorando por completo
  estas variables — un contenedor QA con `SURREAL_NS=qa_flashcard` igual escribía en el namespace
  de producción. Verificar con el log de arranque (`🚀 Conectado a SurrealDB en ... (NS: ..., DB: ...)`)
  que el namespace real coincide con el esperado antes de asumir aislamiento QA/prod.
  Quirks 3.2.3 (jul 2026, migrado desde 1.5.5 — ver historial en
  `tools/oracle-legacy/ARQUITECTURA_ORACLE_DB.md`): funciones string en snake_case
  (`string::starts_with`, no camelCase), `type::record` (no `type::thing`), `UPDATE` **ya no
  crea el registro si no existe** — usar `UPSERT` para ese caso (criterio: nombre de función
  `upsert_*`/`create_*`/`log_*` construyendo el id ⇒ `UPSERT`; `SET ... WHERE` sobre una fila que
  ya debe existir ⇒ sigue siendo `UPDATE`). `SELECT`/`UPDATE`/`UPSERT` sobre una tabla nunca
  escrita ahora es error `NotFound`, no resultado vacío — por eso `connection.rs` define todas las
  tablas de la app con `DEFINE TABLE IF NOT EXISTS` al conectar. El SDK Rust reemplazó
  (de)serialización por serde con el trait `SurrealValue`; los tipos de dominio en `core` (que no
  puede depender de `surrealdb`) cruzan el límite infra/dominio envueltos en
  `surrealdb::types::SerdeWrapper`, no derivando `SurrealValue` directamente. El query planner **sí
  usa índices compuestos multi-campo** ahora (verificado con `EXPLAIN`, a diferencia de 1.5.5).
  Transacciones multi-statement en una sola query siguen funcionando igual. Watchdog de
  reconexión cada 30 s. **No hay compatibilidad cruzada de versión**: un cliente 3.x no conecta a
  un servidor 1.5.5 (falla el handshake WS) y un cliente 1.5.5 contra un servidor 3.x conecta pero
  algunas queries se cuelgan — backend y DB deben desplegarse juntos, nunca en secuencia con una
  ventana entre uno y otro.
- Sin DB → `infrastructure/storage/null_db_repository.rs` (Null Object, la app arranca igual).
- Assets (json/audio/imágenes): disco local en prod (`SYNC_TO_ORACLE=false`,
  `ORACLE_REPOSITORY_ONLY=false` — ⚠️ el default del binario es `true` y rompe los lookups por
  prefijo). Env vars completas: tabla en `CODEBASE.md`.

## Cómo probar

```bash
./start.sh                    # stack completo (DB Docker + ComfyUI + backend :8081 + Vite :5173)
cargo check -p api_main       # gate mínimo
cargo nextest run --workspace # suite Rust local (unitarias, propiedades, mocks, handlers/snapshots)
curl -s http://localhost:8081/api/health
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # JWT dev sin OAuth
```

Gate local unificado desde la raíz: `./scripts/test-local-preprod.sh --quick`; con el stack
levantado, `--full` añade SurrealDB 3.2.3 y Playwright, y `--all` agrega una carga k6 corta
bloqueada a `localhost`/`127.0.0.1`.
La integración recorre catálogo, progreso individual/lote, SRS y media contra el repositorio real,
y restaura el deck de `guest@local.dev`; la validación SRS tiene además propiedades en Rust.
Durante `--full`/`--all`, `.local-preprod-media.lock` bloquea con HTTP 423 toda generación,
subida o eliminación de audio/imágenes. El runner verifica el bloqueo antes de comenzar y compara
un inventario SHA-256 completo al salir. Nunca limpia media real automáticamente.

Restricciones de producción (RAM 1 GB, prohibido cachear bytes de media, límites Docker):
**leer `docs/infrastructure/AI_OPERATIONS_CONTEXT.md` antes de cualquier cambio de rendimiento.**
