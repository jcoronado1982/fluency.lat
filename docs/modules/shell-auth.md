# Shell compartido y autenticación (`mod_shell` + `core` + registry frontend)

## Propósito

El shell es la base que siempre se entrega con cualquier combinación de módulos: dominio y
puertos (`core`), autenticación Google OAuth→JWT, tutor IA, presencia, suscripciones, experiencia
PWA online-first y el registry/layout del frontend. **No es un módulo de negocio**: es lo que los
módulos enchufan.

## Estado y roadmap

- Estado: **activo** (siempre presente; el sparse-checkout nunca lo excluye).
- Pagos/checkout transaccional: **LemonSqueezy**, ver [`pricing.md`](pricing.md).

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Dominio + puertos | `backend/core/src/domain/`, `backend/core/src/ports/` | modelos (`user.rs`, `flashcard.rs`, `story.rs`), contratos (`db_repository.rs`, `tutor.rs`, `media_delivery.rs`) |
| Auth | `backend/mod_shell/src/auth.rs` | Google/Apple OAuth → JWT; verificación de ID token vía puerto `TokenVerifier` |
| Verificación OAuth | `backend/core/src/ports/token_verifier.rs` + `backend/api_main/src/infrastructure/auth/oauth_token_verifier.rs` | JWKS de Google/Apple, cache 1h, RS256 (`OAuthTokenVerifier`) |
| Tutor IA | `backend/mod_shell/src/tutor_use_cases.rs` + `backend/api_main/src/infrastructure/ai/gemini_grpc_provider.rs` | análisis de errores, explicaciones (Gemini gRPC) |
| Presencia | `backend/mod_shell/src/presence_use_cases.rs` | heartbeat/leave; país de IP vía puerto `GeoIpLookup` |
| Geolocalización IP | `backend/core/src/ports/geo_ip.rs` + `backend/api_main/src/infrastructure/geo/ip_api_lookup.rs` | `IpApiGeoLookup` (ip-api.com, sin API key) |
| Suscripciones | `backend/mod_shell/src/subscription_use_cases.rs` | estado premium; `sync_from_webhook` aplica el estado autoritativo de un webhook externo (idempotente) |
| Pago (LemonSqueezy) | `backend/core/src/ports/payment.rs` + `backend/api_main/src/infrastructure/payment/lemonsqueezy_provider.rs` (+ `null_payment_provider.rs` sin proveedor configurado) | checkout hospedado y cancelación vía API de LemonSqueezy |
| Endpoints de pago | `backend/api_main/src/api/endpoints/payments.rs` + `backend/api_main/src/modules/payments.rs` | `/api/checkout/session`, `/api/webhooks/lemonsqueezy` (verificación HMAC) |
| Stats diarias | `backend/mod_shell/src/daily_stats_use_cases.rs` | métricas admin |
| Composition root | `backend/api_main/src/main.rs` | wiring de adapters + registro de rutas del shell |
| Rutas media estática | `backend/api_main/src/modules/shell.rs` | `/card_images/*`, `/card_audio/*` |
| Handlers | `backend/api_main/src/api/endpoints/` | `auth.rs`, `tutor.rs`, `presence.rs`, `health.rs`, `features.rs`, `notifications.rs`, `feedback.rs`, `assets.rs` |
| Adapters infra | `backend/api_main/src/infrastructure/` | SurrealDB, Gemini, ComfyUI, storage, media_delivery |
| Degradación DB | `backend/api_main/src/infrastructure/storage/null_db_repository.rs` | Null Object si Surreal cae |
| Registry frontend | `client/src/modules/index.js` + `routingPaths.js` | carga de manifiestos por flags |
| Auth frontend | `client/src/context/AuthContext.jsx`, `client/src/pages/LoginPage.jsx`, `client/src/repositories/` | sesión JWT en localStorage |
| HTTP | `client/src/services/httpClient.js` | único cliente HTTP (inyecta Bearer) |
| Layout/shell UI | `client/src/App.jsx`, `client/src/components/shell/`, `client/src/context/UIContext.jsx` | árbol de rutas bare vs app |
| PWA online-first | `client/public/manifest.webmanifest`, `client/public/sw.js`, `client/src/components/pwa/`, `client/public/pwa/` | identidad instalable, navegación network-only, instalación móvil y estado de conectividad |

## Contratos / endpoints (shell)

DTOs en `api_main/src/api/endpoints/auth.rs`:

