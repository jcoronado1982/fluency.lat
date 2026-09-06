# Module `pronoun` — Interactive Pronoun Practice & Stories

> Learning module for interactive practice of pronouns, stories, and episodes.

## Purpose

Enables students to practice pronoun usage through interactive stories and episodes with detailed progress tracking.

## Status and Roadmap

- Status: active.
- Features: lesson episodes, interactive practice screens, and story/progress tracking.

## File Map

| Layer | Path | Contents |
|---|---|---|
| Backend crate | `backend/mod_pronoun/` | Pronoun practice use cases |
| Backend routes | `backend/api_main/src/modules/pronoun_practice.rs` | HTTP endpoint registration |
| Backend handlers | `backend/api_main/src/api/endpoints/pronoun_practice.rs` | Episode, story, and progress handlers |
| Frontend | `client/src/modules/pronoun/` | Episode UI and story interaction |

## Contracts / Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/progress` | JWT | Get general pronoun practice progress |
| POST | `/api/progress/update` | JWT | Update student progress after completing exercises |
| DELETE | `/api/progress/reset` | JWT | Reset pronoun practice progress |
| GET | `/api/episodes/:episode_id/screens` | JWT | Fetch interactive screens for an episode |
| GET | `/api/episodes/:episode_id/next` | JWT | Fetch next recommended episode |
| GET | `/api/stories/:story_id/full-history` | JWT | Fetch complete story history |

## Flags and Activation

- Cargo feature: `pronoun_practice`.
- Vite flags: `VITE_ENABLE_PRONOUN_PRACTICE`.
- Sparse profile: `./scripts/sparse-module.sh pronoun`.

## Module Dependencies

- `shell-auth`: JWT authentication.
- `flashcards`: optional lexical support cards.

## Data

- SurrealDB collections: `user_progress`, `episodes`, `stories`.

## How to Test

- Backend: `cargo check -p api_main`.
- Frontend: `npm run dev`.
- Verification: `./scripts/verify-blueprints.sh`.
