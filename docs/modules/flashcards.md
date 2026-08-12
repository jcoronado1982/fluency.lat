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
| Personal Words Use Case | `backend/mod_flashcards/src/card_creation_use_cases.rs` | `CardCreationUseCases` — "Create word" (see §Personal Words) |
| Word Draft Prompt | `backend/api_main/src/infrastructure/ai/gemini_word_card_prompt.rs` | Gemini system prompt for `AITutor::generate_word_card_draft` |
| Prompts/Voices | `backend/api_main/src/infrastructure/ai/` | provider-specific content (system prompts, voice names) |
| Batch | `backend/mod_flashcards/src/batch/` | batch media generation |
| Route Registration | `backend/api_main/src/modules/flashcards.rs` | 19 module endpoints |
| Deck Handlers | `backend/api_main/src/api/endpoints/decks.rs` | catalog, progress, stats |
| Media Handlers | `backend/api_main/src/api/endpoints/generation.rs` | resolve/generate/upload/delete |
| Personal Words Handlers | `backend/api_main/src/api/endpoints/personal_words.rs` | preview / create / summary / rename (see §Personal Words) |
| Frontend Module | `client/src/modules/flashcards/` | manifest (`index.jsx`), `FlashcardPage.jsx` (orchestrator), `composition.js`, `ports/`, `adapters/`, `useCases/`, `context/`, `features/` |
| Create Word UI | `client/src/modules/flashcards/features/CreateWordModal.jsx` | "+" button in `CategorySelector.jsx` sidebar; the resulting deck merges into the normal grid — no separate tile (see §Personal Words) |
| Personal Deck Merge | `client/src/modules/flashcards/hooks/useDeckSession.js` | prepends the user's personal deck(s) to `deckNames`/`deckSummaries` right after the general catalog loads for a category |
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
| GET | `/api/search-words` | query: `q`, `course_direction?` | matching catalog & personal cards |
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

### Personal Words (`personal_words.rs`)

| Method | Route | Inputs | Returns |
|---|---|---|---|
| POST | `/api/personal-words/preview` | `{word, course_direction?, category_override?, level_override?}` | `{candidates: [{duplicate, category, level, name, is_new_deck, existing_topic_name?}]}` — 1 o 2 candidatos (2 solo si Gemini detecta un segundo uso gramatical común, ej. verbo Y sustantivo), o exactamente 1 si vienen overrides. NO genera imagen/audio, NO guarda nada |
| POST | `/api/personal-words/create` | `{word, course_direction?, category_override?, level_override?}` | `{duplicate, category, level, is_new_deck, card?}` — crea UNA tarjeta; `category_override`/`level_override` fuerzan la clasificación (el frontend siempre los manda al confirmar) |
| GET | `/api/personal-words` | query: `category`, `course_direction?` | `{decks: [{deck, total, learned, topic_name?}]}` (0..3 entries, one per level) |
| POST | `/api/personal-words/rename` | `{category, level, topic_name, course_direction?}` | `{success}` — mazo debe existir ya |

### Supported Course Directions

`es_en` (default), `en_es`, and `es_de` (native Spanish → learn German).

**Images DO NOT depend on course direction** (`image_use_cases.rs::global_image_base` shares paths: `category/deck/deck_card_N_defM`). Audio IS namespaced by direction (`card_audio/<direction>/...`).

## Personal Words ("Create Word")

User-facing feature: a "+" button in `CategorySelector.jsx`'s sidebar opens `CreateWordModal`, where
the user types a single word/phrase — nothing else. Gemini decides EVERYTHING else the student
would not know how to answer (grammatical category, difficulty level); the result is merged into
the **same** browsing grid as the general catalog, not a separate section — "un solo lugar para
buscar el estudiante" (single place for the student to look), explicit user requirement.
`CardCreationUseCases::create_personal_word`:

