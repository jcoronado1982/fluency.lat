# Backend — Fluency (backend/)

> **Rust backend documentation only.** Frontend: `client/GEMINI.md`. General protocol and index: `GEMINI.md` (root). Specific module: `docs/modules/<module>.md`.

Rust Workspace (Axum + Tokio) built as a **Clean/Hexagonal modular monolith**: the domain does not know infrastructure; business modules are toggled via Cargo features.

## Workspace Structure

```
backend/
├── core/            ← fluency_core: domain (models/) + ports (ports/) — ZERO infra dependencies
├── mod_shell/       ← shell use cases: auth (OAuth→JWT), tutor, presence, subscriptions, daily_stats, local_agent
├── mod_flashcards/  ← DeckUseCases + audio/image use cases + batch  (feature `flashcards`)
├── mod_pronoun/     ← StoryUseCases (crate `pronoun_practice`; absent in dev-flashcards sparse profile)
└── api_main/        ← composition root:
    ├── src/main.rs             adapter wiring + shell routes
    ├── src/config.rs           Settings (env vars)
    ├── src/modules/            route registration PER module (flashcards.rs, pronoun_practice.rs, shell.rs)
    ├── src/api/endpoints/      HTTP handlers (thin: map HTTP ↔ use cases)
    └── src/infrastructure/     adapters: SurrealDB, storage, media_delivery, ai/ (Gemini gRPC, TTS, ComfyUI, AVIF)
```

**Dependency Rule (Inviolable)**: `core` imports from no one; `mod_*` imports only `core`; `api_main` imports everything and wires. A `mod_*` NEVER imports from `api_main` or another `mod_*`.

## Cargo Features (Pluggable Modules)

| Feature | Activates |
|---|---|
| `flashcards` (default) | mod_flashcards + decks/generation endpoints |
| `pronoun_practice` | mod_pronoun + practice endpoints |
| `auth` | OAuth/JWT login, presence, admin endpoints |
| `subscriptions` | subscriptions |
| `payments` | LemonSqueezy payment provider (checkout + webhooks) |

```bash
cargo build -p api_main                                                    # default
cargo build -p api_main --no-default-features --features auth,flashcards   # flashcards only
cargo check -p api_main    # ALWAYS before push (pipeline protocol)
```

## Recipe: Add an Endpoint to a Module

1. Logic in module crate (`mod_<x>/src/…`) as a use case — never inside handler.
2. If new infra is needed: define **port** in `core/src/ports/`, implement **adapter** in `api_main/src/infrastructure/`, wire in `main.rs` (AppState exposes only use cases).
3. Thin handler in `api_main/src/api/endpoints/<x>.rs`.
4. Register route in `api_main/src/modules/<x>.rs` (not in `main.rs`, unless shell routes).
5. Compile with feature enabled AND disabled: nothing should break without the module.
6. **Closing Rule**: document endpoint (exact input, response, invariants) in `docs/modules/<module>.md` and run `./scripts/verify-blueprints.sh` — fails if route is missing from blueprint (closing rule of `GEMINI.md` root).

## Persistence and Degradation

- **SurrealDB 3.2.3** via WS (`SURREAL_URL`; in prod `10.128.0.5:8080` via GCP private VPC — previously `10.0.1.138:8080` in Oracle, migrated Aug 4, 2026, see `tools/oracle-legacy/README.md`).
  ⚠️ `Surreal::new::<Ws>(endpoint)`/`Surreal::new::<Wss>(endpoint)` expect `endpoint` **without** scheme (`host:port`, not `ws://host:port`) — passing one with scheme hangs until timeout. `Ws` and `Wss` are DIFFERENT transport engines (without TLS / with TLS) selected by TYPE parameter, not string scheme inference — `connect()` in `api_main/src/infrastructure/storage/surreal/connection.rs` decides which type to use by inspecting scheme BEFORE stripping it (`wss://`/`https://` → `Wss`; remainder → `Ws`).
- Without DB → `infrastructure/storage/null_db_repository.rs` (Null Object, app launches normally).
- Assets (json/audio/images): local disk in prod (`SYNC_TO_ORACLE=false`, `ORACLE_REPOSITORY_ONLY=false`). Full env vars table in `CODEBASE.md`.

## How to Test

```bash
./start.sh                    # full stack (Docker DB + ComfyUI + backend :8081 + Vite :5173)
cargo check -p api_main       # minimum gate
cargo nextest run --workspace # Rust local suite (unit, properties, mocks, handlers/snapshots)
curl -s http://localhost:8081/api/health
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # dev JWT without OAuth
```

Unified local pre-production gate from root: `./scripts/test-local-preprod.sh --quick`; with stack running, `--full` adds real SurrealDB 3.2.3 and Playwright, and `--all` adds a short k6 load test bound to `localhost`/`127.0.0.1`.

Production constraints (1 GB RAM, prohibited to cache media bytes, Docker limits): **read `docs/infrastructure/AI_OPERATIONS_CONTEXT.md` before any performance changes.**
