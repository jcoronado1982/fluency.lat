# Module `flashcards` — Flashcard Study

## Purpose

Core product module: vocabulary study using flashcards grouped by grammatical categories and language pairs (es_en, en_es, es_de…), featuring user progress tracking (SRS), TTS audio (.ogg Opus), and AI-generated images (.avif).

## Status and Roadmap

- Status: **active** — default product module (`VITE_DEFAULT_MODULE=flashcards`).
- Media generation (audio/images) is cross-cutting tooling: see [`media-generation.md`](media-generation.md).

## File Map

| Layer | Path | Contents |
|---|---|---|
| Domain | `backend/core/src/domain/models/flashcard.rs` | flashcard model |
| DB Port | `backend/core/src/ports/db_repository.rs` | `CardProgressRepository` |
| Use cases | `backend/mod_flashcards/src/lib.rs` | `DeckUseCases` |
| Media Use Cases | `backend/mod_flashcards/src/audio_use_cases.rs`, `image_use_cases.rs` | synthesis/generation — request voice/prompt via `AudioGenerator::pick_voice` / `ImageGenerator::finalize_prompt` (ports) |
| Prompts/Voices | `backend/api_main/src/infrastructure/ai/` | provider-specific content (system prompts, voice names) |
| Batch | `backend/mod_flashcards/src/batch/` | batch media generation |
| Route Registration | `backend/api_main/src/modules/flashcards.rs` | 17 module endpoints |
| Deck Handlers | `backend/api_main/src/api/endpoints/decks.rs` | catalog, progress, stats |
| Media Handlers | `backend/api_main/src/api/endpoints/generation.rs` | resolve/generate/upload/delete |
| Frontend Module | `client/src/modules/flashcards/` | manifest (`index.jsx`), `FlashcardPage.jsx` (orchestrator), `composition.js`, `ports/`, `adapters/`, `useCases/`, `context/`, `features/` |
| Shared UI Kit | `client/src/components/flashcardStudy/` | card shared with landing demo — **read `client/GEMINI.md` §4 before editing** |
| Content | `json/<pair>/<category>/<level>/*.json` | decks (synced to GCP prod proxy) |
| Media | `card_audio/`, `card_images/` | .ogg audio and .avif images per category |
| Image-phrase test | `scripts/check_flashcard_images.py` | deterministic test verifying image-phrase congruence |

## Contracts / Endpoints

Registered in `backend/api_main/src/modules/flashcards.rs`; DTOs in `api_main/src/api/endpoints/decks.rs` and `api_main/src/api/dto/generation.rs`. All require JWT.

### Catalog and Progress (`decks.rs`)

| Method | Route | Inputs | Returns |
|---|---|---|---|
| GET | `/api/categories` | query: `course_direction`, `include_counts` | categories with counts |
| GET | `/api/available-flashcards-files` | query: `course_direction`, `category` | category decks |
| GET | `/api/deck-summaries` | query: `category`, `course_direction?` | deck summaries (`total` and `learned`) |
| GET | `/api/flashcards-data` | query: `user_id`, `category`, `deck`, `course_direction` | deck cards + user progress |
| POST | `/api/update-status` | `{user_id, category, deck, index, learned, course_direction?}` | single card progress |
| POST | `/api/update-batch` | `{user_id, category, deck, course_direction?, cards: [CardUpdateItem]}` | batch card progress |
| POST | `/api/reset-all` | `{user_id, category, deck, course_direction?, scope?, confirm}` | reset progress |
| GET | `/api/srs/due` | query: `course_direction`, `limit` | due SRS cards |
| GET | `/api/learning-stats` | query: `course_direction` | learning statistics |
| GET | `/api/phonics-data` | — | phonics data |
| POST | `/api/study/touch` | — (JWT user) | records study streak |

### Media (`generation.rs`)

| Method | Route | Inputs | Returns |
|---|---|---|---|
| POST | `/api/resolve-audio` | `SynthesizeSpeechBody` | `?v=` URL if audio EXISTS; 404 if not |
| POST | `/api/synthesize-speech` | `SynthesizeSpeechBody` | `{audio_url, voice_name, from_cache}` |
| POST | `/api/resolve-image` | `{category, deck, index, def_index, course_direction?, form?}` | `?v=` URL if image EXISTS; 404 if not |
| POST | `/api/generate-image` | `GenerateImageBody` | `{path}` — Qwen→ComfyUI pipeline |
| POST | `/api/upload-image` | multipart | manual image upload |
| DELETE | `/api/delete-image` | `{category, deck, index, def_index, course_direction?, form?}` | deletes image |
| POST | `/api/delete-audio` | `DeleteAudioBody` | deletes audio |
| DELETE | `/api/delete-definition` | `{category, deck, index, def_index, course_direction?, form?}` | admin-only definition deletion |

### Supported Course Directions

`es_en` (default), `en_es`, and `es_de` (native Spanish → learn German).

**Images DO NOT depend on course direction** (`image_use_cases.rs::global_image_base` shares paths: `category/deck/deck_card_N_defM`). Audio IS namespaced by direction (`card_audio/<direction>/...`).

## Invariants

- **`resolve-*` NEVER generates media** — 404 halts prefetching.
- **`update-batch` is ONE SurrealDB transaction** (`BEGIN…COMMIT`).
- Media URLs return `?v=<mtime>-<size>` query parameter.
- Responsive web images use **768×512 (3:2) AVIF**.

## How to Test

```bash
./scripts/sparse-module.sh flashcards      # isolate module
./start.sh                                 # full local stack
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # login dev guest
cd client && npm test                      # run unit tests
./scripts/test-site-e2e.sh --chromium   # run full site E2E tour (~2 min)
```