1. Gates on **admin or premium** role (same criterion as manual image generation).
2. Calls `AITutor::generate_word_card_draft` (Gemini) to detect the grammatical category
   (`nouns`/`verbs`/`adjectives`/…) AND the difficulty level (`1-basic`/`2-intermediate`/
   `3-advanced`, same slugs as the real catalog folders) — the student is NEVER asked either; a
   beginner cannot self-assess level. Returns a `classifications` array (1 or 2 items — a second
   item only when the word has a genuinely common second grammatical use, e.g. verb AND noun, per
   explicit user request: "no enseñamos que es sustantivo si es verbo" — an ambiguous word must not
   be forced into a single category). Each item produces ONE everyday-usage definition, in the
   exact same JSON shape already used by catalog cards (`name`, `phonetic`, `search_term`,
   `is_verb`, `group_name`, `definitions[0]{...}`). With `category_override`/`level_override` (the
   user already picked in the preview step — see §Editable classification below), Gemini is asked
   for exactly one classification written for that specific reading, and the code additionally
   clamps `category`/`level` to the requested values regardless of what Gemini echoed back.
3. Checks for a duplicate (case-insensitive `name`) in the user's personal deck for that
   category+level **before** touching any AI provider — a repeat costs nothing.
4. Generates the image **always via Gemini direct** (`ImageUseCases::generate_and_store_direct_gemini`,
   the `for_raw_phrase` Interactions-API path) — **never** the local Ollama+ComfyUI pipeline, by
   explicit user request; this bypasses the `use_direct_gemini_prod` conditional entirely (that one
   requires `is_production`, this route doesn't). Audio reuses `AudioUseCases::get_or_synthesize_audio`
   unchanged (already Gemini-first via `RoutingTtsProvider`, no local dependency).
5. Appends the card to a **personal, per-user deck** named `<level>/my_words` (same naming
   convention as a real nested deck, e.g. `2-intermediate/action`) and saves it. `category`/`level`
   are consumed to route storage and then dropped — they are NOT persisted as fields on the card
   itself (the level is already encoded in the deck path, exactly like a real nested deck).
   Returns whether this word **created** the deck (`is_new_deck`) — `true` only the very first time
   a user gets a word in a given category+level; if the deck already existed (named or not), the
   word is simply appended and the frontend does not ask anything extra.

### Storage — internal-only namespace, general catalog untouched

`DeckUseCases` (`lib.rs`) caches the shared catalog in RAM once per process
(`OnceCell<CatalogManifest>`, loaded from a precomputed `catalog-manifest.json`). With several
backend nodes running concurrently (GCP, Cloud Run overflow, AWS mirror —
`docs/infrastructure/server_inventory.md`), mutating that cache for a new personal deck would be
inconsistent across nodes — so **`DeckUseCases::list_decks`/`get_deck_summaries` are never touched
or modified**; the general catalog loads exactly as it always did, at the same cost, for every user.

- `card_creation_use_cases::resolve_storage_category(category, deck_name, user_email)` is the
  single rewrite point: if `deck_name`'s last path segment is the sentinel `my_words`
  (`is_personal_deck_name`), it returns the internal namespace
  `personal-<category>-<user_path_segment(email)>` (e.g. `personal-nouns-jesus_example_com`) — a
  **flat slug, no `/`**, intentional: `image_use_cases`/`audio_use_cases` validate `category` with
  `safe_storage_segment` (rejects `/`), while deck JSON storage accepts path-like values with `/`.
  Otherwise it returns `category` untouched. Applied at the top of `DeckUseCases::get_deck_data`/
  `update_card_status`/`update_cards_batch` and `AudioUseCases::get_or_synthesize_audio`/
  `resolve_audio`/`ImageUseCases::get_or_generate_image`/`resolve_image_path` — the sentinel deck
  name (`my_words`, never a real catalog deck, which are named by topic like `action`) is the only
  signal needed; no request needs to say "this is personal" explicitly.
- **The frontend never sees or builds the internal namespace.** `POST /api/personal-words/create`
  returns the REAL `category` (e.g. `"verbs"`) and `level` (e.g. `"1-basic"`); the frontend just
  does `changeCategory(category)` + `changeDeck(`${level}/my_words`)` — same as opening any other
  deck.
- **Discovery is client-side and additive, never blocking the general catalog**
  (`useDeckSession.js`): right after the existing effect that loads `deckNames` for a category
  finishes (`deckNamesCategory === currentCategory`), a separate effect calls
  `GET /api/personal-words` (→ `CardCreationUseCases::personal_words_summaries`, a live read of up
  to 3 files — never the manifest); if the user has any personal deck(s) there, their names are
  **prepended** to `deckNames` (so they show first in the grid — the user just created it and wants
  to study it right away) and their `{total, learned}` merged into `deckSummaries`. If the user has
  none, nothing extra loads — zero cost for the common case. This was a deliberate design choice
  (see git history for `docs/modules/flashcards.md` around this section) after an earlier version
  special-cased personal categories directly inside `list_decks`/`get_deck_summaries`, which added a
  disk read to every category load for every user and — the actual bug that prompted the redesign —
  needed the frontend to hold and pass around the opaque internal namespace string itself.
- Display label: `my_words` maps to `"My words"` in `client/src/contracts/deckOrder.js`
  (`DECK_LABELS`) / `"Mis palabras"` in `deckGroupTranslations.js` — the merged deck renders with a
  normal name, no special styling, **unless** the user gave it a custom name (see below).

### Ordering — personal decks always pinned first

`CategorySelector.jsx`'s nested-deck grid reorders itself using the user's saved
`catalog_preferences` (drag-and-drop order, `applyPreferenceOrder`/`normalizeOrderedItems` in
`config/catalogPreferences.js`). That function pushes any deck NOT present in the saved order to
the end — which silently buried a freshly-created personal deck for any user with an existing
saved order (real bug, found live: word classified correctly, tile never visible without manually
scrolling to the right level AND finding it at the bottom). Fixed by pinning after the preference
reorder: `contracts/deckOrder.js::isPersonalDeckName` (same sentinel check as the backend's
`is_personal_deck_name`) filters `ordered` into personal-first / rest, unconditionally — the user
just created the word and wants to find it immediately, ahead of any saved preference.

### Naming a deck (`topic_name`)

The user can give their personal deck a name (e.g. "Palabras de trabajo") instead of the generic
"My words" label — **only offered once**, right after the word that creates a NEW deck
(`is_new_deck` in the create response); words added to an already-existing deck (named or not)
never re-prompt. Implementation:

- The name is stored as metadata on the deck file itself, not on any card: `DeckData` (the
  existing untagged enum in `core::domain::models::flashcard`) has an `Object { flashcards, extra }`
  variant alongside plain `Array` — `rename_personal_deck` rewrites the deck into
  `Object { flashcards: <unchanged>, extra: {"topic_name": "..."} }`. No schema change needed;
  `flashcards_mut()` works identically on both variants.
- `personal_words_summaries` reads `extra.topic_name` when present (`DeckData::Object`) and
  returns it in `PersonalDeckSummary`/`PersonalDeckSummaryDto`; `None` for a never-named deck
  (still `DeckData::Array`, or `Object` without that key).
- `CategorySelector.jsx` prefers `deckSummaries[deckName]?.topicName` over the generic
  `formatDeckCategoryName` label when present — no special tile, same rendering path.
- `rename_personal_deck` requires the deck to already have at least one card (fails otherwise) and
  uses the same admin/premium gate as creation.

### Preview before generating, with editable classification (`/api/personal-words/preview`)

`CreateWordModal` no longer generates image/audio the instant the user submits a word, and no
longer treats Gemini's classification as final. Explicit user requirement (live feedback,
paraphrased): "we're working with AI — it should be a bit smarter... give the user the ability to
change the level/deck name the AI chose, evaluate this like a human would." Flow:

