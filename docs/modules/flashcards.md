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
| Catalog Search UI | `client/src/modules/flashcards/features/CatalogSearch.jsx` + `.module.css`, `hooks/useCatalogSearch.js` | Pluggable search box + results panel mounted inside `CategorySelector.jsx`'s sidebar (see §Word Search) |
| Catalog Selector Pieces | `features/CategoryHelpPopover.jsx` (grammar help button+popover), `features/CategoryNav.jsx` (sidebar category list), `features/DeckGrid.jsx` (deck/group grid), `hooks/useBottomSheet.js` (PWA drag-to-dismiss), `hooks/useDragReorder.js` (generic HTML5 DnD reorder), `hooks/useLocalCatalogOrder.js` (local group/nested-deck order + persistence) | `CategorySelector.jsx` composes all of these — it only orchestrates (context ↔ hooks ↔ these components), ~300 lines. Each is independently swappable/removable; `CategoryHelpPopover`/`CategoryNav`/`DeckGrid` intentionally still import `CategorySelector.module.css` (its `.helpPopover*`/`.categoryNav`/`.groupsGrid` rules are split across several non-contiguous `@media` blocks — relocating them was judged higher regression risk than the architectural purity gained, since the pixel-diff harness doesn't open the help popover) |
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
| POST | `/api/personal-words/preview` | `{word, course_direction?, category_override?, level_override?, existing_topics?: [{category, level, topic_name?}]}` | `{candidates: [{duplicate, category, level, name, is_new_deck, existing_topic_name?}]}` — 1 o 2 candidatos (2 solo si Gemini detecta un segundo uso gramatical común, ej. verbo Y sustantivo), o exactamente 1 si vienen overrides. `existing_topics` (ignorado si vienen overrides) es la lista COMPLETA de mazos personales del usuario — Gemini la ve entera desde esta MISMA llamada y recomienda el mejor encaje como primera opción, ver §One-call full-topic-list recommendation. NO genera imagen/audio, NO guarda nada |
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
- **The internal namespace must never reach `catalog-manifest.json`** (real bug, fixed): the
  namespace directories (`json/<direction>/personal-<category>-<segment>/`) physically live
  alongside real category directories, so `scripts/generate-catalog-manifest.mjs` — which lists
  every subdirectory as a category — was including them as if they were real, browsable
  categories, visible to **every** user via the single shared static manifest (two categories
  literally showing the reporting user's email-derived segment in their name, e.g.
  `personal-nouns-jesus_example_com`). Fixed at the source (the generator now skips any directory
  starting with `personal-`) AND defensively in `DeckUseCases::catalog_manifest()` (filters the
  same prefix — `card_creation_use_cases::PERSONAL_CATEGORY_PREFIX`, `pub(crate)` for this reason —
  right after loading, so a stale/hand-regenerated manifest can never leak it either). Regression
  test: `catalog_manifest_never_exposes_the_internal_personal_words_namespace` in `lib.rs`. If you
  ever add another internal-only directory convention under `json/<direction>/`, it needs the same
  two-layer exclusion.
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
   overrides but WITH `existing_topics` (see §One-call full-topic-list recommendation below —
   `CardCreationUseCases::preview_personal_word` → `classify_and_load`) — runs the Gemini
   classification (1 or 2 candidates) + duplicate check + existing-deck lookup per candidate, but
   stops there: no image, no audio, no write to storage.
2. Each candidate renders as an editable row in `CreateWordModal`: a checkbox (checked by default,
   unless `duplicate`, in which case it's disabled and shows a "Ya la tenés" badge), a category
   `<select>` (`NESTED_LEVEL_CATEGORIES`) and a **topic** `<select>`, both pre-filled with Gemini's
   pick, plus the destination line ("se va a agregar a tu mazo '{name}'..." or "vamos a crear un
   mazo nuevo..."). Changing either `<select>` re-calls the preview endpoint for JUST that row with
   `category_override`/`level_override` set to the new values — Gemini re-writes the
   definition/example for that specific reading instead of just relabeling the old one, and the
   row's destination/duplicate/is_new_deck all refresh to match.
   - **The level `<select>` is topic-aware, not raw levels** (real design correction, live
     feedback: grammatical category is the AI's call — the student can't self-assess that — but
     which of the user's own EXISTING decks a word joins is a study preference, not a difficulty
     score Gemini should silently pick). `CreateWordModal` fetches
     `GET /api/personal-words` for all 9 `NESTED_LEVEL_CATEGORIES` in parallel once the preview
     step is reached (`loadExistingTopics`), and each option shows the deck's `topic_name` (e.g.
     "Trabajo") when one already exists at that level, or `t.newTopicOption` ("Nuevo tema", no
     level shown — the AI already decided it, echoing the level back would suggest it's the
     user's call to make) when it doesn't — never a bare "Básico/Intermedio/Avanzado" label once a
     name exists. **Gotcha**: `entry.deck` from that response is `"<raw-level>/my_words"` (e.g.
     `"1-basic/my_words"`) — the raw slug `levelOverride` needs. Do NOT resolve it with
     `getLevelFromDeckName` (a display-only helper that strips the numeric prefix, e.g. returns
     `"basic"`) — split on `/` instead. Real bug caught by test: doing this wrong sent
     `level_override: "basic"` to the backend, which isn't a valid `PERSONAL_WORD_LEVELS` slug.
   - **"+ Agregar a otro tema"** (was "+ Agregar otra clasificación") opens a picker listing the
     user's existing topics ACROSS ALL categories (name + category + level, e.g. "Trabajo
     (Verbos·Básico)") — picking one adds a row pinned to that exact category+level and triggers
     the same override preview. Only when the user has zero existing topics anywhere does the
     button fall back to the original behavior (label reverts to "+ Agregar otra clasificación",
     defaults to the first unused category in `NESTED_LEVEL_CATEGORIES`) — there's nothing to pick
     from yet.
   - **Proactive "use this instead" suggestion** ("nadie estudia un mazo de una sola carta",
     explicit user request): when a row's AI-picked level has no deck yet (`row.isNewDeck`) but the
     row's category ALREADY has a topic at a different level, a subtle inline line appears under
     the fields ("💡 Suggested deck: **Use Category · Level**", plain text + inline link, no
     border/box by later minimalist-redesign request) — `bestExistingTopicFor` picks the one with
     the most cards (`total`) when several exist — clicking the link re-previews the row pinned to
     that topic's category+level (same override call as manually changing the topic `<select>`).
     Pure suggestion: doesn't block or auto-apply, the user can ignore it and let Gemini's original
     pick create a new deck instead.
   - **The topic `<select>` never offers an arbitrary NEW level** (explicit user request: grammar
     category is the AI's call, but so is difficulty — "la IA sabe más que el usuario" — the user
     only decides which of their EXISTING topics to use, never invents a new difficulty). Per row,
     `PERSONAL_WORD_LEVELS` is filtered to `lvl === row.level || topicsForCategory(row.category).some(t => t.level === lvl)`
     — i.e. only the level Gemini actually picked (labeled "new topic" if no deck exists there yet)
     plus any level where the user already has an established deck are ever shown as options.
3. Confirm creates ONE card per checked, non-duplicate row — sequential calls to
   `POST /api/personal-words/create`, each with that row's `category_override`/`level_override` set
   (the frontend ALWAYS sends both, even for a row the user never touched, so `create_personal_word`
   never has to resolve ambiguity itself — see step 2 of the numbered list above). A failure on one
   row doesn't affect the others; the results screen shows a per-row outcome (created / already
   existed / error) with a "Ver en {category}" button and, for rows that created a brand-new deck,
   their own inline "name this deck" box (see §Naming a deck above, now per-row). A **"Create
   another word"** button reopens the word-input form without closing the modal, keeping
   `existingTopics` cached (refreshed right after a successful creation, see below — not
   re-fetched from scratch).

### One-call full-topic-list recommendation (`existing_topics`)

Real efficiency + UX fix, explicit user request: send Gemini the **full list** of the student's
existing personal topics (all categories, all levels) in the FIRST classification call, and have
it RECOMMEND the best-fitting one as the first/default candidate — the user can still change to
another of their existing decks or explicitly create a new one — instead of guessing with a single
"last used deck" hint and silently re-querying with overrides when it didn't fit.

This superseded an earlier, narrower `preferred_category_hint`/`preferred_level_hint` mechanism
(a single last-used-deck hint) — same one-call-efficiency motivation ("que la IA evalúe todo eso
desde el primer llamado"), but limited to remembering only the ONE deck used last, so it couldn't
help when the best-fitting deck was a *different* one than the last-used, or when the word simply
didn't match the last-used deck's category. The full-list version fixes that: Gemini sees ALL of
the user's decks every time, not just one remembered pointer.

**Frontend** (`CreateWordModal.jsx`): `existingTopics` is fetched EAGER on mount (`useEffect`, not
lazily after the first preview) via `loadExistingTopics()` (`GET /api/personal-words` for all 9
`NESTED_LEVEL_CATEGORIES` in parallel), so the list is ready — or awaited inline if the fetch
hadn't resolved yet — for the very FIRST preview call, not just subsequent ones.
`handleSubmit`/`personalWordPort.previewWord` sends the whole list as
`existingTopics: [{category, level, topicName}, ...]` (no overrides — those still null the list
out, see below). After a successful creation (`handleConfirmCreate`), the list is refreshed again
in the background so a newly-created deck is visible to Gemini the next time the user creates
another word in the same modal session ("Create another word").

**Wire path**: `personalWordPort.previewWord` → `personalWordHttpAdapter` (maps to
`existing_topics: [{category, level, topic_name}, ...]`) → `POST /api/personal-words/preview`
(`CreateWordBody.existing_topics: Vec<ExistingTopicDto>`, `api/dto/personal_words.rs`) →
`personal_words.rs::preview_word` handler (maps DTOs to
`Vec<fluency_core::ports::tutor::ExistingPersonalTopic>`) →
`CardCreationUseCases::preview_personal_word` → `classify_and_load` →
`AITutor::generate_word_card_draft(..., existing_topics: &[ExistingPersonalTopic])` →
`build_word_card_user_message` (`gemini_word_card_prompt.rs`), which appends a paragraph listing
every existing deck (category, level, and topic name if the user set one) and asks Gemini to
classify the word as usual (own category/level, still up to 2 classifications when genuinely
ambiguous) but PREFER an exact existing category+level when it's a good semantic AND difficulty
fit — using the topic name, if present, as a theme hint so an unrelated word doesn't get dumped
into a differently-themed deck just because the level matches.

Unlike `category_override`/`level_override` (which force EXACTLY one clamped classification), this
is a **soft recommendation inside the same free-classification call**: it never suppresses
ambiguity detection (still 1-or-2 classifications), and if none of the existing decks are a good
fit for a given classification, Gemini classifies it freely as usual (a new deck). No separate
"recommendation" field in the response is needed — the existing frontend logic already detects
when a returned `category`+`level` matches one of the user's decks (`is_new_deck: false`,
`existing_topic_name` populated) and renders it as "goes to your existing deck X" instead of "new
deck", so the recommended candidate — being the first/only classification for that grammatical
use — naturally surfaces as the default/first option exactly like the earlier hint mechanism did.
`preview_personal_word` nulls `existing_topics` out entirely when `category_override`/
`level_override` are also present (those already determine everything).

Backend implementation: `classify_and_load` (private) returns `Vec<ClassifiedWord>` and is shared
by `preview_personal_word` (maps the whole vec to `Vec<WordPreview>`) and `create_personal_word`
(takes the first — and, on the real path, only — element, always with `existing_topics: &[]` since
`create_personal_word` always receives resolved overrides from the frontend). `Self::validate_overrides`
rejects a `category_override` without a matching `level_override` (or vice versa) and unknown
category/level slugs (`PERSONAL_WORD_CATEGORIES`/`PERSONAL_WORD_LEVELS`, both intentional
duplicates of the `api_main`-side constants — `mod_flashcards` cannot depend on `api_main`). No
server-side session/cache for the draft: each preview/create call is a fresh, cheap text-only
Gemini call at low temperature — NOT wired to the image/audio pipeline, so editing a row never
costs anything beyond one small Gemini text call, even if the user changes their mind repeatedly
before confirming.

### Refreshing after creation without leaving the category

Real bug found live: creating a word while **already** browsing its destination category didn't
show the new/updated deck until the user closed and reopened the category selector.
`useDeckSession.js`'s personal-deck-merge effect only depended on `currentCategory` changing — if
the user never left the category, nothing re-triggered it. Fixed with an explicit
`personalWordsRefreshToken` state + `refreshPersonalWords()` callback (exposed from the hook,
added to the effect's dependency array); `CreateWordModal` calls it right after a successful
creation and after successfully naming a deck.

## Word Search and Target Navigation (`GET /api/search-words`)

Search box in the catalog sidebar enables instant word lookup across catalog and personal decks:

### Backend Search Engine (`mod_flashcards/src/lib.rs`)
- **Strict Word Matching (`score_card_match`)**: Matches query exclusively against card headword (`resolved_word()`), ignoring example sentences, translations, and search terms.
  - Score `1000`: Exact word match.
  - Score `800`: Word prefix match (`starts_with`).
  - Score `800`: Query is the headword + a simple English inflection suffix (`s`, `es`, `ed`, `ing`) — e.g. query `spikes` matches headword `spike`. Headwords are ALWAYS stored canonical (infinitive for verbs, singular for nouns — same convention as the curated catalog in `json/**/*.json`), so without this tier, searching the conjugated/plural form the user actually typed silently found nothing. Real bug fixed: creating the same text as both a noun and a verb via "Crear palabra" (Gemini normalizes the verb candidate to its infinitive) meant only the noun ever showed up in search.
  - Score `600`: Exact word match inside compound word phrase.
- **Deck Path Normalization**: Returns deck paths stripped of `.json` extensions (e.g. `1-basic/verbs/action`).
- **Composite Deck Filtering**: Skips composite bundle decks containing `_e_` in their filename (e.g. `cause_effect_basics_e_contrast_condition_basics.json`) during catalog scan, avoiding duplicate results for words present in combined group files.
- **Deduplication**: Deduplicates final results by `(category, name.to_lowercase(), level)`.

### Search UI — Pluggable Component (`features/CatalogSearch.jsx` + `hooks/useCatalogSearch.js`)
Deliberately factored OUT of `CategorySelector.jsx` (already on the "god component" debt list in `client/CLAUDE.md` §9) into its own hexagonal slice, so it can be dropped in/out without touching the selector:
- **`useCatalogSearch(courseDirection)`** (application layer, no JSX): owns `query`/`results`/`isSearching` state, debounces (250ms, min 2 chars) and calls `flashcardPort.searchWords` — the only piece that talks to the port. Pure hook, unit-testable in isolation from rendering.
- **`CatalogSearch.jsx`** (presentation only): renders the search box; while a query is active it renders the results panel *instead of* `children`, otherwise renders `children` unchanged. It receives everything it needs as props (`categoryColors`, `categoryLabels`, `studyLanguage`, `onSelectResult`) and knows nothing about `CategorySelector`'s internal state — swapping/removing it means changing one JSX block in `CategorySelector.jsx` (wrap/unwrap the category `<nav>` in `<CatalogSearch>`), nothing else.
- `CategorySelector.jsx` still owns `handleSelectSearchResult` (calls `changeCategory`/`changeDeck`/`dismissSheet`) — that's orchestration wiring across two other contexts (`CategoryContext`, `FlashcardContext`), not the search feature's concern.
- Result items show: headword (`cleanWordName`), category badge (color dot), level badge (*Básico*/*Intermedio*/*Avanzado*), topic name in Title Case. Omits translations and example sentences to keep results concise.
- Own CSS Module (`CatalogSearch.module.css`) — search styles no longer live in `CategorySelector.module.css`.

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
