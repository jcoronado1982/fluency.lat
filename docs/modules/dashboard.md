# Module `dashboard` — Authenticated App Shell + Home

## Purpose

Dual role: (1) **post-login home** at `/dashboard` (hub with access cards to modules, stats, recommendations) and (2) **appShell for the entire authenticated app** — provides `DashboardShell` (sidebar, header, footer, floating menu) inside which other modules render.

## Status and Roadmap

- Status: **active** (opt-out; default on).
- If the module is not on disk or is disabled, the app falls back to `MinimalAppShell` and post-login home shifts to the default module — nothing breaks.

## File Map

| Layer | Path | Contents |
|---|---|---|
| Manifest | `client/src/modules/dashboard/index.jsx` | route `/dashboard`, nav "Dashboard", `appShell: DashboardShell` |
| App Shell | `client/src/modules/dashboard/DashboardShell.jsx` | layout with `<Outlet/>` (stable tree, no remount) |
| Home | `client/src/modules/dashboard/DashboardHome.jsx` + `.css` | post-login hub |
| Layout | `client/src/modules/dashboard/layout/` | Sidebar, Header, Footer, FloatingMenu (256px sidebar + deliberate 260px offset) |
| Data | `client/src/modules/dashboard/ports/`, `adapters/`, `useCases/` (`dashboardProgress.js`), `features/` | stats and recommendations |
| Shell Routing | `client/src/App.jsx`, `client/src/components/routing/SafeRedirect.jsx`, `client/src/components/shell/` | bare vs app routes, fallbacks |

## Contracts / Endpoints

No dedicated endpoints. Consumes flashcards stats (`/api/learning-stats`) and shell session via ports (`ports/`) — never importing internals of other modules.

## Flags and Activation

- Cargo feature: — (frontend only).
- Vite: `VITE_ENABLE_DASHBOARD` (**opt-out**, default on) → `/dashboard` post-login (`getAuthenticatedHomePath()`).
- Sparse: `./scripts/sparse-module.sh dashboard`.

## Module Dependencies

- **shell-auth** ([`shell-auth.md`](shell-auth.md)): session and base layout.
- Contract `client/src/contracts/courseDirection.js` shared with flashcards.

## How to Test

```bash
./scripts/sparse-module.sh dashboard
cd client && npm run dev
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # dev guest login
# UI: http://localhost:5173/dashboard
npm run test:routing    # test login → /dashboard and fallbacks
```
