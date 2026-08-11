# Historial extraído de llms.txt (jun 2026)

> **Histórico.** Estas secciones vivían en `llms.txt` y describen cambios de jun 2026. Varias
> afirmaciones quedaron obsoletas (p. ej. "backend primario migrado a AWS" — hoy el backend
> primario corre en el Oracle Proxy; "PostgreSQL 15" — la DB activa es SurrealDB 1.5.5).
> El estado vigente está en los canónicos enlazados desde `CLAUDE.md`.

## Cambios arquitecturales — 2026-06-04 (Clean Architecture 100%)
- **Backend primario migrado a AWS** (`34.229.229.255:8080`, t3.micro, free 24/7) *(luego revertido: el primario volvió al Oracle Proxy)*
- **Cloud Run** ahora es overflow automático (solo se usa si AWS falla)
- **PostgreSQL** vive en Azure VM (`172.202.197.64:5432`, nativo Alpine) *(reservado a pagos futuros; no es la DB del producto)*
- **Oracle Proxy** gestiona routing via `/tmp/AWS_HEALTHY` + `aws-health-monitor.sh`
- **Dockerfile** actualizado: incluye `sshpass` + `openssh-client` para leer JSON del Oracle
- **Pipeline** Stage 4-E: despliega imagen validada a AWS tras Cloud Run OK

## Optimizaciones de red y latencia — 2026-06-04 (v1.5.0)
### Backend (Rust)
- **gRPC binario para Gemini**: `GeminiGrpcProvider` reemplaza REST/JSON. Usa `tonic` + tipos protobuf inline (`prost::Message`), sin `protoc` del sistema. Channel HTTP/2 persistente con TLS keep-alive.
- **gRPC binario para TTS**: `TtsGrpcProvider` reemplaza REST/JSON. Audio OGG llega como bytes directos en el proto — elimina `base64::decode()` en cada síntesis.
- **Pool HTTP persistente en `LocalStorageRepository`**: Un `reqwest::Client` compartido para todas las llamadas a Oracle CDN. TCP keep-alive + TLS session reuse (antes: nuevo cliente por llamada).
- **SSH ControlMaster**: Proceso maestro SSH arranca en background al iniciar el backend. Todos los SCP reutilizan el socket mux (~30 ms vs ~800 ms anteriores).
- **moka cache**: `deck_cache` (TTL 5 min, 150 entradas máx ≈ 7.5 MB) + `list_cache` (TTL 10 min, 50 entradas) en `LocalStorageRepository`. Hit = 0 ms, no hay RTT a Oracle.
- **Tokio runtime tuneado**: `thread_stack_size = 512 KB` (default 2 MB), `worker_threads = min(cpus,4)` configurable via `TOKIO_WORKER_THREADS`.
- **tower-http**: `CompressionLayer` (gzip+brotli) + `TimeoutLayer(120 s)` en stack global.
- **SSE broadcast**: Buffer aumentado de 100 a 1000 slots.
### Infraestructura
- **WireGuard**: Script en `infra/wireguard/setup-tunnel.sh`. Túnel privado AWS (10.10.0.1) ↔ Oracle (10.10.0.2). Ejecutar en ambos nodos para activar. Latencia SCP pasa de ~120 ms (pública) a ~25 ms (privada).
- **Dependencias nuevas**: `tonic 0.12`, `prost 0.13`, `moka 0.12`, `http 1`, `num_cpus 1`, `tower-http` features `timeout+compression-gzip+compression-br`, `reqwest` features `stream+rustls-tls`.

## Refactoring Clean Architecture + SOLID — 2026-06-04
### Backend (Rust)
- **Nuevo puerto `ImageCompressor`** (`domain/repositories/image_compressor.rs`): abstracción pura para compresión AVIF.
- **Nuevo adaptador `AvifCompressor`** (`infrastructure/ai/avif_compressor.rs`): implementación concreta detrás del puerto.
- **Nuevo caso de uso `MediaUseCases`** (`application/use_cases/media_use_cases.rs`): toda la lógica de síntesis de audio, generación/subida/borrado de imágenes extraída de los handlers HTTP.
- **`generation.rs` convertido a adaptador delgado**: los handlers solo mapean HTTP ↔ MediaUseCases.
- **`batch.rs` corregido**: ya no importa de `api::endpoints`; usa `MediaUseCases` directamente.
- **`story_use_cases.rs` corregido**: ya no importa de `infrastructure::ai::compress`; usa el puerto `ImageCompressor`.
- **URL hardcodeada eliminada**: `public_base_url` añadido a `Settings` (env var `PUBLIC_BASE_URL`).
- **DTOs de transporte movidos**: `UpdateStatusRequest` y `ResetRequest` ahora viven en `api/endpoints/decks.rs`, no en el dominio.
- **`AppState` adelgazado**: solo expone use cases (`deck`, `tutor`, `media`, `story`, `auth`) — ningún puerto de infraestructura crudo.
- **`assets.rs` corregido**: URLs hardcodeadas reemplazadas con `settings.public_base_url`.
### Frontend (React)
- **`httpClient.js`** (`services/`): cliente HTTP unificado que inyecta `Authorization: Bearer` automáticamente.
- **`flashcardRepository.js`** actualizado para usar `httpClient`.
- **`tutorRepository.js`** nuevo (`repositories/`): centraliza llamadas a `/api/analyze-error` y `/api/explain-like-child`.
- **`StoryArcadePage.jsx`**: `fetch` directos al tutor reemplazados por `tutorRepository`.
- **Guest-admin** restringido a `import.meta.env.DEV`.

## Pipeline & Compilación Optimizada ARM/AMD64 — 2026-06-06
- **Corrección de Buildx**: Añadido `make`, `g++`, y `g++-aarch64-linux-gnu` al builder stage en `backend/Dockerfile` para solventar fallos en el build de dependencias nativas (ej. `openssl` con feature `vendored`).
- **Optimización de Microarquitectura**: Compilación armada con `-C target-cpu=neoverse-n1` para ARM64 y `-C target-cpu=x86-64-v3` para AMD64 (Cascade Lake/GCP Cloud Run), maximizando vectorización y extensiones del set de instrucciones moderno.
- **Perfil de Release Agresivo**: Configurado LTO fat, `codegen-units = 1`, `panic = "abort"`, y eliminación automática de símbolos (`strip = true`) en `backend/Cargo.toml` para reducir al mínimo el tamaño de la imagen Docker final y aumentar el rendimiento.
