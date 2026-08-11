# Module `<id>` — <Human Name>

> Module documentation template. Copy, fill ALL sections (write "—" if not applicable),
> and maintain updated in the same change modifying the module.
> Entry protocol: [`GEMINI.md`](../../GEMINI.md) → reading protocol.

## Purpose

2–3 lines: what business problem this module solves and for whom.

## Status and Roadmap

- Status: active | beta | paused.
- Known pending items / next steps.

## File Map

Direct code guide — keep exact.

| Layer | Path | Contents |
|---|---|---|
| Backend crate | `backend/mod_<x>/` | use cases |
| Backend routes | `backend/api_main/src/modules/<x>.rs` | endpoint registration |
| Backend handlers | `backend/api_main/src/api/endpoints/<x>.rs` | HTTP handlers |
| Frontend | `client/src/modules/<x>/` | manifest + UI |

## Contracts / Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|

## Flags and Activation

- Cargo feature: `<feature>` (or — if frontend only).
- Vite flags: `VITE_ENABLE_<X>`.
- Sparse profile: `./scripts/sparse-module.sh <x>`.

## Module Dependencies

Explicit list. Only items declared here authorize reading another module's doc.

## Data

SurrealDB collections touched (link to [`database_schema_diagram.md`](../../database_schema_diagram.md)).

## How to Test

Startup commands, sparse profile, local URL, and relevant tests.
