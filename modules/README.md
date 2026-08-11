# Registry de Módulos

Fuente de verdad humana. La implementación técnica vive en `scripts/module_registry.sh`.

Documentación completa: [docs/ARQUITECTURA_MODULAR.md](../docs/ARQUITECTURA_MODULAR.md)  
Deploy / repo / Azure: [docs/DEPLOY_Y_REPOSITORIO.md](../docs/DEPLOY_Y_REPOSITORIO.md)  
Ramas `dev-*` → `dev-full`: [docs/GIT_BRANCHES.md](../docs/GIT_BRANCHES.md)  
Git (`main` / `qa`) + sparse: [docs/GIT_SPARSE_WORKFLOW.md](../docs/GIT_SPARSE_WORKFLOW.md)

## Contrato rápido

Lee esto primero si acabas de entrar al repo:

- La arquitectura es **monolito modular** con `shell compartido + módulos enchufables`.
- La app debe arrancar con **solo los módulos presentes y habilitados**.
- Si un módulo no existe en disco por `sparse-checkout`, el sistema no debe romperse: simplemente no debe registrarlo.
- Si un módulo está deshabilitado por `Cargo feature` o `VITE_ENABLE_*`, tampoco debe romperse.
- Los módulos se integran por `registry`, `ports`, `composition root` y `manifests`; no por imports cruzados arbitrarios.
- El objetivo del sparse es técnico y arquitectónico: **la IA solo debe ver en disco el módulo en el que trabaja** además del shell.

Garantía buscada: un cliente puede comprar solo un subconjunto de módulos y la aplicación debe compilar, arrancar y navegar correctamente con esa combinación.

| Módulo registry | Frontend `id` | Variable home |
|-----------------|-----------------|---------------|
| `landing` | `landing` | `VITE_ENABLE_LANDING=true` → `/` público |
| `pricing` | `pricing` | `VITE_ENABLE_PAYMENTS` → `/pricing` y `/checkout` públicos |
| `dashboard` | `dashboard` | `VITE_ENABLE_DASHBOARD` (opt-out, default on) → `/dashboard` tras login |
| `flashcards` | `flashcards` | `VITE_DEFAULT_MODULE=flashcards` (default) → `/flashcard` si hay landing |
| `pronoun` | `pronoun` | `VITE_DEFAULT_MODULE=pronoun` |

### Rutas (con landing + dashboard activos)

| URL | Quién | Qué muestra |
|-----|--------|-------------|
| `/` | Público | Landing (marketing) |
| `/pricing` | Público | Planes y precios |
| `/checkout` | Público | Checkout de suscripción |
| `/login` | Público | Login Google |
| `/dashboard` | Autenticado | **Home del dashboard** — hub con acceso a módulos |
| `/flashcard` | Autenticado | Módulo flashcards (dentro del shell) |
| `/pronoun-practice`, etc. | Autenticado | Otros módulos de estudio |

**Tras login:** `getAuthenticatedHomePath()` → `/dashboard` (si el módulo dashboard está en disco y `VITE_ENABLE_DASHBOARD !== 'false'`). Si no hay dashboard, cae en el módulo por defecto (`/flashcard` o `/` según flags).

El módulo **default** abre en `/` solo cuando **no** hay landing (`VITE_ENABLE_LANDING !== 'true'`). Con landing, flashcards usa `/flashcard`.

```bash
# En client/.env.development o build
VITE_ENABLE_LANDING=true          # / público (landing)
VITE_ENABLE_DASHBOARD=true        # shell + /dashboard tras login
VITE_DEFAULT_MODULE=flashcards   # con landing: flashcards en /flashcard
VITE_DEFAULT_MODULE=pronoun      # práctica o referencia en / (sin landing)
```

## Módulos actuales

Cada módulo tiene su documentación propia en `docs/modules/` (paso 3 del protocolo de
lectura de [`GEMINI.md`](../GEMINI.md)): propósito, mapa de archivos, endpoints, dependencias
y cómo probar. **Lee SOLO la del módulo en que trabajas.**

