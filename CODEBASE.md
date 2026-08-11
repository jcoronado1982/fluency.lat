# CODEBASE.md — Flashcard AI

> Referencia técnica detallada de la estructura de código, componentes y tecnologías del proyecto.

---

## Estructura del Repositorio

```
flashcard/
├── backend/          ← API REST y servicios en Rust
├── client/           ← SPA y frontend en React
├── infra/
│   └── proxy/        ← Configuración de Caddy, Docker y scripts de balanceo
├── json/             ← Contenido de las flashcards en formato JSON (sincronizados al proxy real)
└── docs/             ← Documentación de arquitectura e infraestructura
```

---

## Backend — `backend/`

### Tecnologías Principales: Rust + Axum

*   **Rust:** Elegido por su bajísimo consumo de recursos (~20 MB RAM en idle), excelente rendimiento (sin recolector de basura) y seguridad en tiempo de compilación.
*   **Axum:** Framework HTTP asíncrono construido sobre Tokio, hiper-eficiente para el enrutamiento y manejo de JSON.

### Arquitectura de Código

Monolito modular Clean/Hexagonal. Ver [ARQUITECTURA_MODULAR.md](docs/ARQUITECTURA_MODULAR.md).

```
backend/
├── core/                        ← fluency_core: dominio + puertos
├── mod_shell/                   ← auth, tutor, presence, subscriptions
├── mod_flashcards/              ← DeckUseCases + audio/image use cases
├── mod_pronoun/                 ← StoryUseCases (crate pronoun_practice)
└── api_main/
    ├── src/main.rs              ← composition root
    ├── src/modules/             ← registro de rutas por módulo
    ├── src/infrastructure/      ← adapters Surreal, Gemini, ComfyUI
    └── src/api/endpoints/       ← handlers HTTP
```

### Base de Datos Activa: SurrealDB

El sistema utiliza **SurrealDB 3.2.3** (RocksDB) alojado en **fluency-db-surreal** (GCP, VPC privada `10.128.0.5:8080`; antes `server-oci-1` en Oracle, ver `tools/oracle-legacy/`) para gestionar la persistencia avanzada:
*   **Usuarios (`users`):** Guarda perfil de Google y permisos.
*   **Suscripciones (`subscription`):** Controla el estado Premium (`active`/`cancelled`/`expired`) y fechas de vencimiento.
*   **Progreso de Tarjetas (`card_progress`):** Registro de qué tarjetas ha completado cada usuario.
*   **Motor Arcade:** Tablas `stories`, `episodes`, `story_screens`, `user_progress` y `user_errors` para la lógica narrativa y tutoría de errores.

#### Degradación Elegante (*Null Object*)
Si SurrealDB está desconectado, el sistema inyecta `backend/api_main/src/infrastructure/storage/null_db_repository.rs`.

---

## Frontend — `client/`

### Tecnologías: React 19 + Vite + CSS propio modular

*   **React:** SPA (Single Page Application) servida estáticamente, con renderizado visual rápido.
*   **Vite:** Herramienta de compilación ultrarrápida que optimiza el empaquetado de producción.
*   **CSS propio modular:** Base global + CSS por página/módulo + CSS Modules en componentes aislados.

### Estructura de Código

El frontend replica la separación de responsabilidades y modularidad limpia:

```
client/src/
├── main.jsx
├── App.jsx               ← shell: layout + getAppRoutes (sin imports de módulos)
├── modules/
│   ├── index.js          ← registry loader
│   ├── landing/          ← página pública / (opt-in, layout bare)
│   ├── pricing/          ← precios y checkout público
│   ├── dashboard/        ← shell autenticado + home /dashboard
│   ├── flashcards/       ← módulo flashcards completo (ports/adapters/useCases + UI)
│   └── pronounPractice/  ← módulo pronoun (ausente en el perfil sparse dev-flashcards)
├── contracts/            ← contratos entre módulos (courseDirection, srsEngine, catalogOrder…)
├── context/              ← shell: UIContext, AuthContext, AppContext
└── services/httpClient.js
```

