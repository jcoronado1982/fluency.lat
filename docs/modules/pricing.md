# Módulo `pricing` — Precios y checkout

## Propósito

Páginas públicas de planes (`/pricing`) y checkout de suscripción (`/checkout`). Es el módulo
frontend más pequeño — la receta de `client/GEMINI.md` lo señala como plantilla para crear módulos nuevos.

## Estado y roadmap

- Estado: **activo** (UI + cobro real). El proveedor de pago es **LemonSqueezy**: `/checkout`
  (requiere login, `ProtectedRoute`) pide al backend una sesión de checkout
  (`POST /api/checkout/session`) y redirige al checkout hospedado por LemonSqueezy
  (`window.location.href = checkout_url`). LemonSqueezy redirige de vuelta a
  `/checkout?status=success` tras el pago. La activación/renovación/cancelación real de la
  suscripción NO ocurre en ese request: llega después, de forma asíncrona, vía webhook
  (`POST /api/webhooks/lemonsqueezy`, ver [`shell-auth.md`](shell-auth.md)) que
  `SubscriptionUseCases::sync_from_webhook` aplica de forma idempotente sobre la tabla
  `subscription` de SurrealDB.
- Detalle de la integración backend (puerto/adapter, mapeo de eventos, decisiones de diseño):
  `backend/api_main/src/infrastructure/payment/lemonsqueezy_provider.rs` y
  `backend/api_main/src/api/endpoints/payments.rs` (comentarios en el propio código).

### Invariantes del cobro (no romper)

1. **La suscripción se ata al email de la CUENTA, no al del comprador.** El checkout viaja con
   `checkout_data.custom.user_email` = email de los claims y LemonSqueezy lo devuelve en
   `meta.custom_data`; el webhook usa ese campo (`account_email_for`) y solo cae a
   `data.attributes.user_email` si falta. El comprador puede cambiar el email en el formulario
   hospedado: sin esto pagaría y nunca se volvería premium.
2. **El `return_url` no sale de un header sin validar.** `resolve_return_origin` acepta el
   `Origin` solo si coincide con `PUBLIC_BASE_URL` o es `localhost`/`127.0.0.1` (desarrollo);
   cualquier otro origen cae a `PUBLIC_BASE_URL` (si no, sería un redirect abierto).
3. **Al usuario NO se le hace esperar por el webhook, ni se le cuenta que existe.**
   `/checkout?status=success` marca premium optimista (`markPremiumPending` →
   `client/src/utils/pendingPremiumStorage.js`, ventana MOMENTÁNEA de 2 min — un webhook normal
   llega en segundos) y entra al dashboard sola a los 5 s (`ENTER_APP_DELAY_MS`): lo justo para
   leer el "¡Pago exitoso!", sin botón que compita con la redirección automática.
   La confirmación sigue sola en `AuthContext`, que reconsulta `/api/auth/me` cada 15 s: si el
   webhook confirma, manda el rol del servidor; si la ventana caduca sin confirmación (el pago
   no prosperó), la marca se borra y los permisos vuelven atrás. Prohibido volver a poner
   mensajes de "activando…"/"está tardando" en esa pantalla.
   El optimismo es solo de UI: el backend sigue siendo la autoridad — `require_premium_role`
   (`api/middleware/auth.rs`) corta cualquier operación premium real sobre el rol efectivo.
   **La marca está atada al email de la cuenta y se borra en todo cierre de sesión** — nunca debe
   sobrevivir a un logout ni cruzarse con otra cuenta que inicie sesión después en el mismo
   navegador. Bug real corregido (ago 2026, reportado como hueco de seguridad): la marca vivía sin
   dueño y `logout()` no la borraba, así que la heredaba la siguiente cuenta (incluido dev-guest).
   Tests de regresión en `context/AuthContext.test.jsx`.
   El borrado NO se cablea desde aquí: lo que muere con la sesión se declara en
   `client/src/utils/sessionStorage.js` (`clearSessionScopedStorage`), que consumen
   `AuthRepository.logout()` y el logout forzado por 401 de `httpClient.js`. Así el transporte no
   conoce conceptos de pagos (DIP) y un módulo nuevo con estado de sesión se agrega en un solo
   sitio. **No volver a importar `pendingPremiumStorage` desde `httpClient`.**
