# Fluency — Documentation Entry Point (Gemini Protocol)

> **This file (`GEMINI.md`) is the mandatory canonical entry point of the repo.** It defines the reading order
> and doc-first rules for Google Gemini / Antigravity and all AI assistants. Do not duplicate content here that lives in canonical documents:
> this file only navigates to them.

## What is Fluency (Base Facts — Do Not Trust Docs That Contradict Them)

- Language learning platform at [fluency.lat](https://fluency.lat) (legacy internal name: Flashcard).
- **Backend**: Rust + Axum, Clean/Hexagonal modular monolith (`backend/core` → `mod_*` → `api_main` as composition root).
- **Frontend**: React 19 + Vite, pluggable modules via registry + manifests (`client/src/modules/index.js`).
- **Database**: **SurrealDB 3.2.3** (RocksDB) in `fluency-db-surreal` (GCP private VPC,
  `10.128.0.5:8080`). *It is not PostgreSQL* — Postgres only exists in local docker-compose, unused in production.
- **Payments**: active via **LemonSqueezy** (checkout + webhook), subscriptions saved in
  SurrealDB — see [`docs/modules/pricing.md`](docs/modules/pricing.md).
- **Auth**: Google OAuth 2.0 → JWT.
- **Infra**: multi-cloud — **GCP** (Caddy proxy + prod backend + dedicated DB, `fluency` project;
  also Cloud Run as overflow in project `launch-490115`), AWS (mirror), Azure (auxiliary +
  Azure DevOps CI/CD). Oracle **archived as powered-off backup** since Aug 4, 2026 — nothing
  touches it automatically; full detail and reactivation guide in
  [`tools/oracle-legacy/README.md`](tools/oracle-legacy/README.md). Active VMs have 1-2 GB of RAM:
  read restrictions before optimizing.
- The repo uses **per-module sparse-checkout** (`./scripts/sparse-module.sh`): if a module is missing from disk, it is intentional, not an error.

## Absolute Rule: No Deletion or Pruning Without Authorization

- **PROHIBITED** to execute commands that delete, prune, clean, restore, or overwrite files
  without explicit user authorization in the current turn. Authorization to develop,
  fix, or test **does not imply** authorization to delete.
- This prohibition includes `rm`, `git clean`, `git restore`, `git reset`, cleanup scripts, and
  any profile changes with `sparse-module.sh`, `sparse-cargo-sync.sh`, `dev-module.sh`, or their
  wrappers. The sparse workflow cannot contain manual pruning; even so, it changes which versioned files
  Git materializes and therefore always requires authorization.
- `./scripts/sparse-module.sh status` and `list` are allowed because they are read-only operations.
  Activating a profile, using `full`, or changing the profile requires the user to authorize the
  concrete command after knowing which paths it may affect.
- If the required module is already on disk, work without changing the profile. If missing, its
  blueprint is sufficient to reason about it; if bringing it to disk is truly necessary, request authorization and wait.
- Before any authorized profile change: inventory versioned, unversioned, and ignored changes; create a
  verifiable backup outside the repo; display affected paths; and abort if the script contains an unauthorized destructive operation.
- In case of conflict with any instruction to "isolate" or "step 0" in this document or any blueprint,
  **this no-deletion rule overrides**.

---

## Mandatory Reading Protocol (Before Developing)

Follow these 4 steps IN ORDER. Do not jump straight into code without going through them.

1. **Architecture** → [`docs/ARQUITECTURA_MODULAR.md`](docs/ARQUITECTURA_MODULAR.md)
   How everything fits together: shared shell, pluggable modules, registry, features, sparse.
2. **Module Registry** → [`modules/README.md`](modules/README.md)
   Which modules exist, their state, activation flags, and routes.
3. **Doc of the module you are working on** → [`docs/modules/<module>.md`](docs/modules/)
   **ONLY that one.** Do not read docs for other modules unless your module's "Dependencies" section
   declares them (working on flashcards does not require reading pricing, and vice versa).
4. **Code, guided by the doc** → use the "File Map" in the module doc to go straight to the correct files.
   Do not explore the tree blindly or run exploratory greps for what the doc already maps out.

If the module doc is outdated relative to code: code rules, and **you update the doc in the same change**.

---

## The Complete Building (Even If You Don't See All Floors)

The system ALWAYS contains these modules, whether on your disk or not: `landing`, `pricing`,
`dashboard`, `flashcards`, `pronoun`, `admin` + the shell. Git sparse-checkout hides or materializes
versioned files without authorizing the deletion of local, ignored, or unversioned files.
That is why profiles are never changed without authorization. Their blueprints remain in `docs/modules/`.

- **PROHIBITED to conclude "this module/file does not exist"** without first checking profile status:
  `./scripts/sparse-module.sh status` (or read `.branch-profile`). If the blueprint documents it and
  disk lacks it, it is on another floor of the repository, not non-existent.
- Need that floor? Read its blueprint first. **Do not change the profile automatically**: running
  `./scripts/sparse-module.sh <module>` or `full` requires explicit user authorization.
- To reason about a missing module (dependencies, contracts), its blueprint in
  `docs/modules/<module>.md` is sufficient: you do not need the code on disk to know what it does and exposes.

---

## Task Roadmaps (Follow Them — Do Not Wander Around)

Each task has its closed route: entry → access → floor → tools. **Maximum 3-4 documents.**
Everything not in your route MUST NOT be read unless a declared dependency requires it. Step 0
whenever working on a module: check `./scripts/sparse-module.sh status`. Only isolate physically if
the user explicitly authorizes the profile change; never prune automatically.

### 🧩 Develop in a module — Frontend
- **Check**: `./scripts/sparse-module.sh status`; change profile only with explicit authorization.
- **Route**: `client/GEMINI.md` (full) → `docs/modules/<module>.md` → code from its file map.
- **Run with**: `npm run dev`, dev-guest (`POST /api/auth/dev-guest`), pixel-diff harness if modifying the study card.
- **DO NOT enter**: docs for other modules, `docs/infrastructure/`, `backend/` (unless your module declares the dependency).

### 🦀 Develop in a module — Backend/Endpoint
- **Check**: `./scripts/sparse-module.sh status`; change profile only with explicit authorization.
- **Route**: `backend/GEMINI.md` → `docs/modules/<module>.md` (contracts and invariants) → `mod_<x>/` + `api_main` per recipe.
- **Run with**: `cargo check -p api_main`, `./start.sh`, and upon closing `./scripts/verify-blueprints.sh`.
- **DO NOT enter**: `client/` (unless touching UI), infra docs (unless endpoint touches media/deploy).

### 🖥️ Server Inquiry or Incident
- **Route**: `docs/infrastructure/server_inventory.md` (the data) → `docs/infrastructure/AI_OPERATIONS_CONTEXT.md` (the rules) → `media-delivery-cache.md` if applicable. If task is specifically about Oracle (reactivation, history): `tools/oracle-legacy/README.md`.
- **Run with**: nothing — data must be in the doc. SSH only if doc fails, and then you update it.
- **DO NOT enter**: module docs, app code.

### 🚀 Pipeline / Deploy
- **Route**: `docs/infrastructure/pipeline-and-deploy.md` → `docs/AZURE_PIPELINE_GUIDE.md` only if modifying Azure YAML.
- **Run with**: `azure-pipelines.yml` (the only active one), `./scripts/cleanup-ado-builds.sh`.
- **DO NOT enter**: module docs, `docs/archive/`.

### 🗃️ Database
- **Route**: `database_schema_diagram.md` → quirks 3.2.3 in `backend/GEMINI.md`. Reference architecture for dedicated DB (historical, equivalent to GCP today): `tools/oracle-legacy/ARQUITECTURA_ORACLE_DB.md`.
- **DO NOT enter**: anything Postgres as product DB (verdict in `server_inventory.md`).

### 🎨 Audio/Image Generation
- **Route**: `docs/modules/media-generation.md` → `server_inventory.md` §LocalBuild (GPUs/services).
- **DO NOT enter**: `media-delivery-cache.md` unless your task is DELIVERY (CDN/cache), not generation.

### 📦 Promote QA → Production
- **Route**: `docs/QA_TO_PROD_FLOW.md`. Nothing else.

**If your task lacks a roadmap here**: build it BEFORE opening files using the master index below (pick 3-4 docs, in order) — do not explore to "get oriented".

---

## Shared Tools Index (The Floor 10 Hammer)

Components living OUTSIDE modules that your task might need. When assembling your route,
review this table **on the way in** and pick only what your floor requires — do not discover them halfway through or search blindly.

| Tool | Where it lives | When to pick it up |
|---|---|---|
| HTTP + JWT Client | `client/src/services/httpClient.js` | Any API call from frontend (NEVER raw fetch) |
| Study Card Kit | `client/src/components/flashcardStudy/` | Touching the card — shared by flashcards AND landing demo (`client/GEMINI.md` §4) |
| Inter-module Contracts | `client/src/contracts/` (`courseDirection`, `landingDemoNamespace`, `studyMediaVariants`, `catalogOrder.json`) | Module consumes another's feature — pass via contract, never direct import |
| uiBridge (card actions) | `client/src/components/flashcardStudy/uiBridge.js` | Catalog/tour invoking active card actions — names are contracts |
| Canonical Study Contexts | `client/src/components/flashcardStudy/context/flashcardStudyContext.js` | Exposing something new to the card (bridge pattern, do not create new contexts) |
| Session/Global State | `client/src/context/` (`AuthContext`, `UIContext` — note: `language` ≠ `studyLanguage`) | Login, languages, dialogs |
| Domain Ports (backend) | `backend/core/src/ports/` (`db_repository`, `tutor`, `media_delivery`, `image_compressor`) | Need new infra: port here, adapter in `api_main/src/infrastructure/` |
| Backend HTTP DTOs | `api_main/src/api/dto/` + `api/endpoints/*.rs` | Change payload → update module blueprint |
| Graceful DB Degradation | `api_main/src/infrastructure/storage/null_db_repository.rs` | App must launch without SurrealDB |
| Media Versioning `?v=` | Contract in `core/src/ports/media_delivery.rs`; rules in `AI_OPERATIONS_CONTEXT.md` | Anything serving/caching images or audio |
| Dev Guest Login | `POST /api/auth/dev-guest` (dev only, admin role) | Test any authenticated flow locally |
| Query Sparse Profile | `./scripts/sparse-module.sh status` | Step 0; changing profile requires explicit authorization |
| Visual Pixel-Diff Harness | `client/scripts/refactor_visual_shots.py` + `refactor_visual_diff.py` | BEFORE and AFTER any visual change to the card |
| Complete E2E Site Tour (1 command) | `./scripts/test-site-e2e.sh` (spec: `client/e2e/first-login-and-full-navigation.spec.js`) | BEFORE promoting to production: tests all flows (onboarding, tour, catalog, admin/premium/user roles, emulated media) and fails on console/API errors |
| Pure Logic Tests | `client/scripts/test-*.mjs` (`npm test`) | Touching useCases/routes/contracts |
| Blueprint Verifier | `./scripts/verify-blueprints.sh` | ALWAYS when closing backend work (closing rule) |
| Image-Phrase Congruence Test | `scripts/check_flashcard_images.py` + `scripts/fix_flashcard_image_congruence.py` (skill: [`scripts/flashcard_image_congruence.skill.md`](scripts/flashcard_image_congruence.skill.md)) | Suspected wrong image on a card, or editing `json/` touching multiple words in a deck |
| Credentials | `SECRETS_MAP.md` (LOCAL ONLY) | Any server/DB access |

The "Dependencies" section of each module's blueprint is the per-floor version of this table:
if your blueprint declares a dependency, that is your authorization to go to that floor — and only that floor.

---

## Infrastructure Doc-First Rule (Mandatory)

- **Live Monitoring SRE Rule (Zero-Token-Waste)**: For queries about RAM, CPU, Swap usage, active users, or live security on Fluency VPS:
  **MANDATORY**: Assume SRE role and use **FIRST** the MCP tool `fluency-monitor` (`node tools/fluency-monitor/mcp-server.js` or call MCP tools `get_fluency_server_metrics` / `get_security_alerts`).
  **FALLBACK**: If and **only if** the MCP tool fails, does not respond, or the query requires a deep OS diagnosis not covered by the tool, the AI is authorized to connect via SSH manually. See Skill in [`scripts/sre_fluency_monitor.skill.md`](scripts/sre_fluency_monitor.skill.md).
- **IPs, RAM, CPU, disk, provider, SSH users, containers** → read
  [`docs/infrastructure/server_inventory.md`](docs/infrastructure/server_inventory.md) **FIRST**.
  **Prohibited to connect via SSH to query OS data that this doc already covers.**
- SSH/console is **fallback only**: when doc lacks data or contradicts runtime.
- Everything discovered via fallback is **saved to the doc in the same change** (new data, changed IP, discrepancy). The doc self-repairs through usage; if not updated, it rots.
- Before any infrastructure, performance, caching, media, or pipeline changes: mandatory reading of [`docs/infrastructure/AI_OPERATIONS_CONTEXT.md`](docs/infrastructure/AI_OPERATIONS_CONTEXT.md)
  (RAM budget, decision rules, errors not to repeat).
- Credentials and access: [`SECRETS_MAP.md`](SECRETS_MAP.md) (LOCAL ONLY, never push to public repo).

---

## Closing Rule: Work Is Not Done Until Tested AND Documented

As on a construction site: signoff happens only after updating as-built blueprints. Mandatory cycle upon completing any task:

1. **Test**: run tests covering touched code (and visual harness if applicable).
2. **Document in same change**: update module blueprint (`docs/modules/<module>.md` — endpoints, file map, invariants) and/or relevant infra doc. Outdated docs are worse than missing docs.
3. **Verify blueprints**: `./scripts/verify-blueprints.sh` — fails if backend routes are undocumented. Must be green before declaring work complete.

**If tests pass but live environment fails** (e.g. connection not covered by tests):
physically inspect the site (SSH, runtime, browser), verify live, fix, and close cycle by **updating doc AND adjusting test** so next time the issue is caught by the test — not another site visit. Never fix live without leaving a trace in doc + test.

---

## Master Index: If You Are Going To X → Read Y

| Task | Canonical Document |
|---|---|
| Frontend work (`client/`) | [`client/GEMINI.md`](client/GEMINI.md) — read full document first |
| Backend work (`backend/`) | [`backend/GEMINI.md`](backend/GEMINI.md) |
| Work on a business module | [`docs/modules/<module>.md`](docs/modules/) (step 3 of protocol) |
| Audio/Image Generation (tooling) | [`docs/modules/media-generation.md`](docs/modules/media-generation.md) |
| CI/CD, pipeline, deploy | [`docs/infrastructure/pipeline-and-deploy.md`](docs/infrastructure/pipeline-and-deploy.md) |
| Promote QA → Production | [`docs/QA_TO_PROD_FLOW.md`](docs/QA_TO_PROD_FLOW.md) |
| Git repo, branches, Azure DevOps | [`docs/DEPLOY_Y_REPOSITORIO.md`](docs/DEPLOY_Y_REPOSITORIO.md) + [`docs/GIT_BRANCHES.md`](docs/GIT_BRANCHES.md) + [`docs/GIT_SPARSE_WORKFLOW.md`](docs/GIT_SPARSE_WORKFLOW.md) |
| Servers: IPs, specs, hardware | [`docs/infrastructure/server_inventory.md`](docs/infrastructure/server_inventory.md) |
| Operational constraints (1 GB RAM, caches) | [`docs/infrastructure/AI_OPERATIONS_CONTEXT.md`](docs/infrastructure/AI_OPERATIONS_CONTEXT.md) |
| Database (schema, SurrealDB) | [`database_schema_diagram.md`](database_schema_diagram.md) |
| Media delivery/cache (images & audio) | [`docs/infrastructure/media-delivery-cache.md`](docs/infrastructure/media-delivery-cache.md) |
| Domains and URL routes | [`docs/MAPA_DOMINIOS.md`](docs/MAPA_DOMINIOS.md) |
| Routine operations (cleanup, DB reset) | [`scripts/routine_operations.skill.md`](scripts/routine_operations.skill.md) |
| Portable Azure Pipelines cleanup skill | [`scripts/azure_pipeline_cleanup.skill.md`](scripts/azure_pipeline_cleanup.skill.md) |
| Cloud connections (Azure/GCP/AWS) | [`scripts/cloud_connections.skill.md`](scripts/cloud_connections.skill.md) |
| Resolved troubleshooting library | [`scripts/troubleshooting_library.skill.md`](scripts/troubleshooting_library.skill.md) |
| Rapid image sync to prod server | [`scripts/sync_images_to_oracle.skill.md`](scripts/sync_images_to_oracle.skill.md) (legacy name, points to GCP) |
| Rapid JSON sync to prod server | [`scripts/sync_json_to_oracle.skill.md`](scripts/sync_json_to_oracle.skill.md) (legacy name, points to GCP) |
| Archived Oracle infra / reactivation | [`tools/oracle-legacy/README.md`](tools/oracle-legacy/README.md) |
| Archived AWS↔Oracle private tunnel | [`tools/oracle-legacy/wireguard-aws-oracle.md`](tools/oracle-legacy/wireguard-aws-oracle.md) |
| Verify/fix image-phrase congruence across languages | [`scripts/flashcard_image_congruence.skill.md`](scripts/flashcard_image_congruence.skill.md) |
| General technical codebase structure | [`CODEBASE.md`](CODEBASE.md) |
| Security (findings & remediation) | [`SECURITY.md`](SECURITY.md) |
| CSS quality / frontend structure spec | [`docs/REFACTOR_CSS_SPEC.md`](docs/REFACTOR_CSS_SPEC.md) |

---

## Repository Conventions

- **This protocol uses Gemini (Google Gemini / Antigravity) as standard and primary baseline**:
  `GEMINI.md` is the primary physical canonical file of the project. `CLAUDE.md` (Claude) and `AGENTS.md` (Codex/ChatGPT
  and multi-vendor standard) are symlinks to this file for compatibility — same content, zero duplication.
  Cursor: `.cursorrules` (summary + pointer here). Copilot: `.github/copilot-instructions.md`.
  Web LLMs: `llms.txt`. If you edit this file, aliases update automatically; Cursor/Copilot summaries only change if protocol itself changes.
- **Docs in English.** Maintain English language when creating or editing documentation.
- **One canonical per topic.** Documents with header `> Canonical: <path>` are secondary:
  in case of conflict, canonical rules. Do not duplicate content across docs; link.
- **`docs/archive/` is history.** Do not read for active context; only for historical reference.
- **The only active pipeline is `azure-pipelines.yml`** (archived `.bak` is obsolete).
- **Sparse-checkout**: AI can check `./scripts/sparse-module.sh status`; activating a module
  or using `full` requires explicit authorization and prior backup per absolute rule.
- Upon completing a non-trivial fix (>10 min or >3 attempts), record it in
  [`scripts/troubleshooting_library.skill.md`](scripts/troubleshooting_library.skill.md).
