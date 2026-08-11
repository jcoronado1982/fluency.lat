# Mapa de Integración e Interacción de Sistemas — Fluency

Este documento sirve como plano maestro para entender cómo interactúan Frontend, Backend, Proxy, SurrealDB y APIs de IA en **Fluency** (`fluency.lat`). Repo y CI/CD: [`DEPLOY_Y_REPOSITORIO.md`](DEPLOY_Y_REPOSITORIO.md). Arquitectura modular: [`ARQUITECTURA_MODULAR.md`](ARQUITECTURA_MODULAR.md).

---

## 1. Arquitectura de Interacción Global (Diagrama de Flujo)

El siguiente diagrama detalla la topología de red y el flujo de comunicación desde que el cliente interactúa con la UI hasta que los datos se persisten o procesan en los servicios de IA:

```mermaid
graph TD
    %% Clientes e Interfaces
    User([Usuario / Navegador]) <-->|HTTPS| Caddy[Caddy Proxy - GCP]
    
    %% Capa de Proxy e Enrutamiento
    subgraph GCP VM (Nodo Central)
        Caddy -->|Sirve estáticos| SPA[SPA React 19]
        Caddy -->|Proxy /api/*| RustBackend[Backend Rust / Axum]
        RustBackend <-->|Conexión Local / WebSockets| SurrealDB[(SurrealDB - local)]
    end

    %% Nodos Espejo y Fallback
    subgraph AWS EC2 (Respaldo)
        RustBackendFallback[Backend Rust Fallback]
        SurrealDBFallback[(SurrealDB Mirror)]
        RustBackendFallback <-->|WebSockets| SurrealDBFallback
    end

    %% Sincronización de Archivos
    RustBackendFallback -->|SCP / SYNC_TO_ORACLE=true| Caddy
    
    %% Proveedores de Servicios Externos (IA y APIs)
    subgraph Proveedores de Servicios / IA
        RustBackend -->|gRPC / Gemini API| Gemini[Gemini 3.1 Flash-Lite]
        RustBackend -->|Gemini TTS + Cloud TTS| AudioProviders[Routing TTS]
        RustBackend -->|HTTP / WebSockets| ComfyUI[ComfyUI + FLUX 2]
    end

    style GCP VM fill:#e6f2ff,stroke:#0066cc,stroke-width:2px
    style AWS EC2 fill:#fff2e6,stroke:#ff8000,stroke-width:1px
    style Proveedores de Servicios / IA fill:#f2ffe6,stroke:#33cc33,stroke-width:2px
```

---

## 2. Ciclos de Vida de Solicitudes Clave (Lifecycles)

### A. Creación y Procesamiento de Tarjetas (Audio / Imagen por IA)
Cuando el usuario solicita generar recursos para una flashcard:
1. **Cliente (React):** Envía una solicitud HTTP `POST` a `/api/resolve-image` o `/api/synthesize-speech` mediante `client/src/services/httpClient.js`.
2. **Backend (Axum):** El enrutador en `backend/api_main/src/main.rs` y `modules/` dirige la petición al handler en `api/endpoints/generation.rs` (módulo flashcards).
3. **Casos de Uso (Application):** Se invoca `AudioUseCases` o `ImageUseCases`.
4. **Infraestructura (Providers):**
   - El backend usa **RoutingTtsProvider** (`backend/api_main/src/infrastructure/ai/routing_tts_provider.rs`): español por Cloud TTS / Gemini-TTS Cloud, inglés por Gemini TTS con fallback a Cloud TTS.
   - El namespace `landing-demo` puede usar **ElevenLabs** como proveedor especial de demo.
   - Llama a **ComfyUI** (`backend/api_main/src/infrastructure/ai/comfy_provider.rs`) para generar o resolver una imagen de FLUX.
5. **Almacenamiento y Sincronización:**
   - Si está en desarrollo local (`SYNC_TO_ORACLE=false`), el archivo se escribe directamente en el disco duro.
   - Si está en producción (`SYNC_TO_ORACLE=true` — nombre legado, el destino real es GCP desde el
     4 ago 2026, ver `tools/oracle-legacy/README.md`), el backend escribe el archivo temporal en
     `/tmp`, realiza un traspaso seguro mediante **SCP** al proxy real en
     `/mnt/sda/repository/flashcard/`, y borra el temporal.
6. **Respuesta:** Se devuelve la URL pública del recurso servido por Caddy (`https://fluency.lat/card_audio/...`).

### B. Módulo práctica de pronombres (`pronoun`)
Cuando el usuario chatea en una historia:
1. **Cliente:** React envía la respuesta textual del usuario y el ID de la pantalla actual a `/api/analyze-error`.
2. **Backend:** El caso de uso `TutorUseCases` recibe la entrada.
3. **Consulta de IA:** Se envía un prompt optimizado a Gemini mediante gRPC (`backend/api_main/src/infrastructure/ai/gemini_grpc_provider.rs`) conteniendo:
   - Las instrucciones del sistema (System Prompt).
   - El contexto de la historia y el reto planteado.
   - La respuesta del usuario.
4. **Procesamiento de Errores y Persistencia:**
   - Gemini analiza si hay errores gramaticales y devuelve un análisis JSON estructurado.
   - Si hay fallas, el backend persiste el reporte detallado en la tabla `user_errors` de **SurrealDB**.
   - El progreso global se actualiza en `user_progress`.
5. **Respuesta:** Se le retorna al cliente la retroalimentación formateada de la IA.

---

## 3. Mecanismo de Tolerancia a Fallos (Degradación Elegante)

El backend de Rust implementa el patrón **Null Object** para garantizar que la aplicación no se detenga si SurrealDB no está disponible (por ejemplo, al correr en entornos efímeros sin persistencia local como GCP Cloud Run):

```rust
// Comportamiento dinámico durante la inicialización en backend/api_main/src/main.rs:
let (user_repo, sub_repo, card_repo, story_repo, activity_repo) =
    match SurrealConnection::new(&surreal_url, "flashcard", "flashcard").await {
        Ok(conn) => {
            let conn = Arc::new(conn);
            // Conexión exitosa -> Inyecta adapters concretos por puerto
            (
                Arc::new(SurrealUserRepository(conn.clone())),
                Arc::new(SurrealSubscriptionRepository(conn.clone())),
                Arc::new(SurrealCardProgressRepository(conn.clone())),
                Arc::new(SurrealPronounRepository(conn.clone())),
                Arc::new(SurrealUserActivityRepository(conn.clone())),
            )
        }
        Err(_) => {
            // Falla de conexión -> Inyecta NullDbRepository de forma transparente
            let repo = Arc::new(NullDbRepository);
            (repo.clone(), repo.clone(), ...)
        }
    };
```
* **Consecuencia:** El usuario puede seguir repasando las tarjetas basadas en JSONs locales, mientras que los módulos que dependen de SurrealDB (autenticación y práctica de pronombres) se degradan de forma segura sin `panic!` en el servidor.

---

## 4. Añadir un nuevo módulo

Seguir la guía completa en **[docs/ARQUITECTURA_MODULAR.md](ARQUITECTURA_MODULAR.md)** §6.

Resumen:

1. **Dominio:** modelos y puertos en `backend/core`
2. **Aplicación:** crate `backend/mod_<nombre>/`
3. **API:** `backend/api_main/src/modules/<nombre>.rs` + endpoints con `#[cfg(feature)]`
4. **Registry:** actualizar `scripts/module_registry.sh` y `modules/README.md`
5. **Frontend:** `client/src/modules/<nombre>/index.jsx`
6. **Validar:** `./scripts/validate-module.sh <nombre>`