Cada módulo bajo `modules/` sigue el patrón `ports/ → adapters/ → useCases|queries/ →
composition.js → index.jsx` (detalle completo en
[docs/ARQUITECTURA_MODULAR.md §4](docs/ARQUITECTURA_MODULAR.md)).

---

## Almacenamiento y sincronización de archivos

La aplicación almacena archivos (JSONs de barajas, audio sintetizado `.ogg` e imágenes generadas por IA) de manera centralizada y persistente en el proxy real de producción — **GCP** desde el 4 ago 2026 (antes Oracle Cloud, ver [`tools/oracle-legacy/README.md`](tools/oracle-legacy/README.md)).

> ⚠️ Todas las variables `ORACLE_*` de esta sección son nombres **legado** (vienen de cuando el
> proxy vivía en Oracle) pero su semántica y su código siguen vigentes tal cual, aplicados hoy al
> proxy de GCP — no se renombraron para no tocar código/pipeline sin necesidad. Leer "Oracle" en
> esta sección como "el proxy real, hoy GCP" salvo que se hable explícitamente del archivado.

### Flujo vigente

El comportamiento depende del lugar donde corre el backend:

*   **Proxy real, producción (`SYNC_TO_ORACLE=false`, `ORACLE_REPOSITORY_ONLY=false`):** el
    volumen `/mnt/sda/repository/flashcard:/data` es local (en GCP; era
    `/root/smart-proxy/repository/flashcard:/data` en Oracle). Rust lee/escribe `/data` y
    Caddy sirve el mismo disco. No hay SSH/SCP por archivo.
*   **AWS remoto (`SYNC_TO_ORACLE=true`):** cuando actúa como espejo, transfiere al proxy real
    (`ORACLE_HOST`) los archivos generados; no es la ruta primaria mientras el proxy está sano.
*   **Desarrollo local:** puede usar disco local o `./start.sh oracle` en modo de lectura contra
    el proxy real. Revisar la configuración antes de permitir sincronización hacia producción.

No inferir que “producción” significa siempre `SYNC_TO_ORACLE=true`: en el backend que vive dentro
del propio proxy real ese valor sería lento e incorrecto.

---

## Variables de Entorno Requeridas en Producción

