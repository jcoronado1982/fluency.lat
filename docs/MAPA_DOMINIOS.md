# Domain and Route Map

> Canonical for: served domains and frontend URL routes. Per-module file maps live in [`docs/modules/`](modules/); canonical registry in [`modules/README.md`](../modules/README.md).

Before editing a module, follow the protocol in [`GEMINI.md`](../GEMINI.md) and use sparse-checkout:

```bash
./scripts/sparse-module.sh flashcards   # or landing|pricing|dashboard|pronoun|admin
```

---

## Domains Served by Caddy (`infra/proxy/Caddyfile`)

| Domain | What it Serves |
|---|---|
| `fluency.lat`, `www.fluency.lat` | Fluency Production (Cloudflare proxy) |
| `qa.fluency.lat` | Pre-production (DNS-only, direct to prod proxy [GCP today], no CDN) |
| `theruby.lat` | Portfolio — **outside Fluency product**, same Caddy |

---

## Business Modules (Registry)

Canonical table (flags, features, status): [`modules/README.md`](../modules/README.md).
Detailed module documentation (purpose, file map, endpoints, dependencies):

| Module | Doc |
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

## Frontend Routes (Quick Reference)

Pure testable logic: `client/src/modules/routingPaths.js`  
Runtime resolution: `client/src/modules/index.js` (`getAuthenticatedHomePath`, `getDefaultAppPath`)

| URL | Access | Renders |
|-----|--------|-------------|
| `/` | Public | Landing page (or default module if landing disabled) |
| `/pricing`, `/checkout` | Public | Plans & checkout |
| `/login` | Public | Google Login |
| `/dashboard` | Authenticated | Dashboard Home (hub) |
| `/flashcard` | Authenticated | Flashcards module |
| `/pronoun-practice` | Authenticated | Pronoun practice |

---

## Infrastructure

- Server inventory (IPs, specs): [`infrastructure/server_inventory.md`](infrastructure/server_inventory.md)
- CI/CD Pipeline: [`infrastructure/pipeline-and-deploy.md`](infrastructure/pipeline-and-deploy.md)
- Executable code: `azure-pipelines.yml`, `start.sh`, `docker-compose.yml`, `infra/proxy/Caddyfile`
