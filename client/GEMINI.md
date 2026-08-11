# Frontend — Fluency (client/)

> **Frontend documentation only.** Read in FULL before modifying any file under `client/`.
> Backend: `backend/GEMINI.md`. Infra: `docs/infrastructure/`. General protocol and index: `GEMINI.md` (root).

Language learning SPA (flashcards with TTS audio and AI images). **React 19 + Vite 8 + Vanilla CSS with CSS Modules**. No TypeScript, no Redux, no CSS frameworks (prohibited to introduce Tailwind/Sass/styled-components/MUI). Server state managed via TanStack Query; UI state via Context API.

---

## 1. Bootstrapping and Module System (Read First)

The app DOES NOT mount static routes: it assembles at runtime from **module manifests**.

1. `src/main.jsx` → `bootstrap()`: renders a loader, executes `initModules()`, and only then imports `App.jsx` (modules must be loaded before calculating routes).
2. `src/modules/index.js` is the **registry**: dynamically loads each module based on `VITE_ENABLE_*` flags and exposes helpers (`getAppRoutes`, `getAppShell`, `getModuleNavSections`, `getModuleOverlays`, `getModuleShellProviders`, `notifyAuthUserSynced`…). The shell NEVER imports module internals: everything passes through the manifest.
3. `src/App.jsx` builds the route tree: `BareLayout` (routes with `layout:'bare'`: landing, login, pricing) vs app shell (`DashboardShell` if dashboard module is enabled, otherwise `MinimalAppShell`).

**Module Manifest** (default export of `src/modules/<x>/index.jsx`):

```js
{
  id: 'flashcards',
  enabled: (config) => config.features.flashcards,
  routes: (config) => [{ path, element, layout?, public? }],
  navSections: ({ language, config }) => [...],   // sidebar
  appShell: DashboardShell,                        // dashboard only
  overlays: (config) => <JSX/>,                    // mounted outside routes
  shellProviders: (config) => [...],               // global module providers
  floatingMenuItems: ({ language, config }) => [...],
  onboarding: (ctx) => [...],
  authListeners: { onUserSynced, onLogout },       // decoupled auth lifecycle
  readResumeSession: () => session | null,
}
```

**Feature flags** (`.env.development`, profiles in `client/env-profiles/*.profile`): `VITE_ENABLE_LANDING`, `VITE_ENABLE_DASHBOARD`, `VITE_ENABLE_FLASHCARDS`, `VITE_ENABLE_PAYMENTS`, `VITE_ENABLE_ADMIN`, `VITE_DEFAULT_MODULE`, `VITE_API_URL` (empty = relative routes via Vite proxy). Config resolved in `src/config/index.js` → `config.features.*`. Sparse-checkout may remove modules from disk: the registry only loads present ones.

### Recipe: ADD a Module

The only central touchpoint is ONE line in the registry. Do not touch `App.jsx`, the shell, or other modules.

1. **Create `src/modules/<new>/index.jsx`** with manifest as default export (minimal viable):
   ```js
   const newModule = {
     id: 'new',
     enabled: (config) => config.features.new,
     routes: (config) => [{ path: '/new', element: <ProtectedRoute><NewPage /></ProtectedRoute> }],
     navSections: ({ language, config }) => [/* optional sidebar entry */],
   };
   export default newModule;
   ```
   Recommended internal structure (copied from `pricing/`, the smallest module): `ports/` + `adapters/` + `useCases/` + `composition.js` + pages/features. Backend data ALWAYS via port (§2).
2. **Register the loader** in `src/modules/index.js` (`moduleLoaders` array), conditioned on its flag:
   ```js
   if (import.meta.env.VITE_ENABLE_NEW === 'true') {
     moduleLoaders.push(['new', () => import('./new/index.jsx')]);
   }
   ```