| Variable | Requerido | Descripción |
|---|---|---|
| `JWT_SECRET` | Sí | Secreto para firmar y validar tokens de sesión JWT |
| `GOOGLE_CLIENT_ID` | Sí | Identificador para la autenticación de Google OAuth (leído por `OAuthTokenVerifier`) |
| `APPLE_CLIENT_ID` | No (Apple Sign-In deshabilitado si falta) | Identificador para "Sign in with Apple" (leído por `OAuthTokenVerifier`) |
| `SUPER_ADMIN_EMAIL` | Sí | Correo electrónico con privilegios de administrador automático |
| `GCP_API_KEY` | Sí | Llave de Google Cloud con accesos a la API Text-to-Speech |
| `GEMINI_API_KEY` | Sí | Llave para habilitar el tutor y explicaciones de Gemini 2.0 |
| `GEMINI_TTS_API_KEY` | Sí (audio EN) | Clave primaria Google AI Studio para Gemini TTS (inglés) |
| `GEMINI_TTS_API_KEY_BACKUP` | Solo local batch | Respaldo en `backend/.env` para `--batch-gen-audio`; **no** se usa en producción |
| `SYNC_TO_ORACLE` | Sí | Nombre legado (Oracle). `false` en el proxy real local; `true` solo en mirrors remotos que deban copiar hacia el proxy real |
| `ORACLE_REPOSITORY_ONLY` | Sí en el proxy | Nombre legado. `false` en el backend del proxy real para usar el volumen local; los modos de lectura remota pueden usar `true` |
| `ORACLE_HOST` | Sí | Nombre legado. Dirección IP pública de la máquina proxy real (hoy GCP, `35.188.162.50`; default en `config.rs`) |
| `ORACLE_SSH_PASSWORD` | Sí | Contraseña de acceso SSH seguro para realizar transferencias SCP |
| `ORACLE_REMOTE_PATH` | Sí | Nombre legado. Ruta destino en el proxy real (`/mnt/sda/repository/flashcard` en GCP; era `/root/smart-proxy/repository/flashcard` en Oracle) |
| `LOCAL_STORAGE_PATH` | Sí | `/data` en el proxy real, montado al repositorio persistente; puede ser temporal en mirrors (audio/imágenes generados, logs de batch). El feedback de la demo (`demo_feedback`) ya NO depende de esta ruta: vive en SurrealDB — ver `docs/modules/landing.md` §Datos |
| `SURREAL_URL` | Sí | `10.128.0.5:8080` en GCP por VPC privada (era `10.0.1.138:8080` en Oracle); mirrors usan el endpoint autorizado correspondiente. ⚠️ Sin esquema (`ws://`) — `Surreal::new::<Ws>()` cuelga si se lo pasás con esquema, ver `backend/GEMINI.md` |
| `MEDIA_DELIVERY_MODE` | No (fallback `oracle`) | Proveedor de entrega/caché de imágenes y audio: `oracle` o `cloudflare`; el pipeline de producción fija `cloudflare` |
| `AI_TUTOR_PROVIDER` | No (fallback `gemini`) | Proveedor del tutor de IA (`AITutor`), seleccionado por `infrastructure/ai/provider_selection.rs::ai_tutor_provider_from_name`. Único valor registrado hoy: `gemini` |
| `AUDIO_TTS_PROVIDER` | No (fallback `gemini`) | Proveedor de TTS principal (`AudioGenerator`), seleccionado por `provider_selection.rs::audio_provider_from_name`. Único valor registrado hoy: `gemini` |
| `LEMON_SQUEEZY_API_KEY` | No (`NullPaymentProvider` si falta) | Habilita el proveedor de pago LemonSqueezy (checkout + cancelación); sin ella, la activación de suscripciones queda manual (admin) |
| `LEMON_SQUEEZY_STORE_ID` | Sí si hay API key | ID de la tienda LemonSqueezy usado al crear un checkout |
| `LEMON_SQUEEZY_VARIANT_MONTHLY` | Sí si hay API key | Variant ID del plan mensual en LemonSqueezy |
| `LEMON_SQUEEZY_VARIANT_ANNUAL` | Sí si hay API key | Variant ID del plan anual en LemonSqueezy |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Sí para recibir webhooks | Firma HMAC-SHA256 de `POST /api/webhooks/lemonsqueezy`; la genera LemonSqueezy al crear el webhook en su dashboard (distinta de la API key) |

### Proveedor de entrega de media

`MEDIA_DELIVERY_MODE` es el único switch de la aplicación y del despliegue para backend y Caddy:

```bash
MEDIA_DELIVERY_MODE=oracle      # acceso directo; navegador cachea URLs versionadas
MEDIA_DELIVERY_MODE=cloudflare  # Cloudflare cachea; navegador revalida contra el edge
```

El contrato vive en `backend/core/src/ports/media_delivery.rs`; las implementaciones viven en
`backend/api_main/src/infrastructure/media_delivery/` y se seleccionan en el composition root.
Un proveedor nuevo se agrega como otro adaptador, sin modificar handlers ni casos de uso.

El cambio se aplica al volver a desplegar backend y Caddy. La variable no modifica el DNS de
Cloudflare: para `cloudflare`, el registro debe estar proxyado (nube naranja); para llegar realmente
directo a Oracle con `oracle`, debe usarse un registro DNS-only (nube gris) o un hostname de origen
separado. Esto evita acoplar la aplicación a la API o las credenciales de un proveedor DNS.

Topología actual: producción (`fluency.lat` y `www`) está proxyada; `qa.fluency.lat` es un A
DNS-only directo a Oracle. QA revalida media y no usa el CDN. La query `?v=` se deriva únicamente de
metadatos/ETag y cambia aunque el nombre físico permanezca igual; no regenera ni cachea bytes en RAM.

Guía operativa, verificación y reversión:
[docs/infrastructure/media-delivery-cache.md](docs/infrastructure/media-delivery-cache.md).

Antes de proponer cambios de rendimiento o memoria, leer también
[docs/infrastructure/AI_OPERATIONS_CONTEXT.md](docs/infrastructure/AI_OPERATIONS_CONTEXT.md).