1. User types the word, submits → frontend calls `POST /api/personal-words/preview` with no
   overrides (`CardCreationUseCases::preview_personal_word` → `classify_and_load`) — runs the
   Gemini classification (1 or 2 candidates) + duplicate check + existing-deck lookup per
   candidate, but stops there: no image, no audio, no write to storage.
2. Each candidate renders as an editable row in `CreateWordModal`: a checkbox (checked by default,
   unless `duplicate`, in which case it's disabled and shows a "Ya la tenés" badge), a category
   `<select>` (`NESTED_LEVEL_CATEGORIES`) and a level `<select>`, both pre-filled with Gemini's
   pick, plus the destination line ("se va a agregar a tu mazo '{name}'..." or "vamos a crear un
   mazo nuevo..."). Changing either `<select>` re-calls the preview endpoint for JUST that row with
   `category_override`/`level_override` set to the new values — Gemini re-writes the
   definition/example for that specific reading instead of just relabeling the old one, and the
   row's destination/duplicate/is_new_deck all refresh to match. A "+ Agregar otra clasificación"
   link lets the user add a row for a category Gemini didn't suggest at all (defaults to the first
   unused category in `NESTED_LEVEL_CATEGORIES`, immediately triggers the same override preview to
   populate it).
3. Confirm creates ONE card per checked, non-duplicate row — sequential calls to
   `POST /api/personal-words/create`, each with that row's `category_override`/`level_override` set
   (the frontend ALWAYS sends both, even for a row the user never touched, so `create_personal_word`
   never has to resolve ambiguity itself — see step 2 of the numbered list above). A failure on one
   row doesn't affect the others; the results screen shows a per-row outcome (created / already
   existed / error) with a "Ver en {category}" button and, for rows that created a brand-new deck,
   their own inline "name this deck" box (see §Naming a deck above, now per-row).