4. **El backend debe compilar sin la feature `subscriptions`** (`cargo check -p api_main
   --no-default-features --features flashcards,auth`), aunque vaya en `default` porque el
   binario de producción se compila sin `--features`.
5. La URL de checkout es un enlace de pago con token: se registra en `debug`, nunca en `info`.

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Frontend | `client/src/modules/pricing/` | `index.jsx` (manifiesto — `/checkout` va detrás de `ProtectedRoute fallbackTo="/login"`: sin sesión redirige a `/login`, no al home público, para no perder la intención de compra), `PricingPage.jsx`, `CheckoutPage.jsx` + `.css`, `translations.js` |
| Retorno post-login | `client/src/utils/postLoginRedirectStorage.js` + `LoginPage.jsx` | el `state.from` de `<Navigate>` puede perderse durante el flujo externo de Google/Apple; sessionStorage es el respaldo (mismo patrón que `demoFeedbackStorage.js`) — sin esto, tras loguearse desde `/checkout` el usuario cae al dashboard en vez de volver al checkout |
| Prioridad checkout > onboarding | `client/src/modules/routingPaths.js` (`isCheckoutIntentPath`, `resolvePostLoginPath`) | política única, testeada en `test-routing-paths.mjs`: un login iniciado para pagar vuelve SIEMPRE al checkout, aunque el usuario tenga onboarding pendiente — la consumen `LoginPage.jsx` (destino post-login) y `ProtectedRoute.jsx` (no desvía `/checkout` a `/onboarding`); el onboarding llega después, al entrar a la app |
| Puertos/adapters | `client/src/modules/pricing/ports/`, `adapters/`, `composition.js` | `checkoutPort.createCheckoutSession(plan)` → `POST /api/checkout/session` vía `httpClient` |
| Activación post-pago | `client/src/utils/pendingPremiumStorage.js` + `context/AuthContext.jsx` (`markPremiumPending`, `refreshUser`, `logout`) + `CheckoutPage.jsx` | premium optimista al volver del pago (atado al email, 2 min), confirmación en segundo plano y borrado en logout; tests en `AuthContext.test.jsx` y `CheckoutPage.test.jsx` |
| Plan activo en el menú | `client/src/modules/pricing/index.jsx` (`floatingMenuItems`) + `dashboard/layout/FloatingMenu.jsx` | ítem sin `onClick` = fila informativa (clase `floatingOptionStatic`), no navegable |
| Config | `client/src/modules/pricing/config/` | navegación pública y catálogo de planes (precios; los variant ID de LemonSqueezy son server-side, no viven aquí) |
| Backend | `backend/core/src/ports/payment.rs` (puerto), `backend/api_main/src/infrastructure/payment/` (`lemonsqueezy_provider.rs`, `null_payment_provider.rs`), `backend/mod_shell/src/subscription_use_cases.rs`, `backend/api_main/src/api/endpoints/payments.rs`, `backend/api_main/src/modules/payments.rs` | checkout + webhook, ver [`shell-auth.md`](shell-auth.md) para el mapa completo del shell |

## Contratos / endpoints

Consume del shell (feature `subscriptions`, ver [`shell-auth.md`](shell-auth.md)):
- `GET /api/subscriptions/me` — no consumido todavía por ningún componente del frontend.
- `POST /api/checkout/session` — `{plan: "monthly"|"annual"}` → `{checkout_url}`. JWT requerido;
  el email de la suscripción sale de los claims, nunca del body.
- `POST /api/webhooks/lemonsqueezy` — lo llama LemonSqueezy directamente, no el frontend.
- `GET /api/auth/me` — vía `useAuth().refreshUser()` (`context/AuthContext.jsx`): la pantalla de
  éxito dispara UN intento inmediato (no espera el resultado) y `AuthContext` reconsulta cada
  15 s en segundo plano mientras dure el premium optimista (invariante 3); el menú flotante
  pinta el plan activo con `subscription.expires_at`. `refreshUser` tiene identidad ESTABLE (no
  depende de `user`, usa un `userRef`): si dependiera, cualquier efecto que la observe se
  reiniciaría en bucle.

## Flags y activación

- Cargo feature backend: `payments`/`subscriptions` (implican el adapter LemonSqueezy — ver
  `backend/GEMINI.md`).
