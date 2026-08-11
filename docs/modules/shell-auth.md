# Shared Shell and Authentication (`mod_shell` + `core` + frontend registry)

## Purpose

The shell is the baseline delivered with any combination of modules: domain and ports (`core`), Google OAuth→JWT authentication, AI tutor, presence, subscriptions, online-first PWA experience, and frontend registry/layout. **It is not a business module**: it is what business modules plug into.

## Status and Roadmap

- Status: **active** (always present; sparse-checkout never excludes it).
- Payments/checkout: **LemonSqueezy**, see [`pricing.md`](pricing.md).

## File Map

| Layer | Path | Contents |
|---|---|---|
| Domain + Ports | `backend/core/src/domain/`, `backend/core/src/ports/` | models (`user.rs`, `flashcard.rs`, `story.rs`), contracts (`db_repository.rs`, `tutor.rs`, `media_delivery.rs`) |
| Auth | `backend/mod_shell/src/auth.rs` | Google/Apple OAuth → JWT; token verification via `TokenVerifier` port |
| OAuth Verification | `backend/core/src/ports/token_verifier.rs` + `backend/api_main/src/infrastructure/auth/oauth_token_verifier.rs` | Google/Apple JWKS, 1h cache, RS256 (`OAuthTokenVerifier`) |
| AI Tutor | `backend/mod_shell/src/tutor_use_cases.rs` + `backend/api_main/src/infrastructure/ai/gemini_grpc_provider.rs` | error analysis, explanations (Gemini gRPC) |
| Presence | `backend/mod_shell/src/presence_use_cases.rs` | heartbeat/leave; IP country via `GeoIpLookup` port |
| Subscriptions | `backend/mod_shell/src/subscription_use_cases.rs` | premium status; `sync_from_webhook` applies authoritative webhook state |
| Payments (LemonSqueezy) | `backend/core/src/ports/payment.rs` + `backend/api_main/src/infrastructure/payment/lemonsqueezy_provider.rs` | hosted checkout and cancellation API |
| Composition Root | `backend/api_main/src/main.rs` | adapter wiring + shell routes registration |
| Frontend Registry | `client/src/modules/index.js` + `routingPaths.js` | manifest loading via flags |
| Frontend Auth | `client/src/context/AuthContext.jsx`, `client/src/pages/LoginPage.jsx` | JWT session in localStorage |

## Contracts / Endpoints (Shell)

| Method | Route | Auth | Inputs | Description |
|---|---|---|---|---|
| GET | `/api/health` | Public | — | Health check |
| GET | `/api/features` | Public | — | Active feature flags |
| POST | `/api/auth/google` | Public | `{id_token}` | Login → JWT + user |
| POST | `/api/auth/apple` | Public | `{id_token, name?}` | Apple login → JWT |
| POST | `/api/auth/dev-guest` | Dev only | — | Admin guest JWT (404 in prod) |
| GET | `/api/auth/me` | JWT | — | Current profile & subscription status |
| POST | `/api/auth/onboarding` | JWT | `{completed}` | Marks onboarding complete |
| POST | `/api/auth/catalog-preferences` | JWT | `{catalog_preferences?}` | Saves user catalog preferences |
| POST | `/api/auth/study-language` | JWT | `{study_language}` | Sets course direction |
| POST | `/api/analyze-error` | JWT | — | Gemini AI error analysis |
| POST | `/api/explain-like-child` | JWT | — | Gemini AI simplified explanation |
| POST | `/api/onboarding-guide` | JWT | — | Gemini AI onboarding guide |
| POST | `/api/presence/heartbeat` | JWT | — | Presence heartbeat |
| POST | `/api/presence/leave` | JWT | — | Presence leave |
| GET | `/api/notifications/events` | JWT | — | SSE notification stream |
| POST | `/api/local-agent/turn` | JWT | — | Local agent turn interaction |
| GET | `/api/subscriptions/me` | JWT | — | Current user subscription details |
| POST | `/api/benchmark/db-cycle` | Admin | — | Database benchmark cycle |
| GET | `/card_images/*` | Public | asset path | Static versioned card images `?v=` |
| GET | `/card_audio/*` | Public | asset path | Static versioned card audio `?v=` |

## Invariants

- JWT is ALWAYS passed as `Authorization: Bearer` injected by `httpClient.js`.
- `SUPER_ADMIN_EMAIL` automatically gains admin role on first login.
- Without SurrealDB, auth degrades gracefully via `NullDbRepository`.

## How to Test

```bash
./start.sh
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest    # dev admin guest JWT
curl -s http://localhost:8081/api/health
cd client && npm run test:routing                        # test routing logic
```
