# Fluency — Code Assistant Instructions

**Full canonical protocol: [`GEMINI.md`](../GEMINI.md)** (also accessible as `CLAUDE.md` or `AGENTS.md` — symlinks). Read it before working. Minimal summary:

1. **Reading Order**: `docs/ARQUITECTURA_MODULAR.md` → `modules/README.md` → `docs/modules/<module>.md` (ONLY for the module you are working on) → code guided by its "File Map". Do not explore blindly.
2. **Infra Doc-First**: IPs/RAM/CPU/provider are read from `docs/infrastructure/server_inventory.md` — never SSH for data that doc already covers.
3. **Inviolable Facts**: DB is SurrealDB 3.2.3 (not PostgreSQL); auth is Google OAuth→JWT; frontend React 19 + Vite + Vanilla CSS/Modules (**prohibited Tailwind/Sass/MUI**); backend Rust/Axum hexagonal.
4. **Sparse Checkout**: if a module is missing on disk it DOES NOT mean it doesn't exist — check `./scripts/sparse-module.sh status`; its blueprint remains in `docs/modules/`.
5. **Closing Rule**: work done = tested + module blueprint updated in same change + `./scripts/verify-blueprints.sh` passing green.
