# Module `pricing` — Plans and Checkout

## Purpose

Public plan pages (`/pricing`) and subscription checkout (`/checkout`). Smallest frontend module — referenced in `client/GEMINI.md` as a template for new modules.

## Status and Roadmap

- Status: **active** (UI + real payments). Payment provider is **LemonSqueezy**: `/checkout` (requires login, `ProtectedRoute`) requests a checkout session from the backend (`POST /api/checkout/session`) and redirects to LemonSqueezy hosted checkout (`window.location.href = checkout_url`). LemonSqueezy redirects back to `/checkout?status=success` after payment. Real subscription activation occurs asynchronously via webhook (`POST /api/webhooks/lemonsqueezy`).
- Backend integration details: `backend/api_main/src/infrastructure/payment/lemonsqueezy_provider.rs`.

### Payment Invariants

1. **Subscription attaches to ACCOUNT email, not buyer email.** Checkout passes `checkout_data.custom.user_email` = claims email.
2. **`return_url` validated strictly against `PUBLIC_BASE_URL`**.
3. **Optimistic UI handling** marked via `markPremiumPending` (2 min window) while confirmation completes in background via `/api/auth/me`.
4. **Backend compiles without `subscriptions` feature**.

## File Map

| Layer | Path | Contents |
|---|---|---|
| Frontend | `client/src/modules/pricing/` | `index.jsx` (manifest), `PricingPage.jsx`, `CheckoutPage.jsx` + `.css`, `translations.js` |
| Ports/Adapters | `client/src/modules/pricing/ports/`, `adapters/`, `composition.js` | `checkoutPort.createCheckoutSession(plan)` → `POST /api/checkout/session` |
| Backend | `backend/core/src/ports/payment.rs`, `backend/api_main/src/infrastructure/payment/` | checkout + webhook handling |

## Contracts / Endpoints

- `POST /api/checkout/session` — `{plan: "monthly"|"annual"}` → `{checkout_url}` (JWT required).
- `POST /api/webhooks/lemonsqueezy` — webhook called directly by LemonSqueezy.

## How to Test

```bash
./scripts/sparse-module.sh pricing
cd client && npm run dev     # http://localhost:5173/pricing and /checkout
npx vitest run src/modules/pricing src/context/AuthContext.test.jsx
```
