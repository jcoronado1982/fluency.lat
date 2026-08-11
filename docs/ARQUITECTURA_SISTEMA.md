# Arquitectura de Software

La documentación de arquitectura vive en un único documento canónico:

**[docs/ARQUITECTURA_MODULAR.md](ARQUITECTURA_MODULAR.md)**

Ahí se describe:

- Clean / Hexagonal architecture (backend `core` → `mod_*` → `api_main`)
- Registry modular frontend (`client/src/modules/`)
- Sparse-checkout y aislamiento de contexto para IA
- Features Cargo, flags Vite, y cómo agregar o quitar módulos

Resumen humano del registry: [modules/README.md](../modules/README.md)
