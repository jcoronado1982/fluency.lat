# fluency.lat

Comprehensive language learning platform powered by interactive flashcards, intelligent tutoring, multimedia generation, and speech practice.

## 📋 Project Overview

`fluency.lat` is a modern application designed to accelerate natural language acquisition through spaced repetition techniques, dynamic content generation, and immersive practice.

Key features include:
- **Interactive Flashcards**: Study modules organized by grammatical categories, vocabulary, and practical expressions.
- **Intelligent Language Tutor**: Guided interactive assistant to answer questions, evaluate student responses, and provide real-time feedback.
- **Speech Synthesis & Pronunciation**: High-fidelity audio synthesis providing native pronunciation models.
- **Contextual Visual Aids**: Supporting illustrations dynamically mapped to studied concepts.

---

## 🏗️ System Architecture

The project is designed following a decoupled **Modular Monolith** pattern, enabling individual learning modules to be enabled, isolated, or expanded through feature flags and conditional builds.

```
                  ┌────────────────────────┐
                  │    Frontend Client     │
                  │   (React 19 + Vite)    │
                  └───────────┬────────────┘
                              │ HTTP / REST / WebSockets
                  ┌───────────▼────────────┐
                  │     Caddy v2 Proxy     │
                  └───────────┬────────────┘
                              │
                  ┌───────────▼────────────┐
                  │      Rust Backend      │
                  │   (Axum + Tokio RS)    │
                  └─────┬──────────────┬───┘
                        │              │
        ┌───────────────▼┐          ┌──▼──────────────────┐
        │   SurrealDB    │          │   AI Integrations   │
        │   (Database)   │          │ (Gemini, Audio, etc)│
        └────────────────┘          └─────────────────────┘
```

### Core Components:

* **Frontend (`client/`)**: Built with React 19, Vite, and Modular CSS. Reactive UI components tailored for student learning experience with support for native audio playback, interactive card decks, and responsive layouts.
* **Backend (`backend/`)**: Built in **Rust** using the **Axum** framework on top of Tokio. Provides ultra-high performance, low memory footprint, and thread-safe concurrency for API handling and database connections.
* **Database (`SurrealDB`)**: Multi-model database (document + graph + key-value) for ultra-fast progress tracking, flashcard catalog queries, and user session management.
* **Proxy & Networking (`infra/` / Caddy)**: Automatic SSL certificate management, API routing, and static asset distribution.

---

## 🚀 Quickstart & Local Development

### Prerequisites
- **Docker** and **Docker Compose**
- **Rust** (2021 edition or higher)
- **Node.js** (v18+ / pnpm or npm)

### Running the Project

1. **Full Stack & Infrastructure**:
   ```bash
   ./start.sh
   ```
   Starts database containers, the Rust backend API, and the Vite frontend dev server.

2. **Frontend Only**:
   ```bash
   cd client
   npm install
   npm run dev
   ```

3. **Backend Only**:
   ```bash
   cd backend
   cargo run
   ```

---

## 📁 Repository Structure

```
fluency.lat/
├── backend/            # Rust API backend server (Axum)
├── client/             # Frontend application (React 19 + Vite)
├── docs/               # Infrastructure & technical documentation
├── infra/              # Server configs, deployment scripts & Caddy proxy
├── json/               # Flashcard catalogs and content manifests
├── modules/            # Decoupled application modules
└── start.sh            # Main orchestration script
```

---

## 🔒 License & Usage Terms

Copyright (c) 2026 Jesus Coronado / `fluency.lat`. All rights reserved.

This repository and its source code are **proprietary and confidential**. 

- **Explicit Authorization Required**: Any use, copying, modification, distribution, or deployment of this software (commercial or non-commercial) is strictly prohibited without prior explicit written permission from the copyright owner.
- **Licensing Inquiries**: To request permission to use or license any part of this project, please contact: [safe.jcoronado@gmail.com](mailto:safe.jcoronado@gmail.com).

See [LICENSE](LICENSE) for full details.


