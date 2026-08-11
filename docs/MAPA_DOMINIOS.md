# Mapa de Dominios y Rutas

> Canónico para: dominios servidos y rutas URL del frontend. Los mapas de archivos por módulo
> viven en [`docs/modules/`](modules/) (uno por módulo); el registry canónico en
> [`modules/README.md`](../modules/README.md). Última revisión: 2026-07-16.

Antes de editar un módulo, sigue el protocolo de [`GEMINI.md`](../GEMINI.md) y usa sparse-checkout:

```bash
./scripts/sparse-module.sh flashcards   # o landing|pricing|dashboard|pronoun|admin
```

---

## Dominios servidos por Caddy (`infra/proxy/Caddyfile`)

| Dominio | Qué sirve |
|---|---|
| `fluency.lat`, `www.fluency.lat` | Producción Fluency (proxy naranja Cloudflare) |
| `qa.fluency.lat` | Pre-producción (DNS-only, directo al proxy real [hoy GCP, antes Oracle], sin CDN) |
| `theruby.lat` | Portfolio — **fuera del producto Fluency**, mismo Caddy |
| `bill.theruby.lat` / `bill.fluency.lat` | Subdominio portfolio (fuera de Fluency) |
| `talent.theruby.lat` / `talent.fluency.lat` | Subdominio portfolio (fuera de Fluency) |
| `map.theruby.lat` / `map.fluency.lat` | Subdominio portfolio (fuera de Fluency) |

---

## Módulos de negocio (registry)

Tabla canónica (flags, features, estado): [`modules/README.md`](../modules/README.md).
Doc detallada por módulo (propósito, mapa de archivos, endpoints, dependencias):

| Módulo | Doc |
|---|---|
| `landing` | [modules/landing.md](modules/landing.md) |
| `pricing` | [modules/pricing.md](modules/pricing.md) |
| `dashboard` | [modules/dashboard.md](modules/dashboard.md) |
| `flashcards` | [modules/flashcards.md](modules/flashcards.md) |
| `pronoun` | [modules/pronoun.md](modules/pronoun.md) |
| `admin` | [modules/admin.md](modules/admin.md) |
| shell + auth | [modules/shell-auth.md](modules/shell-auth.md) |
| media (tooling) | [modules/media-generation.md](modules/media-generation.md) |

---

## Rutas frontend (referencia rápida)

Lógica pura testeable: `client/src/modules/routingPaths.js`
Resolución en runtime: `client/src/modules/index.js` (`getAuthenticatedHomePath`, `getDefaultAppPath`)

| URL | Quién | Qué muestra |
|-----|--------|-------------|
| `/` | Público | Landing (o módulo default si no hay landing) |
| `/pricing`, `/checkout` | Público | Planes y checkout |
| `/login` | Público | Login Google |
| `/dashboard` | Autenticado | Home del dashboard (hub) |
| `/flashcard` | Autenticado | Módulo flashcards |
| `/pronoun-practice` | Autenticado | Práctica de pronombres |

| Función | Uso |
|---------|-----|
| `getDefaultAppPath()` | Primera ruta pública (landing en `/` o módulo default) |
| `getAuthenticatedHomePath()` | Destino tras login → `/dashboard` si dashboard activo |
| `resolveFallbackPath()` | Rutas desconocidas dentro del shell autenticado |
| `SafeRedirect` | Evita bucles cuando destino === pathname actual |

---

## Infraestructura

- Inventario de servidores (IPs, specs): [`infrastructure/server_inventory.md`](infrastructure/server_inventory.md)
- Pipeline CI/CD: [`infrastructure/pipeline-and-deploy.md`](infrastructure/pipeline-and-deploy.md)
- Código ejecutable: `azure-pipelines.yml`, `start.sh`, `docker-compose.yml`, `infra/proxy/Caddyfile`
