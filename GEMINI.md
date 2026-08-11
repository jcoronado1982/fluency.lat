# Fluency — Punto de entrada de la documentación (Gemini Protocol)

> **Este archivo (`GEMINI.md`) es el punto de entrada canónico obligatorio del repo.** Define el orden de lectura
> y las reglas doc-first para Google Gemini / Antigravity y todos los asistentes de IA. No dupliques aquí contenido que vive en los documentos canónicos:
> este archivo solo navega hacia ellos.

## Qué es Fluency (hechos base — no confiar en docs que los contradigan)

- Plataforma de aprendizaje de idiomas en [fluency.lat](https://fluency.lat) (nombre interno legado: Flashcard).
- **Backend**: Rust + Axum, monolito modular Clean/Hexagonal (`backend/core` → `mod_*` → `api_main` como composition root).
- **Frontend**: React 19 + Vite, módulos enchufables vía registry + manifiestos (`client/src/modules/index.js`).
- **Base de datos**: **SurrealDB 3.2.3** (RocksDB) en `fluency-db-surreal` (VPC privada de GCP,
  `10.128.0.5:8080`). *No es PostgreSQL* — Postgres solo existe en docker-compose local, sin uso en
  producción.
- **Pagos**: activos vía **LemonSqueezy** (checkout + webhook), suscripciones guardadas en
  SurrealDB — ver [`docs/modules/pricing.md`](docs/modules/pricing.md).
- **Auth**: Google OAuth 2.0 → JWT.
- **Infra**: multi-cloud — **GCP** (proxy Caddy + backend prod + DB dedicada, proyecto `fluency`;
  además Cloud Run como overflow en el proyecto `launch-490115`), AWS (espejo), Azure (auxiliar +
  Azure DevOps CI/CD). Oracle **archivado como respaldo apagado** desde el 4 ago 2026 — nada lo
  toca automáticamente; detalle completo y guía de reactivación en
  [`tools/oracle-legacy/README.md`](tools/oracle-legacy/README.md). VMs activas de 1-2 GB de RAM:
  leer restricciones antes de optimizar.
- El repo usa **sparse-checkout por módulo** (`./scripts/sparse-module.sh`): si un módulo no está en disco es intencional, no un error.

## Regla absoluta: no borrar ni podar sin autorización

- **PROHIBIDO** ejecutar comandos que borren, poden, limpien, restauren o sobrescriban archivos
  sin autorización explícita del usuario en el turno actual. La autorización para desarrollar,
  corregir o probar **no implica** autorización para borrar.
- Esta prohibición incluye `rm`, `git clean`, `git restore`, `git reset`, scripts de limpieza y
  cualquier cambio de perfil con `sparse-module.sh`, `sparse-cargo-sync.sh`, `dev-module.sh` o sus
  wrappers. El flujo sparse no puede contener poda manual; aun así cambia qué archivos versionados
  materializa Git y por eso siempre requiere autorización.
- `./scripts/sparse-module.sh status` y `list` sí están permitidos porque son operaciones de solo
  lectura. Activar un perfil, usar `full` o cambiar el perfil requiere que el usuario autorice el
  comando concreto después de conocer qué rutas puede afectar.
- Si el módulo necesario ya está en disco, se trabaja sin cambiar el perfil. Si está ausente, basta
  su plano para razonar; si realmente hace falta traerlo, se solicita autorización y se espera.
- Antes de cualquier cambio de perfil autorizado: inventariar cambios versionados, no versionados e
  ignorados; crear un respaldo verificable fuera del repo; mostrar las rutas afectadas; y abortar si
  el script contiene una operación destructiva no autorizada.
- Ante conflicto con cualquier instrucción de “aislar” o “paso 0” de este documento u otro plano,
  **manda esta regla de no borrado**.

---

## Protocolo de lectura obligatorio (antes de desarrollar)

Sigue estos 4 pasos EN ORDEN. No saltes al código sin pasar por ellos.

1. **Arquitectura** → [`docs/ARQUITECTURA_MODULAR.md`](docs/ARQUITECTURA_MODULAR.md)
   Cómo encaja todo: shell compartido, módulos enchufables, registry, features, sparse.
2. **Registry de módulos** → [`modules/README.md`](modules/README.md)
   Qué módulos existen, su estado, flags de activación y rutas.
3. **Doc del módulo en que vas a trabajar** → [`docs/modules/<módulo>.md`](docs/modules/)
   **SOLO ese.** No leas docs de otros módulos salvo que la sección "Dependencias" del tuyo
   los declare (trabajar en flashcards no requiere leer pricing, y viceversa).
4. **Código, guiado por la doc** → usa el "Mapa de archivos" de la doc del módulo para ir
   directo a los archivos correctos. No explores el árbol a ciegas ni hagas greps
   exploratorios para lo que la doc ya mapea.

Si la doc del módulo está desactualizada respecto al código: el código manda, y **corriges la
doc en el mismo cambio**.

---

## El edificio completo (aunque no veas todos los pisos)

El sistema SIEMPRE tiene estos módulos, estén o no en tu disco: `landing`, `pricing`,
`dashboard`, `flashcards`, `pronoun`, `admin` + el shell. Git sparse-checkout oculta o materializa
archivos versionados sin autorizar la eliminación de archivos locales, ignorados o no versionados.
Por eso nunca se cambian perfiles sin autorización. Sus planos siguen en `docs/modules/`.

- **PROHIBIDO concluir "este módulo/archivo no existe"** sin antes comprobar el perfil:
  `./scripts/sparse-module.sh status` (o leer `.branch-profile`). Si el plano lo documenta y
  el disco no lo tiene, está en otro piso del repo, no inexistente.
- ¿Necesitas ese piso? Lee primero su plano. **No cambies el perfil automáticamente**: ejecutar
  `./scripts/sparse-module.sh <módulo>` o `full` requiere autorización explícita del usuario.
- Para razonar sobre un módulo ausente (dependencias, contratos) basta su plano en
  `docs/modules/<módulo>.md`: no necesitas el código en disco para saber qué hace y qué expone.

---

## Hojas de ruta por tarea (síguelas — no deambules por el edificio)

Cada tarea tiene su ruta cerrada: entrada → acceso → piso → herramientas. **Máximo 3-4
documentos.** Todo lo que no está en tu ruta NO se lee salvo dependencia declarada. Paso 0
siempre que la tarea sea de un módulo: consultar `./scripts/sparse-module.sh status`. Solo se
aísla físicamente si el usuario autoriza de forma explícita el cambio de perfil; nunca se poda
automáticamente.

### 🧩 Desarrollar en un módulo — frontend
- **Comprobar**: `./scripts/sparse-module.sh status`; cambiar perfil solo con autorización explícita.
- **Ruta**: `client/GEMINI.md` (completo) → `docs/modules/<módulo>.md` → código de su mapa de archivos.
- **Sube con**: `npm run dev`, dev-guest (`POST /api/auth/dev-guest`), arnés pixel-diff si tocas la tarjeta.
- **NO entres a**: docs de otros módulos, `docs/infrastructure/`, `backend/` (salvo que tu módulo declare la dependencia).

### 🦀 Desarrollar en un módulo — backend/endpoint
- **Comprobar**: `./scripts/sparse-module.sh status`; cambiar perfil solo con autorización explícita.
- **Ruta**: `backend/GEMINI.md` → `docs/modules/<módulo>.md` (contratos e invariantes) → `mod_<x>/` + `api_main` según la receta.
- **Sube con**: `cargo check -p api_main`, `./start.sh`, y al cerrar `./scripts/verify-blueprints.sh`.
- **NO entres a**: `client/` (salvo que toques UI), docs de infra (salvo que el endpoint toque media/deploy).

### 🖥️ Consulta o incidencia de servidores
- **Ruta**: `docs/infrastructure/server_inventory.md` (el dato) → `docs/infrastructure/AI_OPERATIONS_CONTEXT.md` (las reglas) → `media-delivery-cache.md` si aplica. Si la tarea es sobre Oracle
  específicamente (reactivación, historia): `tools/oracle-legacy/README.md`.
- **Sube con**: nada — el dato debe estar en la doc. SSH solo si la doc falla, y entonces la actualizas.
- **NO entres a**: docs de módulos, código de la app.

### 🚀 Pipeline / deploy
- **Ruta**: `docs/infrastructure/pipeline-and-deploy.md` → `docs/AZURE_PIPELINE_GUIDE.md` solo si modificas el YAML de Azure.
- **Sube con**: `azure-pipelines.yml` (el único vigente), `./scripts/cleanup-ado-builds.sh`.
- **NO entres a**: docs de módulos, `docs/archive/`.

### 🗃️ Base de datos
- **Ruta**: `database_schema_diagram.md` → quirks 3.2.3 en `backend/GEMINI.md`. Arquitectura de
  referencia de la DB dedicada (histórica, equivalente a la de GCP hoy):
  `tools/oracle-legacy/ARQUITECTURA_ORACLE_DB.md`.
- **NO entres a**: nada de Postgres como DB del producto (veredicto en `server_inventory.md`).

### 🎨 Generación de audio/imágenes
- **Ruta**: `docs/modules/media-generation.md` → `server_inventory.md` §LocalBuild (GPUs/servicios).
- **NO entres a**: `media-delivery-cache.md` salvo que tu tarea sea la ENTREGA (CDN/caché), no la generación.

### 📦 Promover QA → producción
- **Ruta**: `docs/QA_TO_PROD_FLOW.md`. Nada más.

**Si tu tarea no tiene hoja de ruta aquí**: constrúyela ANTES de abrir archivos usando el
índice maestro de abajo (elige 3-4 docs, en orden) — no explores para "orientarse".

---

## Índice de herramientas compartidas (el martillo del piso 10)

Piezas que viven FUERA de los módulos y que tu tarea puede necesitar. Al armar tu ruta,
revisa esta tabla **de ida** y recoge solo las que tu piso requiere — no las descubras a
mitad de obra ni las busques a ciegas.

| Herramienta | Dónde vive | Cuándo la subes |
|---|---|---|
| Cliente HTTP + JWT | `client/src/services/httpClient.js` | Cualquier llamada API desde frontend (NUNCA fetch directo) |
| Kit de la tarjeta de estudio | `client/src/components/flashcardStudy/` | Tocas la tarjeta — la comparten flashcards Y el demo de landing (`client/GEMINI.md` §4) |
| Contratos entre módulos | `client/src/contracts/` (`courseDirection`, `landingDemoNamespace`, `studyMediaVariants`, `catalogOrder.json`) | Tu módulo consume algo de otro — se pasa por contrato, jamás por import directo |
| uiBridge (acciones de la tarjeta) | `client/src/components/flashcardStudy/uiBridge.js` | Catálogo/tour invocan acciones de la tarjeta activa — los nombres son contrato |
| Contexts canónicos de estudio | `client/src/components/flashcardStudy/context/flashcardStudyContext.js` | Exponer algo nuevo a la tarjeta (patrón puente, no crear contexts) |
| Sesión/estado global | `client/src/context/` (`AuthContext`, `UIContext` — ojo: `language` ≠ `studyLanguage`) | Login, idiomas, diálogos |
| Puertos del dominio (backend) | `backend/core/src/ports/` (`db_repository`, `tutor`, `media_delivery`, `image_compressor`) | Necesitas infra nueva: puerto aquí, adapter en `api_main/src/infrastructure/` |
| DTOs HTTP backend | `api_main/src/api/dto/` + `api/endpoints/*.rs` | Cambias un payload → actualiza el plano del módulo |
| Degradación sin DB | `api_main/src/infrastructure/storage/null_db_repository.rs` | La app debe arrancar sin SurrealDB |
| Versionado de media `?v=` | contrato en `core/src/ports/media_delivery.rs`; reglas en `AI_OPERATIONS_CONTEXT.md` | Cualquier cosa que sirva/cachee imágenes o audio |
| Login dev sin OAuth | `POST /api/auth/dev-guest` (solo dev, rol admin) | Probar cualquier flujo autenticado en local |
| Consultar perfil sparse | `./scripts/sparse-module.sh status` | Paso 0; cambiar perfil requiere autorización explícita |
| Arnés visual pixel-diff | `client/scripts/refactor_visual_shots.py` + `refactor_visual_diff.py` | ANTES y después de cualquier cambio visual en la tarjeta |
| Recorrido E2E total del sitio (1 comando) | `./scripts/test-site-e2e.sh` (spec: `client/e2e/first-login-and-full-navigation.spec.js`) | ANTES de promover a producción: navega todo (onboarding, tour, catálogo, roles admin/premium/user, generación de media con servicios emulados) y falla ante cualquier error de consola/página/API |
| Tests de lógica pura | `client/scripts/test-*.mjs` (`npm test`) | Tocas useCases/rutas/contratos |
| Verificador de planos | `./scripts/verify-blueprints.sh` | SIEMPRE al cerrar trabajo backend (regla de cierre) |
| Test de congruencia imagen-frase (multi-idioma) | `scripts/check_flashcard_images.py` + `scripts/fix_flashcard_image_congruence.py` (skill: [`scripts/flashcard_image_congruence.skill.md`](scripts/flashcard_image_congruence.skill.md)) | Sospecha de imagen equivocada en una tarjeta, o tocas contenido `json/` de más de una dirección de curso |
| Credenciales | `SECRETS_MAP.md` (LOCAL ONLY) | Cualquier acceso a servidores/DB |

La sección "Dependencias" del plano de cada módulo es la versión por-piso de esta tabla:
si tu plano declara una dependencia, esa es tu autorización para bajar a ese piso — y solo a ese.

---

## Regla doc-first de infraestructura (normativa)

- **Regla SRE de Monitoreo en Vivo (Zero-Token-Waste)**: Para preguntas sobre consumo de RAM, CPU, Swap, usuarios activos o seguridad en vivo de los VPS de Fluency:
  **MANDATORIO**: Asumir el rol SRE y usar **PRIMERO** la herramienta MCP `fluency-monitor` (`node tools/fluency-monitor/mcp-server.js` o llamar a las herramientas MCP `get_fluency_server_metrics` / `get_security_alerts`).
  **FALLBACK**: Si y **solo si** la herramienta MCP falla, no responde, o la consulta requiere un diagnóstico muy específico del SO no cubierto por la herramienta, la IA está autorizada a conectarse por SSH manualmente. Ver Skill en [`scripts/sre_fluency_monitor.skill.md`](scripts/sre_fluency_monitor.skill.md).
- **IPs, RAM, CPU, disco, proveedor, usuarios SSH, contenedores** → leer
  [`docs/infrastructure/server_inventory.md`](docs/infrastructure/server_inventory.md) **PRIMERO**.
  **Prohibido conectarse por SSH a consultar el sistema operativo para datos que esa doc ya cubre.**
- SSH/consola es solo **fallback**: cuando la doc no tiene el dato o contradice el runtime.
- Todo lo descubierto por fallback se **guarda en la doc en el mismo cambio** (dato nuevo,
  IP cambiada, discrepancia). La doc se auto-repara con el uso; si no se actualiza, se pudre.
- Antes de cualquier cambio de infraestructura, rendimiento, caché, media o pipeline: lectura
  obligatoria de [`docs/infrastructure/AI_OPERATIONS_CONTEXT.md`](docs/infrastructure/AI_OPERATIONS_CONTEXT.md)
  (presupuesto de RAM, reglas de decisión, errores que no se deben repetir).
- Credenciales y accesos: [`SECRETS_MAP.md`](SECRETS_MAP.md) (LOCAL ONLY, nunca subir a repo público).

---

## Regla de cierre: un trabajo no está terminado hasta testear Y documentar

Como en obra: el acta no se firma sin actualizar los planos as-built. Ciclo obligatorio al
terminar cualquier trabajo:

1. **Testear**: correr los tests que cubren lo tocado (y el arnés visual si aplica).
2. **Documentar en el mismo cambio**: actualizar el plano del módulo
   (`docs/modules/<módulo>.md` — endpoints, mapa de archivos, invariantes) y/o el doc de infra
   que corresponda. La doc desactualizada es peor que la doc ausente.
3. **Verificar los planos**: `./scripts/verify-blueprints.sh` — falla si hay rutas del backend
   sin documentar. Debe salir en verde antes de dar el trabajo por cerrado.

**Si los tests pasan pero la realidad falla** (ej.: una conexión que el test no cubre):
ir físicamente al punto (SSH, runtime, navegador), verificar en vivo, arreglar, y cerrar el
ciclo **actualizando la doc Y ajustando el test** para que la próxima vez ese caso lo detecte
el test — no otra visita a la obra. Nunca arreglar en vivo sin dejar rastro en doc + test.

---

## Índice maestro: si vas a X → lee Y

| Tarea | Documento canónico |
|---|---|
| Tocar frontend (`client/`) | [`client/GEMINI.md`](client/GEMINI.md) (alias `client/CLAUDE.md`) — leerlo completo antes |
| Tocar backend (`backend/`) | [`backend/GEMINI.md`](backend/GEMINI.md) (alias `backend/CLAUDE.md`) |
| Trabajar en un módulo de negocio | [`docs/modules/<módulo>.md`](docs/modules/) (paso 3 del protocolo) |
| Generación de audio/imágenes (tooling) | [`docs/modules/media-generation.md`](docs/modules/media-generation.md) |
| CI/CD, pipeline, deploy | [`docs/infrastructure/pipeline-and-deploy.md`](docs/infrastructure/pipeline-and-deploy.md) |
| Promoción QA → producción | [`docs/QA_TO_PROD_FLOW.md`](docs/QA_TO_PROD_FLOW.md) |
| Repo Git, ramas, Azure DevOps | [`docs/DEPLOY_Y_REPOSITORIO.md`](docs/DEPLOY_Y_REPOSITORIO.md) + [`docs/GIT_BRANCHES.md`](docs/GIT_BRANCHES.md) + [`docs/GIT_SPARSE_WORKFLOW.md`](docs/GIT_SPARSE_WORKFLOW.md) |
| Servidores: IPs, specs, hardware | [`docs/infrastructure/server_inventory.md`](docs/infrastructure/server_inventory.md) |
| Restricciones operativas (RAM 1 GB, cachés) | [`docs/infrastructure/AI_OPERATIONS_CONTEXT.md`](docs/infrastructure/AI_OPERATIONS_CONTEXT.md) |
| Base de datos (esquema, SurrealDB) | [`database_schema_diagram.md`](database_schema_diagram.md) |
| Entrega/caché de imágenes y audio | [`docs/infrastructure/media-delivery-cache.md`](docs/infrastructure/media-delivery-cache.md) |
| Dominios y rutas URL | [`docs/MAPA_DOMINIOS.md`](docs/MAPA_DOMINIOS.md) |
| Operaciones rutinarias (limpieza, reset DB) | [`scripts/routine_operations.skill.md`](scripts/routine_operations.skill.md) |
| Skill portable para limpiar historial, artefactos y logs de Azure Pipelines | [`scripts/azure_pipeline_cleanup.skill.md`](scripts/azure_pipeline_cleanup.skill.md) |
| Conexión a nubes (Azure/GCP/AWS) | [`scripts/cloud_connections.skill.md`](scripts/cloud_connections.skill.md) |
| Errores ya resueltos (no tropezar dos veces) | [`scripts/troubleshooting_library.skill.md`](scripts/troubleshooting_library.skill.md) |
| Sincronización rápida de imágenes al servidor real | [`scripts/sync_images_to_oracle.skill.md`](scripts/sync_images_to_oracle.skill.md) (nombre legado, apunta a GCP) |
| Sincronización rápida de JSON al servidor real | [`scripts/sync_json_to_oracle.skill.md`](scripts/sync_json_to_oracle.skill.md) (nombre legado, apunta a GCP) |
| Infraestructura de Oracle archivada / reactivarla | [`tools/oracle-legacy/README.md`](tools/oracle-legacy/README.md) |
| Túnel privado AWS↔Oracle (archivado) | [`tools/oracle-legacy/wireguard-aws-oracle.md`](tools/oracle-legacy/wireguard-aws-oracle.md) |
| Verificar/reparar que cada frase cargue la imagen correcta entre idiomas | [`scripts/flashcard_image_congruence.skill.md`](scripts/flashcard_image_congruence.skill.md) |
| Estructura técnica general (índice de código) | [`CODEBASE.md`](CODEBASE.md) |
| Seguridad (hallazgos y remediación) | [`SECURITY.md`](SECURITY.md) |
| Calidad CSS/estructura frontend (spec) | [`docs/REFACTOR_CSS_SPEC.md`](docs/REFACTOR_CSS_SPEC.md) |

---

## Convenciones del repo

- **Este protocolo tiene a Gemini (Google Gemini / Antigravity) como estándar y base principal**:
  `GEMINI.md` es el archivo canónico físico principal del proyecto. `CLAUDE.md` (Claude) y `AGENTS.md` (Codex/ChatGPT
  y estándar multi-vendor) son symlinks de este archivo para compatibilidad — mismo contenido, cero duplicación.
  Cursor: `.cursorrules` (resumen + puntero aquí). Copilot: `.github/copilot-instructions.md`.
  LLMs web: `llms.txt`. Si editas este archivo, los alias se actualizan solos; los resúmenes
  de Cursor/Copilot solo cambian si cambia el protocolo mismo.
- **Docs en español.** Mantener el idioma al crear o editar documentación.
- **Un canónico por tema.** Los documentos con header `> Canónico: <ruta>` son secundarios:
  ante conflicto, manda el canónico. No dupliques contenido entre docs; enlaza.
- **`docs/archive/` es historia.** No leer para contexto vigente; solo para entender el pasado.
- **El único pipeline vigente es `azure-pipelines.yml`** (el `.bak` archivado es obsoleto).
- **Sparse-checkout**: la IA puede consultar `./scripts/sparse-module.sh status`; activar un módulo
  o usar `full` exige autorización explícita y respaldo previo conforme a la regla absoluta.
- Al terminar un fix no trivial (>10 min o >3 intentos), registrarlo en
  [`scripts/troubleshooting_library.skill.md`](scripts/troubleshooting_library.skill.md).
