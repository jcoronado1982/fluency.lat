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
| Route Registration | `backend/api_main/src/modules/flashcards.rs` | 20 module endpoints |
| Deck Handlers | `backend/api_main/src/api/endpoints/decks.rs` | catalog, progress, stats |
| Media Handlers | `backend/api_main/src/api/endpoints/generation.rs` | resolve/generate/upload/delete |
| Personal Words Handlers | `backend/api_main/src/api/endpoints/personal_words.rs` | preview / create / summary / rename (see §Personal Words) |
| Frontend Module | `client/src/modules/flashcards/` | manifest (`index.jsx`), `FlashcardPage.jsx` (orchestrator), `composition.js`, `ports/`, `adapters/`, `useCases/`, `context/`, `features/` |
| Create Word UI | `client/src/modules/flashcards/features/CreateWordModal.jsx` | "+" button in `CategorySelector.jsx` sidebar; the resulting deck merges into the normal grid — no separate tile (see §Personal Words) |
| Catalog Search UI | `client/src/modules/flashcards/features/CatalogSearch.jsx` + `.module.css`, `hooks/useCatalogSearch.js` | Pluggable search box + results panel mounted inside `CategorySelector.jsx`'s sidebar (see §Word Search) |
| Admin Card Retirement UI | `client/src/modules/flashcards/features/AdminDeleteCardButton.jsx` + `.module.css` | Red "Delete card" pill rendered by `FlashcardPage.jsx` **outside** the card, directly under the counter chip (icon-only circle on ≤768px). Admin-only, free-study mode only (see §Admin Card Retirement) |
| Catalog Selector Pieces | `features/CategoryHelpPopover.jsx` (grammar help button+popover), `features/CategoryNav.jsx` (sidebar category list), `features/DeckGrid.jsx` (deck/group grid), `hooks/useBottomSheet.js` (PWA drag-to-dismiss), `hooks/useDragReorder.js` (generic HTML5 DnD reorder), `hooks/useLocalCatalogOrder.js` (local group/nested-deck order + persistence) | `CategorySelector.jsx` composes all of these — it only orchestrates (context ↔ hooks ↔ these components), ~300 lines. Each is independently swappable/removable; `CategoryHelpPopover`/`CategoryNav`/`DeckGrid` intentionally still import `CategorySelector.module.css` (its `.helpPopover*`/`.categoryNav`/`.groupsGrid` rules are split across several non-contiguous `@media` blocks — relocating them was judged higher regression risk than the architectural purity gained, since the pixel-diff harness doesn't open the help popover) |
| Personal Deck Merge | `client/src/modules/flashcards/hooks/useDeckSession.js` | prepends the user's personal deck(s) to `deckNames`/`deckSummaries` right after the general catalog loads for a category |
| "Continue Studying" Recommendation | `client/src/modules/flashcards/config/catalogOrder.js` (`getNextStudyStep`) | next group → next deck → next category, driven by `contracts/catalogOrder.json`; nested-level categories need `nestedDeckNames` passed in (see §"Continue Studying" Recommendation below) |
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
| DELETE | `/api/delete-card` | `{category, deck, index, expected_word?, course_direction?}` | admin-only card retirement — `{success, already_deleted, remaining_active}`; 404 out of range, 409 if `expected_word` doesn't match (see §Admin Card Retirement) |

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

## Content JSON Schema (`json/es_en/`, `json/en_es/`)

Scope: this section documents only the `es_en` and `en_es` pairs (the other directions —
`es_de`, `en_fr`, `es_fr`, `es_it`, `es_pt`, `fr_en`, `fr_es`, `it_es`, `pt_en`, `pt_es` — live under
the same `json/` tree and follow the same path shape, but are out of scope here).

### Path convention

```
json/<direction>/<category>/<level>/<topic>.json
```

- `<direction>`: `es_en` (Spanish speaker learning English) | `en_es` (English speaker learning
  Spanish).
- `<category>`: one of the 9 grammatical categories — `verbs`, `nouns`, `adjectives`, `adverbs`,
  `phrasal_verbs`, `connectors`, `preposition`, `determinant`, `pronouns` (same list as
  `NESTED_LEVEL_CATEGORIES` plus the flat ones — see §"Continue Studying" Recommendation above).
- `<level>`: `1-basic` | `2-intermediate` | `3-advanced`.
- `<topic>.json`: one **deck** — a themed group of cards (e.g. `cause_effect_basics.json`,
  `action.json`). This is the file a `GET /api/flashcards-data` call ultimately reads.
- Personal decks (see §Personal Words) live in the sibling internal namespace
  `json/<direction>/personal-<category>-<user_path_segment>/<level>/my_words.json` — same shape,
  different discovery path (never listed in `catalog-manifest.json`).

### Deck file shape

A deck file is normally a **bare JSON array** of card objects (`DeckData::Array` in
`backend/core/src/domain/models/flashcard.rs`). Personal decks, once named, use the alternate
**object** shape `{ "flashcards": [...], "topic_name": "..." }` (`DeckData::Object`) —
`flashcards_mut()`/`flashcards()` abstract over both, so nothing downstream needs to care which
one a given file uses (see §Naming a deck). A catalog deck can use the same `Object` shape to
carry an optional **`intro_card`** (see §Intro Card below) — both keys can coexist on the same
deck.

### Intro Card (optional, per-deck)

Some decks benefit from a single explanatory image shown before the first real card (e.g. an
infographic laying out how `many/much/a few/a little/less/fewer` relate before the student drills
them one by one) — `determinant/1-basic/quantifiers_scale.json` is the first (and, so far, only)
deck using this.

- **Storage**: the deck file uses `DeckData::Object`, with a sibling top-level key next to
  `flashcards`: `"intro_card": { "enabled": true, "imagePath": "/card_images/<category>/<level>/<deck>/<deck>_intro.<ext>" }`.
  No backend code change was needed for this — `#[serde(flatten)] extra` on `DeckData::Object`
  already serializes arbitrary sibling keys back out to the client, exactly like `topic_name` does
  for personal decks.
- **Frontend plumbing**: `intro_card` is dropped by `normalizeDeckResponse` (which only extracts
  `.flashcards`), so it's captured **separately**, in two places that both fetch a deck's raw
  response — `useDeckSession.js`'s `loadFlashcards` (normal path) and `preload.js`'s
  `preloadFlashcardStart` (the silent-preload fast path raced against it, see
  `PRELOAD_TIMEOUT_MS`) — both must set it, or the intro card only shows non-deterministically
  depending on which path wins the race. Exposed via `useDeckSession`'s return
  (`introCard`, `dismissIntroCard`) → `FlashcardContext` (spread verbatim, no extra plumbing) →
  `FlashcardPage.jsx` (`shouldShowIntro = Boolean(introCard?.imagePath)`).
- **Rendering**: `features/IntroCard.jsx` — a self-contained component (own `.module.css`, no
  props/state shared with `Flashcard.jsx`/`CardFront.jsx`/`Controls.jsx`) rendered as an
  alternative branch in `FlashcardPage.jsx`'s ternary, the same pattern already used for
  `CompletionCard.jsx`. **Deliberately does not touch the shared study-card kit** (explicit
  requirement — see git history for this section): it reuses the kit's own sizing tokens
  (`var(--fc-card-max-width)`, `var(--fc-card-base-height)` from `App.css`) so it occupies the
  exact same footprint as `<Flashcard/>`, but renders inline in the card slot (NOT a
  `position:fixed` full-viewport overlay — that was the first attempt and it visually broke,
  apparently clipped by a transformed/perspective ancestor; rendering inside the normal card slot
  sidesteps the issue entirely and also matches the desired UX). Image sits inset with a 20px
  padding inside the card box and its own rounded corners (`border-radius: 16px`, distinct from
  the outer `.container`'s 24px) — deliberate double-radius framing, not a bug. Click/tap or
  Enter/Space anywhere on it, or its own visible **"Continue" button** (bottom-right, its only
  control), calls `dismissIntroCard()`, which nulls `introCard` and reveals the first real card
  underneath — `currentIndex` is untouched, so dismissal never skips or re-shows a card.
- **No check/reset while the intro is up** (explicit requirement — "solo avanza"): `Controls`/
  `SrsControls`/`PwaStudyControls` are hidden while `shouldShowIntro` is true (same guard as
  `shouldShowCompletionCard`), so `markAsLearned`/`resetDeck` are simply unreachable — the ONLY
  affordance to move past the intro is its own "Continue" button/tap. The top counter badge
  (`DETERMINANTS 1-basic/quantifiers_scale 0/14`) stays visible for orientation.
  `useDeckSession.js`'s `nextCard()` is still intro-aware (dismisses instead of advancing
  `currentIndex`) as a harmless safety net for any other caller, but with `Controls` unmounted its
  next-button/keyboard-ArrowRight path is moot in practice — the visible "Continue" button is the
  real interaction.
- **Never shown over an already-completed deck**: `shouldShowIntro` is gated with
  `!isCompletionVisible` — re-opening a fully-learned deck shows the completion screen, not the
  infographic again.
- **Reset**: `introCard` is nulled at the top of `loadFlashcards` on every deck load, then
  re-populated (or left `null`) once the fetch resolves — so switching decks always re-evaluates
  whether the new deck has one, and a deck without `intro_card` never shows a stale one from the
  previous deck.
- **To add one to another deck**: wrap that deck's JSON in the `Object` shape and add
  `intro_card.enabled: true` + `imagePath` pointing at an image placed alongside the deck's other
  images (`card_images/<category>/<level>/<deck>/`) — no other change needed, this was built to be
  reusable per-deck from the start.

### Card object (`Flashcard`)

The Rust struct only hard-types 5 legacy fields; everything else is captured by
`#[serde(flatten)] extra: serde_json::Value` — i.e. the JSON on disk is intentionally looser than
the struct, and new fields can be added to content without a code change.

| Field | Type | Notes |
|---|---|---|
| `word`, `translation`, `example`, `learned`, `learned_at` | string/bool/null | **Legacy, always empty/`false`/`null` in real content.** Superseded by `definitions[0].meaning` / `.usage_example` (read via `Flashcard::resolved_word/resolved_translation/resolved_example`, which fall back into `extra` when these are blank — the normal path for every current deck) |
| `name` | string | Headword, canonical form (infinitive verb, singular noun). In `es_en` this is the **English** word (e.g. `"do"`); in `en_es` it's the **Spanish** word (e.g. `"Porque"`) — direction flips which language is the headword, not just which is the translation |
| `phonetic`, `spoken_phonetic_us` | string | IPA transcription of the headword |
| `search_term` | string | Free-form tag used as a search/classification hint (e.g. `"conjunction/reason"`) |
| `group_name` | string | Human-readable topic label shown in the UI (e.g. `"Connectors: Cause & Effect"`) |
| `is_verb` | bool | Present in `es_en` cards |
| `is_phrasal_verb`, `category` | bool, string | Present in `en_es` cards instead of `is_verb` — the two directions were authored with slightly different field sets, not a typo to "fix" without checking both content pipelines |
| `irregular` | bool | Present on some `es_en` verb cards (irregular conjugation flag) |
| `force_generation` | bool | Media-pipeline flag — forces regeneration instead of reusing cached audio/image |
| `definitions` | array | One entry per distinct meaning/usage of the headword — see below. A word with several unrelated senses (like `"so"`) has multiple entries here, each getting its own image |

### Definition object (`definitions[]`)

| Field | Notes |
|---|---|
| `meaning` | The translation shown for this sense. `es_en`: Spanish meaning of the English headword. `en_es`: English meaning of the Spanish headword |
| `target_meaning_es` | **`en_es` only.** Redundant Spanish restatement of the headword's sense — not present in `es_en` decks |
| `usage_example` / `usage_example_es` | Example sentence pair. `es_en`: `usage_example` is English, `usage_example_es` is its Spanish translation. `en_es`: **inverted** — `usage_example` is Spanish, `usage_example_es` is the English translation, despite the field name suggesting otherwise |
| `alternative_example` | Optional second example sentence, often left `""` |
| `pronunciation_guide_es` | Phonetic-spelled-in-Spanish pronunciation aid (e.g. `/ai_am_TAI-erd_bi-COZ.../`) — often empty in `en_es` |
| `usage_context_en` / `usage_context_es` | Short bilingual gloss of when this sense applies (e.g. `"Used to introduce a reason or cause."`) |
| `char_count` | String, not always numeric (seen as `"7"` or as spelled-out `"one"`/`"two"` on personal-word cards) — treat as opaque metadata, not a parsed length |
| `imagePath` | Path under `/card_images/...` for this specific sense (one image per definition, not per card) — combine with the media-versioning `?v=` rules in `AI_OPERATIONS_CONTEXT.md` |
| `audioPath` | Only seen written on personal-word cards; catalog decks resolve audio via `/api/resolve-audio` instead of storing the path in the JSON |

### `catalog-manifest.json`

Precomputed index consumed by `DeckUseCases` (`OnceCell<CatalogManifest>`), regenerated by
`scripts/generate-catalog-manifest.mjs`:

```
{ schemaVersion, catalogVersion, generatedAt,
  directions: { "<direction>": { total, categories: [
    { name, total, decks: [ { path, level, total, size }, ... ] }, ...
  ] } } }
```

`path` is deck-relative (e.g. `"1-basic/action.json"`), not the full `json/<direction>/...` path.
Directories starting with `personal-` are excluded from `categories` at generation time (see
§Storage in Personal Words above) — this file is the general catalog only, never a given user's
personal decks.

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

### "Continue Studying" Recommendation (`getNextStudyStep`, `config/catalogOrder.js`)
- Drives the button/auto-advance shown on the deck-completion screen (`FlashcardPage.jsx`, computed whenever `isCompletionVisible || reachedDeckEnd`): next group within the deck → next deck within the category → next category. Consumed via `handleContinueRecommendation` (manual click) and the `dashboardResumeRef` effect (auto-advance right after finishing, when arriving from the dashboard).
- `contracts/catalogOrder.json` only models grammatical/flat categories (e.g. `connectors`, `pronouns`) as `category → level(as "deck") → [group topics]`. For **nested-level categories** (`nouns`/`verbs`/`adjectives`/`adverbs`/`phrasal_verbs`/personal — see `usesNestedLevelDecks`), the real deck identity is `<level>/<topic>` (e.g. `3-advanced/change_action`), which the JSON never encodes as a "deck" key.
- **Real bug, fixed (reported live, Aug 2026 — "termino un mazo avanzado/intermedio y a veces me manda a básico")**: without the real deck list, `deckIndex` inside `getNextStudyStep` was always `-1` for nested categories, so finishing **any** nested deck — regardless of level — skipped straight to "next category" instead of the next topic/level within the same category. Whether the user landed on basic depended entirely on whether that other category had a `localStorage`-persisted deck already (`resolvePersistedChoice` falls back to `names[0]`, always the basic-level deck when sorted) — explaining the intermittent "sometimes it resets, sometimes it doesn't". This also corrupted `CategorySelector`'s level display/level buttons (`activeLevel = getLevelFromDeckName(currentDeckName)`), since they just reflect whatever category+deck the session was silently bounced to.
  Fix: `getNextStudyStep` now accepts an optional `nestedDeckNames` (the real, already `sortDeckNames`-ordered deck list for the current category, personal decks filtered out) and, when present, advances to the next entry in that list first — falling through to the category jump only after the last deck of the last level. `FlashcardPage.jsx` passes it whenever `usesNestedLevelDecks(currentCategory)`. Regression tests: `config/catalogOrder.test.js` › `getNextStudyStep — nested-level categories`.

### Reaching the End of a Deck by Navigating (`reachedDeckEnd`, `useDeckSession.js`)

`nextCard()` on the last card sets `reachedDeckEnd`, which is what makes `FlashcardPage` swap the
card for the end-of-deck screen (`shouldShowCompletionCard`). It is deliberately **not** "index is
at the end" — jumping straight to the last card of a deck from a search result and pressing next
must not claim you finished it. The pass is closed when **either** condition holds:

- **(a)** every card still in `filteredData` has been visited in this pass (`visitedCardIdsRef`), or
- **(b)** the user moved forward at least once in this pass (`advancedForwardRef`).

**Real bug, fixed (reported live, Sep 2026 — "a veces muestra la confirmación de terminado de mazo,
a veces se queda en la última")**: only (a) existed, and it compared *sizes*
(`visited.size >= filteredData.length`). Two independent failures came out of that:

1. **Entering mid-deck never closed the pass.** Resuming from the dashboard or opening a search
   result positions `currentIndex` in the middle; the earlier cards are never visited, so the
   threshold was unreachable no matter how far the user navigated — they hit the last card and
   stayed there with no way out. Condition (b) fixes exactly this case while still rejecting the
   "jumped straight onto the last card and pressed next" false positive, which has no forward move.
2. **Size comparison compared two different sets.** `visitedCardIdsRef` keeps ids, but
   `filteredData` shrinks as cards are marked learned (and now also when a card is retired), so the
   set retained ids no longer in the list and the count could cross the threshold for the wrong
   reason. Now (a) is `filteredData.every(card => visited.has(card.id))` — evaluated against the
   cards that are actually still there.

`advancedForwardRef` is reset in lockstep with `visitedCardIdsRef` at every point that starts a new
pass (deck/category/group change, `reviewDeckAgain`, `changeDeck`, and when the pass closes) — they
are two halves of the same "current pass" state; resetting one without the other reintroduces the
bug. Regression tests: `useDeckSession.test.js` › *"llegar al final del mazo navegando"* (3 cases:
full pass from the start, mid-deck entry, and the jump-to-last false positive).

### Level-Switch Rendering Race (`hooks/useLocalCatalogOrder.js`)
- **Real bug, fixed (reported live, Aug 2026 — "cambio a nivel intermedio, el botón de nivel se marca bien, pero le doy click al primer mazo y me manda a otro nivel")**: `visibleNestedDecks`/`visibleGroups` (what `DeckGrid.jsx` renders and what a click resolves to) fell back to `localNestedDeckOrder`/`localGroupOrder` — `useState` recomputed in a `useEffect` keyed by `levelPreferenceKey`/`currentCategory` — whenever that state was non-empty, with no check that it actually belonged to the level/category just switched to. `activeLevel`/`nestedDeckNames` (plain derived values, no effect delay) update in the SAME render the user clicks a level button, but the effect that refreshes `localNestedDeckOrder` only runs (and repaints) one tick later. In that window the level button already shows the new level active while the grid — and therefore the first tile a user clicks — still belongs to the previous level; clicking it calls `changeDeck` with that stale deck, which flips `activeLevel` back.
  Fix: `visibleNestedDecks`/`visibleGroups` only trust the local (possibly drag-reordered) state when its item SET matches the fresh `nestedDeckNames`/`groupNames` exactly; otherwise they render the always-correct, prop-derived list directly until the effect catches up. Not covered by an automated regression test — the race is a render-vs-`useEffect` timing gap that `@testing-library/react`'s `act()` flushes away by construction (effects settle before assertions can observe the stale frame), so verify manually: switch levels on a nested category (e.g. adjectives) and click the first tile immediately.

## Admin Card Retirement (`DELETE /api/delete-card`)

Curation tool: an admin studying a deck can drop a card they don't want in the product. It removes
the card from the **general catalog** (every user in that course direction), not from the admin's
own progress — the admin is the one deciding what stays and what goes.

### Retire ≠ splice (the reason this is a flag, not an array removal)

Cards are addressed **positionally** everywhere that matters:

- user progress in SurrealDB is a set of learned **indices** per `(user, category, deck)`;
- image paths are `<category>/<deck>/<deck>_card_N_defM` and, per §Supported Course Directions,
  **do not depend on course direction** — `es_en/verbs/action` card 3 and `en_es/verbs/action`
  card 3 resolve to the *same* image file.

So splicing element N out of a deck's array would shift every later card down one: each of them
would inherit the previous neighbour's image and `learned` flag, in this deck **and** in the same
deck of every other course direction. `DeckUseCases::delete_card` therefore writes
`"deleted": true` (plus `deleted_at` / `deleted_by` for audit) on the card and leaves it in place.
Consequences, all deliberate:

- The card's own image/audio files are left as **orphans on purpose** — deleting them would blank
  out the same index in the other course directions (same rule as `delete_definition`).
- The retirement is **reversible by hand**: drop the three keys from the JSON and the card is back.
- Nothing in the frontend or the DB needs a migration; `#[serde(flatten)] extra` already carries
  arbitrary keys through (same mechanism as `intro_card`, see above).

`expected_word` is the guard against a stale index: the client sends the headword it believes sits
at `index`, and the backend returns **409** instead of retiring the wrong card if the deck changed
on disk in between. Out-of-range → 404. Retiring an already-retired card → 200 with
`already_deleted: true` (idempotent — a double click leaves the client consistent).

### Where "deleted" is honoured

`normalizeDeckResponse` (frontend) deliberately does **not** filter: `card.id` is the position in
the file, and `assembleSrsDeck` resolves SRS candidates by that index against the full array.
Filtering happens one layer up, via `excludeDeletedCards` (`useCases/deckUseCases.js`), which keeps
the original ids:

| Consumer | Where |
|---|---|
| Study session load | `useDeckSession.js` `loadFlashcards` (fetch path) + the per-deck summary fallback |
| Silent preload | `preload.js` `preloadFlashcardStart` — **both paths race**, both must filter, same gotcha as `intro_card` |
| Daily review (SRS) | `srsDeckUseCases.js` — a due candidate whose card was retired is skipped (its DB progress survives untouched) |
| Word search | `mod_flashcards/src/lib.rs` `search_words`, both the catalog and the personal-deck scan |
| Personal deck totals | `card_creation_use_cases::personal_words_summaries` |
| Catalog manifest totals | `scripts/generate-catalog-manifest.mjs` (`total` skips `deleted`) |

**Deck JSON cache**: `LocalStorageRepository` keeps a moka LRU of full decks (12 entries, TTL 300s).
`save_deck_data_for_direction` invalidates the entry it writes, so a retirement done **through the
app** is visible on the very next read — verified live. Editing a deck's JSON **by hand on disk**
bypasses that invalidation and the API keeps serving the old deck for up to 5 minutes; that is a
QA/authoring gotcha, not a bug in this endpoint.

**Known staleness**: `deck.total` in `catalog-manifest.json` is precomputed and cached in RAM
(`OnceCell`), so the deck-grid tile keeps counting a retired card until the manifest is regenerated
and the backend restarts. The study session itself is always correct (it counts the loaded array),
and `useDeckSession` rewrites `deckSummaries[deck]` locally right after a deletion.

### UI and the "what do I see next?" scenarios

The button lives in `FlashcardPage.jsx`, **outside** `<Flashcard/>` — the shared study kit
(`components/flashcardStudy`) also renders the public landing demo, where this action must not
exist, and keeping it out means the card itself is untouched (no pixel-diff surface on the card).
It renders only when: role is `admin`, a real card is on screen, no overlay/loader/completion/intro
is up, and `deleteCard` exists (it is `null` in SRS mode — the daily review mixes cards from many
decks and its advance is driven by the SRS engine, so curation happens while studying a deck).

Placement is anchored to the **counter chip's column** (absolute inside `.flashcard-page-wrapper`,
`right: 40px`, counter `top` + 90px — i.e. below the chip, not beside it), red-tinted with a visible
label. On ≤768px the counter becomes
a static row above the card and the button collapses to a 34px circle in that row's free left side,
with its `top` tuned so its bottom edge clears the card's top edge (measured: card at y≈114 on
390×844; a `::after` inset of -6px widens the touch target to ~46px without changing the layout).