| Módulo | Doc | Backend feature | Frontend flags | Objetivo |
|--------|-----|-----------------|----------------|----------|
| `landing` | [docs/modules/landing.md](../docs/modules/landing.md) | — | `VITE_ENABLE_LANDING=true` (opt-in) | Página pública en `/` (marketing, sin sidebar) |
| `pricing` | [docs/modules/pricing.md](../docs/modules/pricing.md) | — | `VITE_ENABLE_PAYMENTS` (opt-out) | Precios y checkout público |
| `dashboard` | [docs/modules/dashboard.md](../docs/modules/dashboard.md) | — | `VITE_ENABLE_DASHBOARD` (opt-out) | Shell autenticado + **home** en `/dashboard` (sidebar, header, footer) |
| `flashcards` | [docs/modules/flashcards.md](../docs/modules/flashcards.md) | `flashcards` | `VITE_ENABLE_FLASHCARDS` (opt-out) | Flashcards con progreso, imágenes AVIF y audio Opus |
| `pronoun` | [docs/modules/pronoun.md](../docs/modules/pronoun.md) | `pronoun_practice` | `VITE_ENABLE_PRONOUN_REFERENCE` (opt-out) + `VITE_ENABLE_PRONOUN_PRACTICE` (opt-in) | Referencia y práctica guiada de pronombres |
| `admin` | [docs/modules/admin.md](../docs/modules/admin.md) | `auth` | `VITE_ENABLE_ADMIN` (opt-out) | Panel admin y presencia (perfil sparse sin módulos de estudio) |

Shell compartido (auth, tutor, registry, layout): [docs/modules/shell-auth.md](../docs/modules/shell-auth.md).
Tooling de generación de media (no es módulo del registry): [docs/modules/media-generation.md](../docs/modules/media-generation.md).

## Sparse-checkout (aislamiento físico para IA)

> **No ejecutar automáticamente.** `status` y `list` son de solo lectura. Todos los comandos que
> activan un perfil o usan `full` requieren autorización explícita del usuario porque la
> operación cambia qué archivos versionados materializa Git. La poda manual está prohibida: el
> flujo sparse no puede borrar contenido local no versionado o ignorado. Si el módulo ya está en
> disco, no se cambia el perfil.

```bash
./scripts/sparse-module.sh landing             # solo shell + landing
./scripts/sparse-module.sh pricing             # solo shell + pricing
./scripts/sparse-module.sh dashboard           # shell + dashboard (sin landing ni estudio)
./scripts/sparse-module.sh pronoun              # solo shell + pronoun
./scripts/sparse-module.sh flashcards           # solo shell + flashcards
./scripts/sparse-module.sh admin                # solo shell + admin
./scripts/sparse-module.sh flashcards pronoun   # ambos módulos
./scripts/sparse-module.sh full                 # repo completo
./scripts/sparse-module.sh status               # qué perfil está activo
```

## Build backend por módulo

```bash
# Solo pronombres
cargo build -p api_main --no-default-features --features auth,pronoun_practice

# Solo flashcards (default)
cargo build -p api_main --no-default-features --features auth,flashcards

# Solo admin
cargo build -p api_main --no-default-features --features auth
```

## Exportar entrega

```bash
./scripts/export-module.sh pronoun
./scripts/export-module.sh flashcards
```

## Validar

```bash
./scripts/validate-module.sh pronoun
cd client && npm run test:routing   # lógica pura de rutas (login → /dashboard, fallbacks)
```

## Shell compartido (siempre incluido en sparse/export)

- `backend/core`, `backend/api_main`, `backend/mod_shell`
- `client/src/modules/index.js`, layout, `config/index.js`, `config/api.js`, auth, UI context
- `scripts/`, `modules/`, `docs/ARQUITECTURA_MODULAR.md`

Un módulo nunca se entrega sin shell: eso garantiza compilación y arranque. La ausencia de otros módulos debe degradar el sistema por omisión de registro, no por fallo.

## Capas frontend por módulo (Jun 2026)

Cada módulo bajo `client/src/modules/<nombre>/` sigue:

| Carpeta | Rol |
|---------|-----|
| `ports/` | Contratos (DIP) |
| `adapters/` | HTTP y servicios externos |
| `useCases/` o `queries/` | Lógica de aplicación |
| `composition.js` | Wiring del módulo |
| `domain/` | Datos/modelos estáticos |
| `config/` | Config exclusiva del módulo (`catalogOrder`, `translations`) |
| `context/` | Estado React del módulo |
| `index.jsx` | Manifest del registry |
