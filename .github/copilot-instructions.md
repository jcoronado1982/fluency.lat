# Fluency — Instrucciones para asistentes de código

**Protocolo canónico completo: [`GEMINI.md`](../GEMINI.md)** (también accesible como `CLAUDE.md`
o `AGENTS.md` — son alias/symlinks). Léelo antes de trabajar. Resumen mínimo:

1. **Orden de lectura**: `docs/ARQUITECTURA_MODULAR.md` → `modules/README.md` →
   `docs/modules/<módulo>.md` (SOLO el del módulo en que trabajas) → código guiado por su
   "Mapa de archivos". No explores a ciegas.
2. **Doc-first de infraestructura**: IPs/RAM/CPU/proveedor se leen de
   `docs/infrastructure/server_inventory.md` — nunca SSH para datos que la doc ya cubre.
3. **Hechos que no se contradicen**: la DB es SurrealDB 3.2.3 (no PostgreSQL); auth es Google
   OAuth→JWT; frontend React 19 + Vite + CSS vanilla/Modules (**prohibido Tailwind/Sass/MUI**);
   backend Rust/Axum hexagonal.
4. **Sparse-checkout**: si un módulo no está en disco NO es que no exista — comprobar
   `./scripts/sparse-module.sh status`; su plano sigue en `docs/modules/`.
5. **Regla de cierre**: trabajo terminado = testeado + plano del módulo actualizado en el mismo
   cambio + `./scripts/verify-blueprints.sh` en verde.