3. **Declare the feature** in `src/config/index.js` (`sharedFeatures.new = import.meta.env.VITE_ENABLE_NEW === 'true'`) and add `VITE_ENABLE_NEW` to `.env.development` and applicable profiles in `env-profiles/`.
4. **Verify**: `node scripts/test-routing-paths.mjs` (routes), `npm run build`, and run with flag set to `true` and `false` (app must function identically without the module).

### Recipe: REMOVE a Module

- **Temporary (reversible, standard approach)**: set `VITE_ENABLE_*=false` in profile. Nothing else needed — routes, sidebar, overlays, and floating menu recalculate automatically; if it was home, `getAuthenticatedHomePath`/`pickHomeRoute` pick another; if it was `appShell` (dashboard), falls back to `MinimalAppShell`.
- **Physical (sparse-checkout)**: remove directory from disk using sparse profile (see `docs/GIT_SPARSE_WORKFLOW.md`). Registry only loads present files; flag must be `false` so `import()` is not attempted.
- **Permanent (real deletion)**: delete `src/modules/<x>/`, its line in `moduleLoaders`, its feature in `config/index.js`, and its flags in `.env*`/`env-profiles/`. Before deleting, check that no external code imports it: `grep -rn "modules/<x>" src/ --include="*.js*"` should return only the module itself and the registry. Shared items are NOT deleted with the module: `contracts/`, `components/flashcardStudy`, `src/adapters` belong to the shell.

**Verified Guarantee (2026-07-14, re-audited 2026-07-26)**: each module has its own `composition.js`; `admin.profile` runs the app without study modules. Horizontal imports detected are resolved case by case: `getCourseDirectionFromStudyLanguage` and (since 2026-07-26) `SrsEngine` live in `contracts/` because they are pure logic without dependencies — `deckUseCases.js` and `flashcards/domain/SrsEngine.js` re-export them for internal consumers.

---

## 2. Hexagonal Architecture (Ports & Adapters)

Each module replicates the Rust backend architecture (`fluency_core::ports`):

```
useCases (application, PURE logic, no fetch or React)
    ↓ consumes
ports (frozen contract: createXxxPort(adapter) → Object.freeze)
    ↓ implemented by
adapters (infrastructure: *HttpAdapter.js, using httpClient)
    ↓ wired in
composition.js (module composition root — equivalent to api_main wiring)
```

- **Ports**: `src/modules/flashcards/ports/{flashcardPort,audioPort,imagePort}.js`, `src/modules/dashboard/ports/…`, `src/modules/pricing/ports/…`. Document contract with `@typedef`. Shared: `src/adapters/studyPorts.js`.
- **HTTP Adapters**: same `adapters/` directory in each module + `src/adapters/` (shared study audio/image). The ONLY place with API URLs.
- **`src/services/httpClient.js`**: single HTTP client — adds `Authorization: Bearer` from `localStorage.auth_token`, throws on non-2xx. **401 Recovery (Jul 2026 real bug fix)**: an expired/invalid token caused the entire app to fail SILENTLY because there was no 401 handling. Now, if a 401 response arrives with a saved token, `httpClient` calls `clearSessionScopedStorage()` (`utils/sessionStorage.js`) and forces `window.location.reload()`. All fetch calls MUST go through here (no raw `fetch`/`axios` in components).
- **`composition.js`** per module: instantiates ports with adapters. Components import **pre-wired ports**, never adapters.
- **useCases**: `deckUseCases.js`, `deckSessionUseCases.js`, `dashboardProgress.js`… pure testable functions (catalog ordering, progress, sessions).

**Dependency Rule (Inviolable)**: presentation → useCases/ports → adapters → httpClient. Never in reverse; components never know URLs; useCases never import React.

---

## 3. Rootmap of `src/`

