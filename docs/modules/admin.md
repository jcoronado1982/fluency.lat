# Module `admin` — Admin Panel and Presence

> ⚠️ **May not be on disk**: the current sparse profile (`dev-flashcards`) excludes the admin frontend.
> To work on it: `./scripts/sparse-module.sh admin` (working branch: `dev-admin`).
> The `admin.profile` runs the app WITHOUT study modules — that combination must continue to function.

## Purpose

Operator panel: user activity (live presence), users by country, daily stats, subscription management, and catalog preference resets.

## Status and Roadmap

- Status: **active**.

## File Map

| Layer | Path | Contents |
|---|---|---|
| Use cases | `backend/mod_shell/src/presence_use_cases.rs`, `subscription_use_cases.rs`, `daily_stats_use_cases.rs` | admin backend lives in the shell (`auth`/`subscriptions` features), not in its own crate |
| Handlers | `backend/api_main/src/api/endpoints/admin.rs`, `admin_users.rs`, `admin_catalog_preferences.rs` | endpoints `/api/admin/*` |
| Frontend Page | `client/src/pages/AdminPage.jsx` | panel (shell page) — orchestrates only, no direct HTTP calls (SRP) |
| Hooks (application) | `client/src/pages/useAdminDashboardData.js` | `useAdminUsersActivity`, `useAdminCountriesStats`, `useAdminDailyStats` — polling + state, consume repository |
| Guard | `client/src/components/common/` (`AdminRoute`) | admin-only access |
| Client presence | `client/src/hooks/usePresence.js` | heartbeat feeding activity |
| Repository | `client/src/repositories/adminRepository.js` | admin HTTP calls |

## Contracts / Endpoints

Require JWT with admin role (`SUPER_ADMIN_EMAIL` automatically gains admin role):

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/users/activity` | User activity/presence |
| GET | `/api/admin/users/countries` | Users by country |
| GET | `/api/admin/stats/daily` | Daily statistics |
| POST | `/api/admin/catalog-preferences/reset` | Bulk reset of catalog preferences |
| GET | `/api/admin/subscriptions` | Subscription list (`subscriptions` feature) |
| POST | `/api/admin/subscriptions/activate` | Activate a subscription |
| POST | `/api/admin/subscriptions/cancel` | Cancel a subscription |

## Flags and Activation

- Cargo feature: `auth` (+ `subscriptions` for subscription management). Minimal build: `cargo build -p api_main --no-default-features --features auth`.
- Vite: `VITE_ENABLE_ADMIN` (opt-out).
- Sparse: `./scripts/sparse-module.sh admin`.

## Module Dependencies

- **shell-auth** ([`shell-auth.md`](shell-auth.md)): entire admin backend IS part of the shell; this module provides UI and guards.
- None with study modules (guaranteed by `admin.profile`).

## Data

SurrealDB: `users`, `subscription`, activity/presence, and daily stats.
See [`database_schema_diagram.md`](../../database_schema_diagram.md).

## How to Test

```bash
./scripts/sparse-module.sh admin
./start.sh
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # dev guest is admin
# UI: admin route inside authenticated shell
```
