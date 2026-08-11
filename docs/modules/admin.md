# Módulo `admin` — Panel de administración y presencia

> ⚠️ **Puede no estar en disco**: el perfil sparse actual (`dev-flashcards`) excluye el frontend
> de admin. Para trabajarlo: `./scripts/sparse-module.sh admin` (rama de trabajo: `dev-admin`).
> El perfil `admin.profile` corre la app SIN módulos de estudio — esa combinación debe seguir funcionando.

## Propósito

Panel para el operador: actividad de usuarios (presencia en vivo), usuarios por país, stats
diarias, gestión de suscripciones y reset de preferencias de catálogo.

## Estado y roadmap

- Estado: **activo**.

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Casos de uso | `backend/mod_shell/src/presence_use_cases.rs`, `subscription_use_cases.rs`, `daily_stats_use_cases.rs` | el backend de admin vive en el shell (features `auth`/`subscriptions`), no en crate propio |
| Handlers | `backend/api_main/src/api/endpoints/admin.rs`, `admin_users.rs`, `admin_catalog_preferences.rs` | endpoints `/api/admin/*` |
| Frontend página | `client/src/pages/AdminPage.jsx` | panel (página del shell) — solo orquesta, sin llamadas HTTP directas (SRP) |
| Hooks (aplicación) | `client/src/pages/useAdminDashboardData.js` | `useAdminUsersActivity`, `useAdminCountriesStats`, `useAdminDailyStats` — polling + estado, consumen el repositorio |
| Guard | `client/src/components/common/` (`AdminRoute`) | acceso solo admin |
| Presencia cliente | `client/src/hooks/usePresence.js` | heartbeat que alimenta la actividad |
| Repositorio | `client/src/repositories/adminRepository.js` | llamadas admin |

## Contratos / endpoints

Requieren JWT con rol admin (`SUPER_ADMIN_EMAIL` obtiene el rol automáticamente):

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/admin/users/activity` | actividad/presencia de usuarios |
| GET | `/api/admin/users/countries` | usuarios por país |
| GET | `/api/admin/stats/daily` | estadísticas diarias |
| POST | `/api/admin/catalog-preferences/reset` | reset masivo de preferencias |
| GET | `/api/admin/subscriptions` | lista de suscripciones (feature `subscriptions`) |
| POST | `/api/admin/subscriptions/activate` | activa una suscripción |
| POST | `/api/admin/subscriptions/cancel` | cancela una suscripción |

## Flags y activación

- Cargo feature: `auth` (+ `subscriptions` para la gestión de suscripciones). Build mínimo: `cargo build -p api_main --no-default-features --features auth`.
- Vite: `VITE_ENABLE_ADMIN` (opt-out).
- Sparse: `./scripts/sparse-module.sh admin`.

## Dependencias con otros módulos

- **shell-auth** ([`shell-auth.md`](shell-auth.md)): todo el backend admin ES parte del shell; este módulo aporta la UI y los guards.
- Ninguna con módulos de estudio (garantizado por el perfil `admin.profile`).

## Datos

SurrealDB: `users`, `subscription`, actividad/presencia y stats diarias.
Ver [`database_schema_diagram.md`](../../database_schema_diagram.md).

## Cómo probar

```bash
./scripts/sparse-module.sh admin
./start.sh
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # el guest dev es admin
# UI: ruta de admin dentro del shell autenticado
```