- Vite: `VITE_ENABLE_PAYMENTS` (**opt-out**) → ruta pública `/pricing` y ruta protegida
  `/checkout` (layout `bare` en ambos casos). Deshabilitado hoy en los perfiles `production`,
  `flashcards` y `admin` (`client/env-profiles/`) — activarlo ahí es un cambio de despliegue
  aparte, no cubierto por este módulo.
- Sparse: `./scripts/sparse-module.sh pricing`.

## Dependencias con otros módulos

- **shell-auth** ([`shell-auth.md`](shell-auth.md)): suscripciones, sesión JWT y el puerto de pago.
- Ninguna dependencia con módulos de estudio.

## Datos

SurrealDB: `subscription` (gestionada por el shell, keyed por email — ver
[`database_schema_diagram.md`](../../database_schema_diagram.md)). No hay tabla de eventos de
webhook: cada evento de LemonSqueezy trae el estado completo actual, así que reprocesarlo converge
al mismo `UPSERT`, sin necesidad de deduplicar.

## Cómo probar

```bash
./scripts/sparse-module.sh pricing
cd client && npm run dev     # http://localhost:5173/pricing (público) y /checkout (requiere login)
npm run build                # debe compilar con el módulo activo y desactivado (VITE_ENABLE_PAYMENTS)
npx vitest run src/modules/pricing src/context/AuthContext.test.jsx   # checkout + premium optimista/logout
cd ../backend && cargo nextest run -p api_main
cargo check -p api_main --no-default-features --features flashcards,auth   # sin pagos: debe compilar
```

Checkout real de punta a punta y Callback URL para el webhook de LemonSqueezy (dashboard →
"Add Webhook"): ver el comentario de cabecera de
`backend/api_main/src/api/endpoints/payments.rs` y `LEMON_SQUEEZY_*` en `CODEBASE.md`. En prod:
`https://fluency.lat/api/webhooks/lemonsqueezy`; en local hace falta un túnel (ngrok/cloudflared)
apuntando a `localhost:8081/api/webhooks/lemonsqueezy`, porque LemonSqueezy no puede alcanzar
`localhost` directamente.

### Checklist antes de subir a producción (ago 2026)

Verificado desde este repo: el código compila con y sin `subscriptions`, `subscriptions` va en
`default` (necesario porque `backend/Dockerfile` compila sin `--features`), el webhook de
LemonSqueezy en el dashboard ya apunta a `https://fluency.lat/api/webhooks/lemonsqueezy` (el otro
webhook registrado, a un túnel `trycloudflare.com`, está muerto — era el de dev local, ver
incidente #6 en `troubleshooting_library.skill.md`).

**Verificado y Desplegado en Producción (ago 2026)**:
- Se desplegaron las variables de entorno de **LemonSqueezy (Test Mode)** en el servidor proxy GCP (`35.188.162.50`) en el contenedor `flashcard-backend-node` (`LEMON_SQUEEZY_API_KEY`, `LEMON_SQUEEZY_STORE_ID`, `LEMON_SQUEEZY_VARIANT_MONTHLY`, `LEMON_SQUEEZY_VARIANT_ANNUAL` y `LEMON_SQUEEZY_WEBHOOK_SECRET`).
- Esto permite la demostración del flujo completo de checkout directo en `https://fluency.lat/checkout` mientras la cuenta Live de LemonSqueezy está en proceso de aprobación.
- Cuando la cuenta pase a **Live Mode**, únicamente se actualizarán las 5 variables en el servidor/pipeline con las llaves de producción.

**Gap conocido de QA**: no hay ningún webhook de LemonSqueezy registrado hacia
`qa.fluency.lat` — solo existen el de prod y el túnel muerto de dev. El "Paso 1: Validación en
QA" de [`QA_TO_PROD_FLOW.md`](../QA_TO_PROD_FLOW.md) NO puede validar el tramo del webhook tal
como está configurado hoy (un pago de prueba en QA notificaría a producción, no a QA). Aceptado
por ahora: el alcance actual es solo que funcione en producción.

Cómo confirmar ya en caliente tras el despliegue (sin esperar un pago real): repetir el mismo
reenvío firmado que usé para diagnosticar el incidente #6/#7
(`scripts/troubleshooting_library.skill.md`) contra `https://fluency.lat/api/webhooks/lemonsqueezy`
con una suscripción de prueba de LemonSqueezy, y confirmar en el dashboard de LemonSqueezy
(Webhooks → Recent deliveries) que el intento más reciente da `200`.