Backend implementation: `classify_and_load` (private) returns `Vec<ClassifiedWord>` and is shared
by `preview_personal_word` (maps the whole vec to `Vec<WordPreview>`) and `create_personal_word`
(takes the first — and, on the real path, only — element). `Self::validate_overrides` rejects a
`category_override` without a matching `level_override` (or vice versa) and unknown category/level
slugs (`PERSONAL_WORD_CATEGORIES`/`PERSONAL_WORD_LEVELS`, both intentional duplicates of the
`api_main`-side constants — `mod_flashcards` cannot depend on `api_main`). No server-side
session/cache for the draft: each preview/create call is a fresh, cheap text-only Gemini call at
low temperature — NOT wired to the image/audio pipeline, so editing a row never costs anything
beyond one small Gemini text call, even if the user changes their mind repeatedly before
confirming.

### Refreshing after creation without leaving the category

Real bug found live: creating a word while **already** browsing its destination category didn't
show the new/updated deck until the user closed and reopened the category selector.
`useDeckSession.js`'s personal-deck-merge effect only depended on `currentCategory` changing — if
the user never left the category, nothing re-triggered it. Fixed with an explicit
`personalWordsRefreshToken` state + `refreshPersonalWords()` callback (exposed from the hook,
added to the effect's dependency array); `CreateWordModal` calls it right after a successful
creation and after successfully naming a deck.

## Word Search and Target Navigation (`GET /api/search-words`)

Search box in `CategorySelector.jsx` sidebar enables instant word lookup across catalog and personal decks:

### Backend Search Engine (`mod_flashcards/src/lib.rs`)
- **Strict Word Matching (`score_card_match`)**: Matches query exclusively against card headword (`resolved_word()`), ignoring example sentences, translations, and search terms.
  - Score `1000`: Exact word match.
  - Score `800`: Word prefix match (`starts_with`).
  - Score `600`: Exact word match inside compound word phrase.
- **Deck Path Normalization**: Returns deck paths stripped of `.json` extensions (e.g. `1-basic/verbs/action`).
- **Composite Deck Filtering**: Skips composite bundle decks containing `_e_` in their filename (e.g. `cause_effect_basics_e_contrast_condition_basics.json`) during catalog scan, avoiding duplicate results for words present in combined group files.
- **Deduplication**: Deduplicates final results by `(category, name.to_lowercase(), level)`.

### Search UI (`CategorySelector.jsx`)
- Displays clean, compact result items showing:
  1. Headword (`cleanWordName`)
  2. Category Badge (`catLabel` with category color dot)
  3. Level Badge (*Básico*, *Intermedio*, *Avanzado*)
  4. Topic Name in Title Case (e.g. *Action*, *Contrast Condition Basics*, *Being State*)
- Omits translations and example sentences to keep search results concise and easy to scan.

### Target Card Navigation (`useDeckSession.js`)
- `changeDeck(newDeck, cardIndex, category, { word })`: Passes target metadata to `pendingTargetCardRef`.
- **`skipNextResetRef` Flag**: Prevents the `resetKey` effect from overriding `currentIndex` back to 0 when opening a target card.
- **`getCardWordString` Headword Resolution**: Resolves headword via `c.name || c.word || c.extra?.name || c.extra?.word` for cards (like `make`, `but`) that store headwords inside `name`.
- **Same-Deck Synchronous Jump (`applyPendingTargetCard`)**: If the selected card belongs to the currently active deck in memory, `changeDeck` positions `currentIndex` synchronously without waiting for network re-fetch.
- **Cross-Category Jump (real bug, fixed)**: `CategorySelector.handleSelectSearchResult` calls `changeCategory(result.category)` *and* `changeDeck(...)` in the same click — the only caller combining both in one shot (every other flow changes category XOR deck, never both). Three independent effects react to the category/deck change and, unguarded, would clobber the pending jump:
  1. The `[currentCategory]` reset effect used to always null `currentDeckName`, discarding the exact deck `changeDeck` had just set — recovery depended on `resolvePersistedChoice` reading `localStorage`, which never resolves personal ("Crear palabra") decks since they aren't part of the catalog's `deckNames`.
  2. `loadDecks`'s deck-resolution (both the preloaded and catalog-fetch branches) unconditionally called `setCurrentDeckName(preferredDeck)` from the persisted/default choice, overwriting the explicit target again.
  3. Every `resetKey` bump (`loadFlashcards` start, and the `[currentCategory, currentDeckName]` reset effect) re-fires the index-reset effect; `skipNextResetRef` only absorbs **one** such bump, but `loadFlashcards` can legitimately run twice for the same target (its `useCallback` depends on `deckNames`, which changes once for the catalog fetch and again when personal decks are prepended) — the second bump lands after `applyPendingTargetCard` already cleared `pendingTargetCardRef` and positioned the card, resetting it back to index 0.

  Fix: all three sites now check `pendingTargetCardRef.current?.category`/`.deck` against the value they're about to act on and skip their side effect (nulling the deck / overriding it / bumping `resetKey`) while a jump for that exact category+deck is in flight. Regression test: `useDeckSession.test.js` › *"salto de búsqueda a un mazo personal en OTRA categoría..."* (uses a stateful `CategoryContext` mock — the other tests in that file freeze `currentCategory`, which is why this cross-category path had no coverage).

## Invariants

- **`resolve-*` NEVER generates media** — 404 halts prefetching.
- **`update-batch` is ONE SurrealDB transaction** (`BEGIN…COMMIT`).
- Media URLs return `?v=<mtime>-<size>` query parameter.
- Responsive web images use **768×512 (3:2) AVIF**.
- **Personal Words image generation is ALWAYS Gemini** (`for_raw_phrase` direct path) — never the
  local Ollama+ComfyUI pipeline, regardless of environment or role.
- **Personal Words dedup runs before any AI provider call** — a duplicate costs nothing.
- **`/api/personal-words/preview` never generates image/audio or writes to storage** — only
  classification (Gemini text) + a read of the existing deck, if any.
- **Gemini may return up to 2 classifications per word, never more, never zero** — a second one
  only for a genuinely common second grammatical use; `/create` always creates exactly ONE card per
  call (the frontend calls it once per row the user kept checked).
- **`category_override`/`level_override` always travel together** (`validate_overrides` rejects one
  without the other) and are clamped onto Gemini's response server-side, not merely requested.
- **The general catalog manifest (`list_decks`/`get_deck_summaries`) is never touched by Personal
  Words** — discovery happens client-side, additively, via a separate `GET /api/personal-words`.
- **The internal personal namespace never crosses the API boundary** — frontend only ever handles
  real category names + the `my_words` sentinel deck name.
- **Personal decks always render first**, regardless of the user's saved catalog order preference
  (`isPersonalDeckName` pin in `CategorySelector.jsx` — see §Ordering above).
- **A deck can only be named after it has at least one word** (`rename_personal_deck` fails on an
  empty/nonexistent deck) — naming is offered exactly once, right after the word that created it.

## How to Test

```bash
./scripts/sparse-module.sh flashcards      # isolate module
./start.sh                                 # full local stack
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # login dev guest
cd client && npm test                      # run unit tests
cargo test -p mod_flashcards card_creation_use_cases resolve_storage_category get_deck_data   # Personal Words unit tests
./scripts/test-site-e2e.sh --chromium   # run full site E2E tour (~2 min)
```
