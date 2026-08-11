# Module Registry

Human source of truth. Technical implementation lives in `scripts/module_registry.sh`.

Complete documentation: [docs/ARQUITECTURA_MODULAR.md](../docs/ARQUITECTURA_MODULAR.md)  
Deploy / repo / Azure: [docs/DEPLOY_Y_REPOSITORIO.md](../docs/DEPLOY_Y_REPOSITORIO.md)  
Branches `dev-*` → `dev-full`: [docs/GIT_BRANCHES.md](../docs/GIT_BRANCHES.md)  
Git (`main` / `qa`) + sparse: [docs/GIT_SPARSE_WORKFLOW.md](../docs/GIT_SPARSE_WORKFLOW.md)

## Quick Contract

Read this first when entering the repository:

- The architecture is a **modular monolith** with `shared shell + pluggable modules`.
- The app must launch with **only present and enabled modules**.
- If a module is not present on disk due to `sparse-checkout`, the system must not break: it simply must not register it.
- If a module is disabled by `Cargo feature` or `VITE_ENABLE_*`, it must not break either.
- Modules integrate via `registry`, `ports`, `composition root`, and `manifests`; never via arbitrary cross imports.
- The goal of sparse-checkout is technical and architectural: **AI must only see on disk the module it is working on** plus the shell.

Guaranteed target: a client can purchase only a subset of modules, and the application must compile, launch, and navigate correctly with that combination.

| Module Registry | Frontend `id` | Home Variable |
|-----------------|-----------------|---------------|
| `landing` | `landing` | `VITE_ENABLE_LANDING=true` → public `/` |
| `pricing` | `pricing` | `VITE_ENABLE_PAYMENTS` → public `/pricing` and `/checkout` |
| `dashboard` | `dashboard` | `VITE_ENABLE_DASHBOARD` (opt-out, default on) → `/dashboard` post-login |
| `flashcards` | `flashcards` | `VITE_DEFAULT_MODULE=flashcards` (default) → `/flashcard` if landing exists |
| `pronoun` | `pronoun` | `VITE_DEFAULT_MODULE=pronoun` |

### Routes (With active landing + dashboard)

| URL | Access | Renders |
|-----|--------|-------------|
| `/` | Public | Landing page (marketing) |
| `/pricing` | Public | Plans & Pricing |
| `/checkout` | Public | Subscription checkout |
| `/login` | Public | Google Login |
| `/dashboard` | Authenticated | **Dashboard Home** — hub with access to modules |
| `/flashcard` | Authenticated | Flashcards module (inside shell) |
| `/pronoun-practice`, etc. | Authenticated | Other study modules |

**Post-login:** `getAuthenticatedHomePath()` → `/dashboard` (if dashboard module is on disk and `VITE_ENABLE_DASHBOARD !== 'false'`). If no dashboard, falls back to default module (`/flashcard` or `/` per flags).

## Current Modules

Each module has its own documentation in `docs/modules/` (step 3 of reading protocol in [`GEMINI.md`](../GEMINI.md)): purpose, file map, endpoints, dependencies, and testing guide. **Read ONLY the doc of the module you are working on.**

| Module | Doc | Backend feature | Frontend flags | Goal |
|--------|-----|-----------------|----------------|----------|
| `landing` | [docs/modules/landing.md](../docs/modules/landing.md) | — | `VITE_ENABLE_LANDING=true` (opt-in) | Public page at `/` (marketing, no sidebar) |
| `pricing` | [docs/modules/pricing.md](../docs/modules/pricing.md) | — | `VITE_ENABLE_PAYMENTS` (opt-out) | Public pricing and checkout |
| `dashboard` | [docs/modules/dashboard.md](../docs/modules/dashboard.md) | — | `VITE_ENABLE_DASHBOARD` (opt-out) | Authenticated shell + **home** at `/dashboard` |
| `flashcards` | [docs/modules/flashcards.md](../docs/modules/flashcards.md) | `flashcards` | `VITE_ENABLE_FLASHCARDS` (opt-out) | Flashcards with progress, AVIF images, and Opus audio |
| `pronoun` | [docs/modules/pronoun.md](../docs/modules/pronoun.md) | `pronoun_practice` | `VITE_ENABLE_PRONOUN_REFERENCE` + `VITE_ENABLE_PRONOUN_PRACTICE` | Pronoun reference and guided practice |
| `admin` | [docs/modules/admin.md](../docs/modules/admin.md) | `auth` | `VITE_ENABLE_ADMIN` (opt-out) | Admin panel and presence (sparse profile without study modules) |

Shared shell (auth, tutor, registry, layout): [docs/modules/shell-auth.md](../docs/modules/shell-auth.md).
Media generation tooling (not a registry module): [docs/modules/media-generation.md](../docs/modules/media-generation.md).

## Sparse-Checkout (Physical Isolation for AI)

> **Do not execute automatically.** `status` and `list` are read-only. All commands activating a profile or using `full` require explicit user authorization.

```bash
./scripts/sparse-module.sh landing             # shell + landing only
./scripts/sparse-module.sh pricing             # shell + pricing only
./scripts/sparse-module.sh dashboard           # shell + dashboard (no landing or study)
./scripts/sparse-module.sh pronoun              # shell + pronoun only
./scripts/sparse-module.sh flashcards           # shell + flashcards only
./scripts/sparse-module.sh admin                # shell + admin only
./scripts/sparse-module.sh flashcards pronoun   # both modules
./scripts/sparse-module.sh full                 # full repository
./scripts/sparse-module.sh status               # check active profile
```
