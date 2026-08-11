# Module `landing` — Public Marketing Page

## Purpose

Public landing page at `/` (layout `bare`, no sidebar): marketing hero + **interactive flashcard demo** without login. Primary conversion entry point for registration/pricing.

## Status and Roadmap

- Status: **active** in production (`VITE_ENABLE_LANDING=true`).
- Off-page SEO: plan in [`../SEO_DISTRIBUTION_PLAN.md`](../SEO_DISTRIBUTION_PLAN.md).

## File Map

| Layer | Path | Contents |
|---|---|---|
| Frontend | `client/src/modules/landing/` | `index.jsx` (manifest), `LandingPage.jsx` + `.css`, `landingSections.js`, `composition.js`, `config/`, `data/`, `styles/` |
| Demo Card | `client/src/modules/landing/features/` | uses shared kit `client/src/components/flashcardStudy/` with `mediaVariant='landing-demo'` |
| Demo Contracts | `client/src/contracts/landingDemoNamespace.js`, `studyMediaVariants.js` | demo namespace and media variant |
| Backend (demo) | no dedicated crate | demo consumes flashcards endpoints with `category='landing-demo'`; demo TTS in `backend/api_main/src/infrastructure/ai/elevenlabs_tts_provider.rs` |
| Demo Audio | `card_audio/landing-demo/` | audio assets copied by pipeline on deploy |

## Contracts / Endpoints

| Method & Route | Auth | Description |
|---|---|---|
| `GET /api/demo-feedback` | Public | `{ summary: { average, count }, reviews[] }` |
| `POST /api/demo-feedback` | JWT | `{ comment, rating, language, source: "landing-demo" }` |
| `POST /api/resolve-audio` | Public (guest allowed) | returns `audio_url`, `voice_name`, `from_cache` for `landing-demo` |
| `POST /api/synthesize-speech` | Public (guest allowed) | synthesizes/retrieves demo audio |
| `POST /api/resolve-image` | Public (guest allowed) | returns `{ path }` for `landing-demo` |
| `POST /api/generate-image` | Public (guest allowed) | returns `{ path }` for `landing-demo` |

## Flags and Activation

- Cargo feature: — (frontend only).
- Vite: `VITE_ENABLE_LANDING=true` (**opt-in**). With landing enabled, flashcards lives at `/flashcard`.
- Sparse: check via `./scripts/sparse-module.sh status`.
- Authenticated user at `/` → redirects to `/dashboard`.

## Module Dependencies

- **`flashcardStudy` Kit** (shell): demo renders the SAME card as flashcards module (`client/GEMINI.md` §4).
- **shell-auth** ([`shell-auth.md`](shell-auth.md)): login/redirects.

## How to Test

```bash
./scripts/sparse-module.sh status
cd client && npm run dev        # http://localhost:5173/ without login
npm test                        # includes landing-demo contracts
```