| Método | Ruta | Auth | Entrada exacta | Qué hace |
|---|---|---|---|---|
| GET | `/api/health`, `/api/features` | no | — | salud y flags activos |
| POST | `/api/auth/google` | no | `{id_token}` (credential de Google) | login → JWT + user |
| POST | `/api/auth/apple` | no | `{id_token, name?}` | login Apple → JWT |
| POST | `/api/auth/dev-guest` | solo dev | — | JWT invitado admin (404 en prod) |
| GET | `/api/auth/me` | JWT | — | perfil actual: `effective_role`, `is_premium`, onboarding, preferencias y `subscription` (`{plan, status, expires_at}` o `null`; solo con la feature `subscriptions`) |
| POST | `/api/auth/onboarding` | JWT | `{completed}` | marca onboarding |
| POST | `/api/auth/catalog-preferences` | JWT | `{catalog_preferences?}` | preferencias de catálogo |
| POST | `/api/auth/study-language` | JWT | `{study_language}` | dirección de curso |
| POST | `/api/analyze-error`, `/api/explain-like-child`, `/api/onboarding-guide` | JWT | ver `endpoints/tutor.rs` | tutor Gemini gRPC |
| POST | `/api/presence/heartbeat`, `/api/presence/leave` | JWT | — | presencia (consume admin) |
| GET | `/api/notifications/events` | JWT | — | SSE (excluido del timeout global) |
| GET/POST | `/api/demo-feedback` | GET no / POST JWT | — | feedback del demo |
| POST | `/api/local-agent/turn` | ⚠️ ver SECURITY.md | — | agente local (hallazgo de seguridad abierto) |
| GET | `/api/subscriptions/me` (feature `subscriptions`) | JWT | — | mi suscripción |
| POST | `/api/checkout/session` (feature `subscriptions`) | JWT | `{plan: "monthly"\|"annual"}` | crea sesión de checkout LemonSqueezy → `{checkout_url}` (email de los claims, no del cliente) |
| POST | `/api/webhooks/lemonsqueezy` (feature `subscriptions`) | firma HMAC-SHA256 (`X-Signature`), no JWT | payload de evento LemonSqueezy | activa/renueva/cancela la suscripción según el evento; la ata a `meta.custom_data.user_email` (email de la cuenta), no al del comprador — invariantes en `pricing.md` |
| GET | `/card_images/*`, `/card_audio/*` | no | path del asset | media estática versionada `?v=` |

Endpoints `/api/admin/*` (incl. `/api/admin/subscriptions` + `activate`/`cancel`): ver [`admin.md`](admin.md).

### Invariantes (no romper)

- El JWT viaja SIEMPRE como `Authorization: Bearer` inyectado por `httpClient.js` — ningún componente añade headers a mano.
- `SUPER_ADMIN_EMAIL` obtiene rol admin automáticamente al primer login.
- `dev-guest` debe responder 404 fuera de desarrollo (`dev_guest_token_allowed()`).
- Sin SurrealDB, auth degrada vía `NullDbRepository`: la app arranca, no explota.
- La PWA es **online-first**: el service worker delega las navegaciones directamente a la red y no
  usa Cache Storage. Tampoco intercepta `/api`, `/json`, `/card_images` o `/card_audio`; abrir otro
  mazo y obtener contenido nuevo requiere conexión.
- `components/pwa/` está separado por responsabilidad única: `registerServiceWorker.js` registra
  el SW solo en builds de producción; `useOnlineStatus.js` sigue la conectividad; `useInstallPrompt.js`
  gobierna `beforeinstallprompt`, el caso iOS (Compartir → Añadir a pantalla de inicio) y el descarte
  de siete días; `PwaNotice`/`OfflineNotice`/`InstallPrompt` son los avisos visuales y
  `PwaExperience.jsx` solo orquesta. La navegación inferior de la app instalada es
  `PwaShellNavigation.jsx` (container montado UNA sola vez en `App.jsx`) + `PwaBottomDock.jsx`
  (presentacional): píldora flotante de cristal translúcido estilo WhatsApp iOS (referencia
  `menu.jpg` en la raíz) con pestañas constantes (Inicio, Estudiar, Categorías, Idioma), pastilla
  clara en la pestaña activa y estado activo por ruta. `manifest.webmanifest` e `index.html` usan
  `theme_color`/fondo `#05070d` para que barra de estado y splash coincidan con el lienzo oscuro.

## Flags y activación

- Cargo features: `auth` (login/presencia/admin), `subscriptions`. Siempre incluidos en los builds de producto.
- El shell frontend no tiene flag: siempre se carga; los módulos se activan con `VITE_ENABLE_*`.

## Dependencias con otros módulos

Ninguna (dirección inversa: los módulos dependen del shell, jamás al revés — regla inviolable).

## Datos

SurrealDB: `users`, `subscription`, presencia/actividad. Ver [`database_schema_diagram.md`](../../database_schema_diagram.md).

## Cómo probar

```bash
./start.sh
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest    # JWT invitado admin en dev
curl -s http://localhost:8081/api/health
cd client && npm run test:routing                        # lógica pura de rutas del registry
cd client && npm run test:pwa                            # manifest, iconos y contrato network-only
cd client && npm run build                               # copia manifest.webmanifest + sw.js a dist
cd client && npm run preview:pwa                         # http://localhost:4173 + proxy backend :8081
# Google OAuth local: autorizar exactamente http://localhost:4173 como JavaScript origin.
# Comprobar instalación, registro del SW, login y aviso offline en Android/iOS.
```