```
src/
├── main.jsx                    ← async bootstrap (initModules → App)
├── App.jsx                     ← layered route tree (bare vs app shell), redirects
├── App.css                     ← shell layout + dynamic flashcard dimensions (--fc-*)
├── index.css                   ← reset, :root, GLOBAL prefers-reduced-motion, app typography
├── config/                     ← flags/features (index.js), API_URL (api.js), translations
├── contracts/                  ← contracts BETWEEN modules (do not edit without checking consumers):
│   ├── landingDemoNamespace.js    public demo category/deck/limit + image routes
│   ├── studyMediaVariants.js      'app' vs 'landing-demo' variant (selects backend TTS/image provider)
│   ├── courseDirection.js         studyLanguage → course_direction (used by kit, dashboard, flashcards)
│   ├── srsEngine.js               pure SM-2 engine (used by flashcards and dashboard)
│   ├── deckOrder.js               deck ordering + pure formatDeckCategoryName
│   ├── deckGroupTranslations.js   ES translation for group names
│   └── catalogOrder.json          catalog order (synced with ETL/DB)
├── context/                    ← shared global state:
│   ├── AuthContext.jsx            JWT session, restore, onboardingRequired, post-login navigate
│   ├── UIContext.jsx              UI language + study language, appMessage, sidebar/menu/header
│   ├── DialogContext.jsx          confirm/alert (FluencyDialog)
│   └── AppContext.jsx             facade: re-exports UIProvider/useDialog
├── services/httpClient.js      ← SINGLE HTTP client (automatic JWT)
├── adapters/                   ← shared study media ports+adapters (audio/image)
├── repositories/               ← AuthRepository (token/user in localStorage), adminRepository
├── hooks/usePresence.js        ← presence heartbeat (consumed by admin)
├── utils/                      ← browserLanguage, onboardingStorage, demoFeedbackStorage, clientInfo
├── styles/
│   ├── app-brand.css              ⭐ SINGLE SOURCE of brand tokens (--brand-*) by scope
│   ├── fonts.css                  local @font-face rules
│   └── shell-layout.css           html/body/#root skeleton
├── pages/                      ← shell pages (Login, Admin, Onboarding, Grammar, Test)
├── components/
│   ├── common/                    ProtectedRoute, AdminRoute, PageLoader, LanguageSelector, FluencyDialog
│   ├── pwa/                       online-first PWA experience (SRP separated)
│   ├── routing/SafeRedirect.jsx
│   ├── shell/                     BareLayout, MinimalAppShell, ShellFooter
│   └── flashcardStudy/         ⭐ SHARED CARD KIT (see §4)
└── modules/                    ← manifest-based modules:
    ├── index.js                   registry (see §1)
    ├── flashcards/                authenticated study module
    ├── dashboard/                 app shell (appShell: DashboardShell) + home
    ├── landing/                   public ('/'): hero + card DEMO (uses §4 kit)
    └── pricing/                   PricingPage, CheckoutPage (+ ports/adapters/useCases)
```

---

## 4. Shared Kit `components/flashcardStudy` (Critical)

**One card, two consumers**: authenticated app (`modules/flashcards/FlashcardPage`) and public landing demo (`modules/landing/features/demo`). The same `<Flashcard/>` renders both. Differentiation via:

- **`StudyMediaProvider`** (`mediaVariant: 'app' | 'landing-demo'`): injects audio/image ports. In demo, backend routes to ElevenLabs+Gemini via `category='landing-demo'`. Hook `useStudyMediaContext` THROWS if provider is missing.
- **`data-variant='app'|'demo'`**, **`data-layout='conjugation'|'standard'`**, **`data-state`** in DOM: CSS Modules style via these explicit variants (NOT via structural selector chains).
- **`uiBridge`**: global action map — active card registers handlers (`registerUiBridgeHandler`) and catalog/tour invokes them (`invokeUiBridge`). Action NAMES are contracts: do not rename.

---

## 5. Contexts: Bridge Pattern (Do Not Duplicate Contexts)

Canonical `createContext` instances live in `components/flashcardStudy/context/flashcardStudyContext.js` (`FlashcardContext`, `FlashcardUiContext`, `CategoryContext`). **Providers** live in `modules/flashcards/context/*` and import these exact objects (`export const FlashcardUiContext = StudyFlashcardUiContext`). This allows the shared kit to consume context without depending on the module. Need to expose something new to the card? Add it to the module's Provider; do not create another context.