Three live-reported placement/visibility fixes are baked into this CSS — do not "simplify" them
back:

1. **Not the top-left corner.** The first version put a discreet grey icon there; on a wide monitor
   it sat 640px from the card, dark on dark, and was unfindable (*"no veo dónde elimino la
   tarjeta"*).
2. **The icon is 18px (20px on mobile) in `#fff1f2`**, not the 16px thin stroke inheriting the
   button's muted pink — that read as an empty pill next to the bold label (*"se ven las letras, el
   ícono no se ve"*). On mobile the icon is the *only* content, so its size is the whole affordance.
3. **It is NOT hidden in the installed PWA.** The counter chip hides itself under
   `(display-mode: standalone) and (max-width: 768px)` and the first version copied that rule by
   analogy — which left the installed app with no way to retire a card at all, the exact place the
   admin curates from. The counter is informational; this is a tool. In standalone the slot is
   freer, since the counter row is not painted.

Verified with Playwright on `iPhone 14` / `Pixel 7` / `iPhone SE` and 1366/1920 desktop: button
visible, `elementFromPoint` at its centre returns the button itself (nothing overlaying it), zero
overlap with the card box, and a real touch `tap()` completes the deletion.

`useDeckSession.deleteCard()` reports what happened so the page can decide whether to also navigate:

| Situation after the deletion | Returns | What the admin sees |
|---|---|---|
| Unlearned cards remain | `advanced` | The next card. If the deleted one was the last of the list, it steps back one (`computeNextIndex`) instead of leaving the index out of range |
| It was the last **unlearned** card, learned ones remain | `deck_completed` | The end-of-deck/group screen with the "continue" recommendation. `justCompletedInSession` is set on purpose: without it `isCompletionVisible` would be true with no screen qualified to render, dropping the admin into a dead-end "No hay tarjetas disponibles" |
| It was the **only** card left (deck emptied) | `deck_empty` | `FlashcardPage` runs `getNextStudyStep` on demand and jumps to the next group → deck → category; the catalog opens if there is nothing left |
| Request failed (403/404/409/network) | `error` | Error message; the session is untouched and the card stays on screen |

Also handled by `deleteCard`: the pending progress batch entry and the "visited cards" set for that
id are dropped, and `resetFlashcardPreload` is called — the silent preload caches the whole deck,
so without invalidating it the retired card comes back the next time the deck is opened (the
preload can win the race against the fetch).

Reopening a deck whose cards were **all** retired hits `loadFlashcards`'s existing "Deck vacío"
path: nested-level categories fall back to another deck of the category, flat ones show the load
error. Not a new behaviour, but reachable now — regenerate the manifest if a deck is emptied.

## Invariants

- **`resolve-*` NEVER generates media** — 404 halts prefetching.
- **`update-batch` is ONE SurrealDB transaction** (`BEGIN…COMMIT`).
- **No raw `fetch` outside the adapter layer, `beforeunload` included.** The last-chance flush of
  pending progress (`flushProgressBeacon` in `useDeckSession.js` and `useSrsDeckSession.js`) goes
  through `flashcardPort.updateCardsBatchBeacon` → `flashcardHttpAdapter` → `httpClient.beacon`,
  the same path as the normal flush. `httpClient.beacon` exists because this one case cannot use
  `request()`: the page is unloading, so there is nobody to `await` the promise and only
  `keepalive: true` makes the browser finish sending after the document is destroyed
  (`navigator.sendBeacon` is not an option — it cannot carry the `Authorization` header the backend
  requires). Both hooks previously rebuilt the URL, the token and the auth headers by hand.
  Regression test: `client/scripts/test-http-adapters.mjs` › `flashcardHttpAdapter`.
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
- **A retired card is never spliced out of the deck array** — `DELETE /api/delete-card` only sets
  `"deleted": true`; card indices are the addressing scheme for user progress and for images shared
  across ALL course directions (see §Admin Card Retirement).
- **`normalizeDeckResponse` never filters retired cards** — `card.id` must stay equal to the card's
  index in the file; filtering is done by `excludeDeletedCards` at each study-list consumer.
- **Card retirement is admin-only and free-study-only** — `require_admin_role` server-side (stricter
  than `delete_definition`'s image-customization gate), and `deleteCard` is `null` in SRS mode.
- **A stale index never deletes a card** — a mismatching `expected_word` returns 409 and writes
  nothing.
- **A deck can only be named after it has at least one word** (`rename_personal_deck` fails on an
  empty/nonexistent deck) — naming is offered exactly once, right after the word that created it.

## How to Test

```bash
./scripts/sparse-module.sh flashcards      # isolate module
./start.sh                                 # full local stack
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # login dev guest
cd client && npm test                      # run unit tests
cargo test -p mod_flashcards card_creation_use_cases resolve_storage_category get_deck_data   # Personal Words unit tests
cargo test -p mod_flashcards delete_card                # card-retirement unit tests (no index shift, stale index, idempotence)
cd client && npx vitest run src/modules/flashcards/hooks/useDeckSession.test.js   # deleteCard scenario matrix
./scripts/test-site-e2e.sh --chromium   # run full site E2E tour (~2 min)
```