---

## 6. CSS Architecture (Layer Order)

1. `styles/fonts.css` → 2. `styles/app-brand.css` → 3. `styles/shell-layout.css` → 4. `index.css` (imported in that order in `main.jsx`); `App.css` imported by `App.jsx`; remaining styles are per-component CSS Modules + per-page CSS.

- **`app-brand.css` is the SINGLE SOURCE of brand tokens** (`--brand-rose`, `--brand-gradient`, `--brand-surface`…), applied by scope.
- `index.css`: global reset + global `prefers-reduced-motion` + app typography.
- `App.css`: shell skeleton + card dimension calculations (`--fc-card-height`).

---

## 7. SOLID / Clean Principles in This Codebase

- **SRP**: pages orchestrate, do not implement; each visual section is its own component with `.module.css`; each hook has one responsibility.
- **OCP**: new features = new module with manifest or new manifest entry; visual variants = `data-variant`/CSS variables, no rule rewriting.
- **LSP/ISP**: ports are frozen contracts — new adapter must implement complete typedef; components receive ONLY props they use.
- **DIP**: presentation depends on ports, never adapters/HTTP. Need a new endpoint? Add to adapter, declare in port typedef, expose via composition.js.

---

## 8. Verification Workflow (Mandatory Before Approving Visual Changes)

**Start Local Environment**:

```bash
cd backend && ./target/debug/api_main &      # API on :8081
cd client && npm run dev &                    # Vite on :5173 (proxies /api, /card_images, /card_audio → 8081)
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # local dev guest login
```

**Visual Regression Harness**:

```bash
python3 scripts/refactor_visual_shots.py /tmp/base                  # BEFORE touching code
# ... make changes ...
python3 scripts/refactor_visual_shots.py /tmp/after
python3 scripts/refactor_visual_diff.py /tmp/base /tmp/after        # PASS = ≤200px noise per shot
```

**Other Gates**: `npx eslint src/components/flashcardStudy` (0 errors / 0 warnings); `npm run build`; `npm test` (pure logic unit suite); `./scripts/test-site-e2e.sh --chromium` (E2E navigation tour).

---

## 9. Known Technical Debt (DO NOT "Fix" Opportunistically)

Identified and accepted SOLID deviations. Delicate code requiring planned refactoring + visual harness + behavior review:

1. **God hooks (SRP)**: `useImageGeneration.js`, `CategorySelector.jsx`, `FlashcardPage.jsx`, `useAudioPlayback.jsx`, `useDeckSession.js`, `FlashcardOnboardingTour.jsx`.
2. **Presentation Authorization**: `canGenerateImages`/`canDeleteImages` checking role directly inside UI hooks instead of domain useCase/policy.
3. **Infra Leak**: `useImageGeneration.js` hardcoding `/card_images/${category}/…` path pattern instead of delegating to `imagePort`.

---

## 10. AI Checklist Before Modifying Frontend

1. Touching the card/study kit? → Re-read §4; capture pixel-diff BEFORE; do not break untouchables.
2. Need new backend data? → Adapter → port typedef → composition.js → consume port (§2). Never direct fetch.
3. New route/page? → Corresponding module manifest (or new module), not `App.jsx` unless shell route.
4. Styling? → Local CSS Modules + existing variables; tokens only from `app-brand.css`; zero `!important`; no new breakpoints; variants via `data-*`.
5. State? → Server state? TanStack Query. Shared UI? Existing provider (§5). Do not create new contexts without exhausting current ones.
6. Verify with harness (§8) and report results — validated appearance is a contract.
7. `docs/REFACTOR_CSS_SPEC.md` is the active CSS quality/structure specification: any change must maintain compliance.
8. **Closing Rule** (`GEMINI.md` root): upon completion, test and update module blueprint in `docs/modules/<module>.md` in the SAME change.
