# Frontend — Fluency (client/)

> **Documentación exclusiva del frontend.** Léela COMPLETA antes de modificar cualquier archivo bajo `client/`.
> Backend: `backend/GEMINI.md`. Infra: `docs/infrastructure/`. Protocolo e índice general: `GEMINI.md` (raíz).

SPA de estudio de idiomas (flashcards con audio TTS e imágenes IA). **React 19 + Vite 8 + CSS Vanilla con CSS Modules**. Sin TypeScript, sin Redux, sin frameworks CSS (prohibido introducir Tailwind/Sass/styled-components/MUI). Estado de servidor con TanStack Query; estado de UI con Context API.

---

## 1. Arranque y sistema de módulos (leer primero)

La app NO monta rutas estáticas: se ensambla en runtime a partir de **manifiestos de módulo**.

1. `src/main.jsx` → `bootstrap()`: renderiza un loader, ejecuta `initModules()` y recién entonces importa `App.jsx` (los módulos deben estar cargados antes de calcular rutas).
2. `src/modules/index.js` es el **registry**: carga dinámicamente cada módulo según flags `VITE_ENABLE_*` y expone helpers (`getAppRoutes`, `getAppShell`, `getModuleNavSections`, `getModuleOverlays`, `getModuleShellProviders`, `notifyAuthUserSynced`…). El shell NUNCA importa internals de un módulo: todo pasa por el manifiesto.
3. `src/App.jsx` arma el árbol de rutas: `BareLayout` (rutas `layout:'bare'`: landing, login, pricing) vs shell de app (`DashboardShell` si el módulo dashboard está activo, si no `MinimalAppShell`).

**Manifiesto de módulo** (default export de `src/modules/<x>/index.jsx`):

```js
{
  id: 'flashcards',
  enabled: (config) => config.features.flashcards,
  routes: (config) => [{ path, element, layout?, public? }],
  navSections: ({ language, config }) => [...],   // sidebar
  appShell: DashboardShell,                        // solo dashboard
  overlays: (config) => <JSX/>,                    // montado fuera de las rutas
  shellProviders: (config) => [...],               // providers globales del módulo
  floatingMenuItems: ({ language, config }) => [...],
  onboarding: (ctx) => [...],
  authListeners: { onUserSynced, onLogout },       // ciclo de vida auth sin acoplar
  readResumeSession: () => sesión | null,
}
```

**Feature flags** (`.env.development`, perfiles en `client/env-profiles/*.profile`): `VITE_ENABLE_LANDING`, `VITE_ENABLE_DASHBOARD`, `VITE_ENABLE_FLASHCARDS`, `VITE_ENABLE_PAYMENTS`, `VITE_ENABLE_ADMIN`, `VITE_DEFAULT_MODULE`, `VITE_API_URL` (vacío = rutas relativas vía proxy de Vite). Config resuelta en `src/config/index.js` → `config.features.*`. El sparse-checkout puede eliminar módulos del disco: el registry solo carga los presentes.

### Receta: AGREGAR un módulo

El único punto de contacto central es UNA línea en el registry. No se toca `App.jsx`, ni el shell, ni otros módulos.

1. **Crear `src/modules/<nuevo>/index.jsx`** con el manifiesto como default export (mínimo viable):
   ```js
   const nuevoModule = {
     id: 'nuevo',
     enabled: (config) => config.features.nuevo,
     routes: (config) => [{ path: '/nuevo', element: <ProtectedRoute><NuevoPage /></ProtectedRoute> }],
     navSections: ({ language, config }) => [/* entrada de sidebar, opcional */],
   };
   export default nuevoModule;
   ```
   Estructura interna recomendada (copiar de `pricing/`, el módulo más pequeño): `ports/` + `adapters/` + `useCases/` + `composition.js` + páginas/features. Datos del backend SIEMPRE vía puerto (§2).
2. **Registrar el loader** en `src/modules/index.js` (array `moduleLoaders`), condicionado a su flag:
   ```js
   if (import.meta.env.VITE_ENABLE_NUEVO === 'true') {
     moduleLoaders.push(['nuevo', () => import('./nuevo/index.jsx')]);
   }
   ```
3. **Declarar el feature** en `src/config/index.js` (`sharedFeatures.nuevo = import.meta.env.VITE_ENABLE_NUEVO === 'true'`) y añadir `VITE_ENABLE_NUEVO` a `.env.development` y a los perfiles de `env-profiles/` que apliquen.
4. **Verificar**: `node scripts/test-routing-paths.mjs` (rutas), `npm run build`, y arrancar con el flag en `true` y en `false` (la app debe funcionar igual sin el módulo).

### Receta: QUITAR un módulo

- **Temporal (reversible, lo normal)**: poner su `VITE_ENABLE_*=false` en el perfil. Nada más — rutas, sidebar, overlays y menú flotante se recalculan solos; si era el home, `getAuthenticatedHomePath`/`pickHomeRoute` eligen otro; si era el `appShell` (dashboard), cae a `MinimalAppShell`.
- **Físico (sparse-checkout)**: quitar el directorio del disco con el perfil sparse (ver `docs/GIT_SPARSE_WORKFLOW.md`). El registry solo carga lo presente; el flag debe estar en `false` para que el `import()` no se intente.
- **Permanente (borrado real)**: eliminar `src/modules/<x>/`, su línea en `moduleLoaders`, su feature en `config/index.js` y sus flags en `.env*`/`env-profiles/`. Antes de borrar, comprobar que nada externo lo importa: `grep -rn "modules/<x>" src/ --include="*.js*"` debe devolver solo el propio módulo y el registry. Lo compartido NO se borra con el módulo: `contracts/`, `components/flashcardStudy`, `src/adapters` pertenecen al shell.

**Garantía verificada (2026-07-14, re-auditada 2026-07-26)**: cada módulo tiene su propio `composition.js`; el perfil `admin.profile` corre la app sin módulos de estudio. Los imports horizontales que se detectaron se resuelven caso por caso: `getCourseDirectionFromStudyLanguage` y (desde 2026-07-26) `SrsEngine` viven en `contracts/` porque son lógica pura sin dependencias — `deckUseCases.js` y `flashcards/domain/SrsEngine.js` los re-exportan para sus consumidores internos. Excepciones conocidas que SÍ quedan como import horizontal aceptado (no mecánicas de mover, ver §9): `flashcards/index.jsx` y `pricing/CheckoutPage.jsx` importan del registro (`../index`, deuda #5). La deuda #6 (`dashboard` → `flashcards/useCases` por `formatDeckCategoryName`) se resolvió el 2026-07-26: la i18n compartida de nombres de grupo vive en `contracts/deckGroupTranslations.js` (`DECK_GROUP_TRANSLATIONS_ES`), `formatDeckCategoryName` es pura en `contracts/deckOrder.js` (recibe el diccionario de traducción como parámetro) y cada módulo la envuelve con su propio idioma — `dashboard` ya no importa nada de `flashcards`.

---

## 2. Arquitectura hexagonal (puertos y adaptadores)

Cada módulo replica la arquitectura del backend Rust (`fluency_core::ports`):

```
useCases (aplicación, lógica PURA, sin fetch ni React)
    ↓ consume
ports (contrato congelado: createXxxPort(adapter) → Object.freeze)
    ↓ implementado por
adapters (infraestructura: *HttpAdapter.js, usan httpClient)
    ↓ cableado en
composition.js (composition root del módulo — equivalente al wiring de api_main)
```

- **Puertos**: `src/modules/flashcards/ports/{flashcardPort,audioPort,imagePort}.js`, `src/modules/dashboard/ports/…`, `src/modules/pricing/ports/…`. Documentan el contrato con `@typedef`. Compartidos: `src/adapters/studyPorts.js`.
- **Adaptadores HTTP**: mismo directorio `adapters/` de cada módulo + `src/adapters/` (audio/imagen de estudio compartidos). Son el ÚNICO lugar con URLs de API.
- **`src/services/httpClient.js`**: cliente único — añade `Authorization: Bearer` desde `localStorage.auth_token`, lanza en non-2xx. **Recuperación de 401 (jul 2026, bug real)**: un token vencido/inválido hacía fallar EN SILENCIO toda la app (categorías, mazos, progreso — reportado por usuario: "no está cargando los mazos", diagnosticado con 401 en consola en `/api/flashcards-data`) porque no había ningún manejo de 401 — el usuario quedaba atrapado sin pista de que debía volver a iniciar sesión. Ahora, si una respuesta 401 llega habiendo token guardado, `httpClient` llama a `clearSessionScopedStorage()` (`utils/sessionStorage.js`) y fuerza `window.location.reload()` — la próxima carga arranca sin sesión y las rutas protegidas mandan solas a login, en vez de dejar la UI rota indefinidamente. **Ese borrado va SIEMPRE por `utils/sessionStorage.js`, nunca con `removeItem` sueltos ni importando el storage de un módulo de negocio** (ago 2026: `httpClient` llegó a importar `pendingPremiumStorage` de pricing — infra dependiendo de un módulo opcional, DIP invertido). Ese archivo es el dueño único de `auth_token`/`auth_user` y declara qué muere con la sesión; lo consumen `httpClient` y `AuthRepository.logout()`. Es hoja a propósito: `AuthRepository` importa `httpClient`, así que un import en sentido contrario haría ciclo. Verificado emitiendo un JWT de prueba local (firmado con el `JWT_SECRET` de `backend/.env`, mismo mecanismo que `dev-guest`) para una cuenta real: con token fresco, categorías/mazos/tarjetas cargan con datos reales; el bug era 100% de sesión, no de datos. TODO fetch pasa por aquí (no usar `fetch`/`axios` directo en componentes). Excepciones justificadas (auditadas 2026-07-14, re-verificadas 2026-07-26, no son violaciones): el beacon `keepalive:true` de `useDeckSession.flushProgressBeacon` (beforeunload no admite el httpClient — mismo patrón duplicado en `useSrsDeckSession.js`), el `preload` cancelable de audio en `adapters/studyAudioHttpAdapter.js` (streaming binario que calienta la caché HTTP; vive en la capa adapter, que es la correcta), el `fetch` directo del catálogo estático en `modules/flashcards/adapters/staticDeckHttpAdapter.js` (JSON same-origin versionado, cacheado por el navegador; misma capa adapter) y los bindings generados `services/wasm_lib.js`.
- **`composition.js`** por módulo: instancia puertos con sus adaptadores. Los componentes importan **puertos ya cableados**, jamás adaptadores.
- **useCases**: `deckUseCases.js`, `deckSessionUseCases.js`, `dashboardProgress.js`… funciones puras testeables (ordenamiento de catálogo, progreso, sesiones). La cabecera de `deckUseCases.js` documenta cómo añadir ordenamientos de categorías (toca también `contracts/catalogOrder.json` y el ETL).

**Regla de dependencias (inviolable)**: presentación → useCases/ports → adapters → httpClient. Nunca al revés; nunca un componente conoce URLs; nunca un useCase importa React.

---

## 3. Rootmap de `src/`

```
src/
├── main.jsx                    ← bootstrap asíncrono (initModules → App)
├── App.jsx                     ← árbol de rutas por capas (bare vs app shell), redirects
├── App.css                     ← layout del shell + dimensiones dinámicas flashcard (--fc-*)
├── index.css                   ← reset, :root, prefers-reduced-motion GLOBAL, tipografía app
├── config/                     ← flags/features (index.js), API_URL (api.js), traducciones
├── contracts/                  ← contratos ENTRE módulos (no tocar sin revisar consumidores):
│   ├── landingDemoNamespace.js    categoría/deck/límite del demo público + rutas de imagen
│   ├── studyMediaVariants.js      variante 'app' vs 'landing-demo' (elige proveedor TTS/imagen backend)
│   ├── courseDirection.js         studyLanguage → course_direction (lo usan kit, dashboard y flashcards)
│   ├── srsEngine.js               motor SM-2 puro (lo usan flashcards y dashboard; flashcards/domain/SrsEngine.js re-exporta)
│   ├── deckOrder.js               orden de mazos + formatDeckCategoryName pura (sin i18n) — flashcards y dashboard
│   ├── deckGroupTranslations.js   traducción ES de nombres de grupo (única fuente; flashcards la reexpone)
│   └── catalogOrder.json          orden del catálogo (sincronizado con ETL/DB)
├── context/                    ← estado global compartido:
│   ├── AuthContext.jsx            sesión JWT, restore, onboardingRequired, navigate post-login
│   ├── UIContext.jsx              idioma UI + idioma de estudio, appMessage, sidebar/menú/header
│   ├── DialogContext.jsx          confirm/alert (FluencyDialog)
│   └── AppContext.jsx             fachada: re-exporta UIProvider/useDialog
├── services/httpClient.js      ← ÚNICO cliente HTTP (JWT automático)
├── adapters/                   ← puertos+adaptadores de media de estudio compartidos (audio/imagen)
├── repositories/               ← AuthRepository (token/usuario en localStorage), adminRepository
├── hooks/usePresence.js        ← heartbeat de presencia (admin lo consume)
├── utils/                      ← browserLanguage, onboardingStorage, demoFeedbackStorage, clientInfo
├── styles/
│   ├── app-brand.css              ⭐ FUENTE ÚNICA de tokens de marca (--brand-*) por ámbitos
│   ├── fonts.css                  @font-face locales (scripts/download-fonts.js las baja)
│   └── shell-layout.css           esqueleto html/body/#root
├── pages/                      ← páginas del shell (Login, Admin, Onboarding, Grammar, Test)
├── components/
│   ├── common/                    ProtectedRoute, AdminRoute, PageLoader, LanguageSelector, FluencyDialog
│   ├── pwa/                       experiencia PWA online-first, separada por SRP: registerServiceWorker,
│   │                              useOnlineStatus, useInstallPrompt, PwaNotice/OfflineNotice/InstallPrompt,
│   │                              PwaExperience (orquestador) y la barra inferior PwaShellNavigation
│   │                              (container, montado 1 vez en App.jsx) + PwaBottomDock (presentacional)
│   ├── routing/SafeRedirect.jsx
│   ├── shell/                     BareLayout, MinimalAppShell, ShellFooter
│   └── flashcardStudy/         ⭐ KIT COMPARTIDO de la tarjeta (ver §4 — recién refactorizado)
│       ├── index.js               API pública: Flashcard, Controls, StudyMediaProvider, contexts
│       ├── StudyMediaContext.jsx  inyecta audioPort/imagePort/variante ('app'|'landing-demo')
│       ├── uiBridge.js            registry de acciones UI (la tarjeta activa registra handlers)
│       ├── context/flashcardStudyContext.js   los 3 contexts CANÓNICOS (ver §5)
│       └── features/              Flashcard, CardFront, CardBack, ConjugationTable,
│                                  DefinitionList, ImageViewer, Controls, HighlightedText,
│                                  useAudioPlayback, useImageGeneration, useRealViewportHeight,
│                                  useNextImagePrefetch + imagePrefetchCache (precarga de la
│                                  imagen de la tarjeta SIGUIENTE: 1 sola por delante, debounce
│                                  600ms, sin reintentos, TTL 5min; useImageGeneration consulta
│                                  la caché antes del POST a resolve-image)
│                                  + un .module.css POR componente (SRP)
└── modules/                    ← módulos con manifiesto:
    ├── index.js                   registry (ver §1)
    ├── routingPaths.js            lógica pura de rutas (testeada por scripts/test-routing-paths.mjs)
    ├── flashcards/                módulo de estudio autenticado
    │   ├── index.jsx              manifiesto (ruta '/' o '/flashcard', overlays, tour, preload)
    │   ├── composition.js         wiring flashcardPort/audioPort/imagePort
    │   ├── FlashcardPage.jsx      ORQUESTADOR de página (solo compone; sin lógica de dominio)
    │   ├── FlashcardOverlays.jsx / FlashcardOnboardingTour.jsx / OnBoardingFlashcard.jsx
    │   ├── uiBridge.js            re-export del bridge compartido
    │   ├── ports/ adapters/ useCases/ services/ (imageCompressionService: encode AVIF vía WASM)
    │   ├── context/               Providers del módulo que ALIMENTAN los contexts canónicos (§5)
    │   ├── config/                traducciones, orden de catálogo, claves de sesión, plan del tour
    │   └── features/              UI propia del módulo: CategorySelector, IpaModal, PhonicsModal,
    │                              CompletionCard, ToneSelector, CardCounter.module.css
    │                              ⚠️ Flashcard.jsx y useAudioPlayback.jsx aquí son SHIMS re-export
    │                              vivos (los usan index.jsx/tour/PhonicsModal) — NO borrar
    ├── dashboard/                 shell de app (appShell: DashboardShell) + home
    │   ├── layout/                Header, Sidebar, Footer, FloatingMenu, Layout.css
    │   └── ports/ adapters/ useCases/ features/ (stats, recomendaciones)
    ├── landing/                   pública ('/'): hero + DEMO de la tarjeta (usa el kit §4)
    └── pricing/                   PricingPage, CheckoutPage (+ ports/adapters/useCases)
```

---

## 4. El kit compartido `components/flashcardStudy` (crítico)

**Una sola tarjeta, dos consumidores**: la app autenticada (`modules/flashcards/FlashcardPage`) y el demo público de la landing (`modules/landing/features/demo`). El mismo `<Flashcard/>` renderiza ambos. Diferenciación por:

- **`StudyMediaProvider`** (`mediaVariant: 'app' | 'landing-demo'`): inyecta puertos de audio/imagen. En demo, el backend enruta a ElevenLabs+Gemini por `category='landing-demo'` (contrato en `contracts/`). El hook `useStudyMediaContext` LANZA si falta el provider.
- **`data-variant='app'|'demo'`**, **`data-layout='conjugation'|'standard'`**, **`data-state`** en el DOM: los CSS Modules estilan por estas variantes explícitas (NO por cadenas de selectores estructurales).
- **`uiBridge`**: mapa de acciones global — la tarjeta activa registra handlers (`registerUiBridgeHandler`) y el catálogo/tour los invoca (`invokeUiBridge`). Los NOMBRES de acción son contrato: no renombrar.

**Estado del refactor (jul 2026) — reglas al tocar estos archivos:**

- **0 `!important`** en todo el kit. No introducir ninguno: usa el bloque de variante correcto y orden+especificidad.
- `.cardFront` es **Grid con áreas** `'header' 'conjugation' 'examples' 'image'`; cada región declara su `grid-area` en su propio módulo CSS. Flexbox solo para grupos lineales (controles, filas de ejemplos, tabla de conjugación).
- **Piel de las caras** = variables en `.flashcardContainer`: `--fc-face-border`, `--fc-face-bg`, `--fc-face-shadow`, `--fc-card-shadow` (las variantes app, app-móvil y demo las redefinen). Desde jul 2026 la variante `data-variant='app'` define su piel con los tokens de profundidad de `app-brand.css` (`--brand-surface-card` sólida + `--brand-border-subtle` hairline); el lienzo del shell usa `--brand-canvas`. Los iconos de la app van neutros en reposo (`--brand-icon-idle`) y rosa al interactuar — el verde queda solo en el check de "aprendida". El demo de landing comparte desde jul 2026 el borde hairline y el tratamiento de la barra de controles (iconos neutros, verde solo en el check, trazo 2), pero conserva su fondo ciruela propio (`--lp-demo-surface` en `hero-demo.css` — decisión explícita: armoniza con la landing), su geometría (tamaños de tarjeta/imagen), sus sombras de flip y el rosa en reposo de los iconos de la cara. NO re-hardcodear estos valores.
- **Container Queries: decisión CERRADA y documentada** en el comentario inicial de `Flashcard.module.css`. La relación viewport→ancho de tarjeta NO es monótona (app: 620px fijos en escritorio, salta a ~748px al cruzar a ≤768px; demo hero: 282px→660px al colapsar columnas), así que ningún umbral de contenedor replica el corte de 768px. Los contenedores `flashcard`/`flashcard-face` quedan declarados solo para reglas futuras. No "modernizar" las media queries a `@container` sin nuevas mediciones.
- Solo **2 familias de breakpoints** generales: `max-width: 768px` (colapso de layout de página) y `min-width: 768.02px + max-height: 900px` (portátiles con poca altura). El `.02` es deliberado: con escalado fraccional del SO el ancho lógico puede ser 768.5px y no debe caer en un hueco entre bloques. No añadir breakpoints puntuales. **Excepción versionada** (commit `responsive`, jul 2026): la banda `min-width: 769px + max-width: 1349px` en 4 archivos del kit (Flashcard, Controls, DefinitionList, ConjugationTable) ajusta SOLO la variante `data-variant='demo'` en portátiles. Ojo: usa `769px`, no `768.02px`, así que a 768.5px lógicos esas reglas demo no aplican (deuda visual conocida, solo bajo escalado fraccional); unificarla a `768.02px` requiere arnés pixel-diff, nunca fix oportunista.
- **Altura real del viewport**: `useRealViewportHeight` mide `window.innerHeight` y lo publica como `--fc-real-vh` en `:root` (workaround del bug de `dvh` bajo escalado fraccional en Linux/Chromium). Toda fórmula de alto usa `var(--fc-real-vh, 100dvh)`. No volver a `dvh` puro.
- Los 8 `:global()` restantes (DefinitionList) pertenecen al **tour de onboarding** (`body:has([data-tour-step=…])`) — intocables.
- `.conjugationAudioBtn` existe en JSX pero va `display:none` deliberado (el audio se dispara al clicar la forma verbal).

**Intocables del kit** (integraciones externas al CSS): todos los `data-tour="…"`, `data-onboarding-tour`, `data-flipped`, `data-fc*`; props públicas de los componentes; eventos de teclado/click/swipe; los nombres del uiBridge.

## 5. Contextos: patrón puente (no duplicar contexts)

Los `createContext` canónicos viven en `components/flashcardStudy/context/flashcardStudyContext.js` (`FlashcardContext`, `FlashcardUiContext`, `CategoryContext`). Los **Providers** viven en `modules/flashcards/context/*` e importan esos mismos objetos (`export const FlashcardUiContext = StudyFlashcardUiContext`). Así el kit compartido consume el contexto sin depender del módulo. Si necesitas exponer algo nuevo a la tarjeta: añádelo al Provider del módulo, no crees otro context.

Estado global restante: `AuthContext` (JWT + `authRepository`), `UIContext` (**dos idiomas distintos**: `language` = idioma de interfaz, `studyLanguage` = dirección del curso es_en/en_es — no confundirlos), `DialogContext`, y TanStack Query (`queryClient` en main.jsx) para datos de servidor.

---

## 6. Arquitectura CSS (orden de capas)

1. `styles/fonts.css` → 2. `styles/app-brand.css` → 3. `styles/shell-layout.css` → 4. `index.css` (importados en ese orden en `main.jsx`); `App.css` lo importa `App.jsx`; el resto es CSS Modules por componente + CSS por página en su módulo.

- **`app-brand.css` es la ÚNICA fuente de tokens de marca** (`--brand-rose`, `--brand-gradient`, `--brand-surface`…), aplicados por ámbito (`.app-layout`, `.flashcard-page-wrapper:not([data-landing-demo])`, `.admin-page`…). Otros archivos SOLO consumen o alias-an (`--dash-*` en DashboardHome.css son alias de `--brand-*`). No redefinir tokens fuera de aquí.
- `index.css`: reset global + **`prefers-reduced-motion` global** + tipografía de la app autenticada (no landing/login).
- `App.css`: esqueleto del shell (`.main-content` es flex column DELIBERADO, no Grid: los overrides `:has()` de onboarding/móvil dependen de esa semántica) + cálculo de dimensiones de la tarjeta (`--fc-card-height` a partir de `--fc-real-vh` menos offsets de header/footer/controles). ⚠️ Historia: hubo un bug de doble conteo de altura (el shell YA reserva el header con `padding-top`; no restar el offset otra vez en contenedores hijos).
- Sidebar real 256px vs offset 260px (`--app-sidebar-width`): los 4px son aire intencional (documentado en Layout.css).
- CSS Modules hashea clases POR ARCHIVO: **no** escribir clases de un módulo en CSS plano (no matchean — esa clase de regla muerta ya se purgó de hero-demo/responsive) y **no** partir un `.module.css` sin revisar `composes` (DefinitionList/ConjugationTable componen `spinner`/`rotateVoiceBtn`/`loadingAudioBtn` desde `Flashcard.module.css`).
- **Iconografía (jul 2026): una sola familia.** Todo icono nuevo sale de `react-icons/lu` (Lucide). Los `react-icons/fi` (Feather — misma familia visual, precursora de Lucide) sobreviven SOLO en el kit compartido con el demo (`FiPlay`, `FiRefreshCw`, `FiHeadphones`, `FiCpu`): sus equivalentes Lucide tienen glifos rediseñados y migrarlos cambiaría la landing. `react-icons/fa` (Font Awesome) queda **prohibido** en la app interna (erradicado). Grosor de trazo único `--brand-icon-stroke: 2` (app-brand.css): en la cara de la tarjeta se aplica con ámbito `[data-variant='app']` (ahí el demo conserva sus 2.5/3); la **barra de controles está unificada app+demo** (jul 2026, pedido explícito): repetir neutro→rosa hover, verde solo en el check, trazo 2 en ambas variantes. No hardcodear `stroke-width` nuevos. Excepciones ópticas documentadas: caret data-URI de 12px de ToneSelector y las líneas de gráfico de IpaModal (data-viz, no iconos).

---

## 7. SOLID / Clean en este código (cómo se aplican al modificar)

- **SRP**: páginas orquestan, no implementan (`FlashcardPage` solo compone); cada sección visual es componente propio con su `.module.css`; cada hook una responsabilidad (`useAudioPlayback` ≠ `useImageGeneration`).
- **OCP**: features nuevas = módulo nuevo con manifiesto o entrada nueva en el manifiesto; variantes visuales = `data-variant`/variables CSS, no reescritura de reglas.
- **LSP/ISP**: los puertos son contratos congelados — un adaptador nuevo (p.ej. mock) debe implementar el typedef completo; los componentes reciben SOLO las props que usan.
- **DIP**: presentación depende de puertos, jamás de adaptadores/HTTP. Si necesitas un endpoint nuevo: añádelo al adapter, decláralo en el typedef del puerto, expónlo vía composition.js.
- **No mezclar** cambios funcionales con visuales en el mismo commit; no mover lógica entre capas sin justificación.

---

## 8. Cómo verificar cambios (obligatorio antes de dar por bueno un cambio visual)

**Levantar entorno** (la DB corre en Docker: contenedores `surrealdb` y `flashcard-db`):

```bash
cd backend && ./target/debug/api_main &      # API en :8081
cd client && npm run dev &                    # Vite en :5173 (proxy /api, /card_images, /card_audio → 8081)
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # login local sin OAuth (JWT de invitado admin)
```

**Arnés de regresión visual** (Playwright con Chrome del sistema `channel='chrome'` + PIL):

```bash
python3 scripts/refactor_visual_shots.py /tmp/base                  # ANTES de tocar
# ... cambios ...
python3 scripts/refactor_visual_shots.py /tmp/after
python3 scripts/refactor_visual_diff.py /tmp/base /tmp/after        # PASS = ≤200px de ruido por captura
```

Captura 9 estados × 3 viewports (1920×1080, 1366×768, 390×844) con determinismo forzado (animaciones congeladas con `animation-delay:-100s`, datos aleatorios del dashboard enmascarados, espera de imágenes/spinners). Ruido conocido: catálogo-desktop ±4px, antialias del título en móvil. Para lo que el pixel-diff no cubre (bandas de viewport intermedias, dorso del demo): comparar `getComputedStyle` HEAD vs cambio con Playwright.

**Otros gates**: `npx eslint src/components/flashcardStudy` debe dar **0 errores / 0 warnings** (las excepciones de `exhaustive-deps` que quedan están justificadas con comentario); `npm run build` (genera además el manifiesto de catálogo); `npm test` — suite unitaria de lógica pura SIN framework (scripts Node planos con `node:assert/strict` en `client/scripts/test-*.mjs`: rutas, contratos landing-demo/media, deckUseCases, deckSessionUseCases, imagePrefetchCache, y (2026-07-26) `test-http-adapters.mjs` — contrato URL/método de cada adapter HTTP de módulo: flashcards, srs, los 3 de dashboard y el stub de pricing; para módulos que leen `localStorage` dentro de una función se shimea `globalThis.localStorage` antes del import — ver `test-deck-use-cases.mjs`). Tests nuevos = otro `test-*.mjs` + entrada `test:*` en package.json + encadenarlo en `"test"`. Solo lógica pura importable desde Node: nada que importe React ni `import.meta.env`. Vitest (`test:components`) además cubre desde 2026-07-26 el wiring de `composition.js` (frozen ports) en flashcards/dashboard/pricing, el hook `useLearningStats` (invariante de no pisar el último stats bueno) y el flujo de validación/submit de `CheckoutPage`.

**Gate local de preproducción**: `../scripts/test-local-preprod.sh --quick` ejecuta Rust/Nextest,
la suite Node, propiedades con `fast-check`, Vitest + React Testing Library y el build. Con
`./start.sh` activo, `--full` suma smoke HTTP, SurrealDB 3.2.3 real y Playwright en Chromium,
Pixel 7 e iPhone 14/WebKit. `--all` agrega k6 durante 10 s; los scripts de integración y carga
rechazan hosts distintos de `localhost` y `127.0.0.1`. También prueban adaptadores, IndexedDB,
compresión AVIF, audio/imagen existentes, progreso individual/lote/SRS y carga autenticada.
Playwright intercepta generación/borrado de media externa. En `--full`/`--all`, el backend debe
confirmar el bloqueo global con HTTP 423 y el runner compara un inventario SHA-256 completo de
`card_audio/`, `card_images/` e `img/` (también ignorados/no versionados). El gate nunca limpia
media automáticamente: ante cualquier diferencia falla y conserva los archivos para revisión.

**Recorrido E2E completo del sitio con un solo comando** (ago 2026, nacido del incidente #12 de la
troubleshooting library) — correrlo SIEMPRE antes de promover un cambio de flashcards a producción:

```bash
./scripts/test-site-e2e.sh              # 3 navegadores (Chromium, Pixel 7, WebKit/iPhone) — varios minutos
./scripts/test-site-e2e.sh --chromium   # solo escritorio — ~2 min, el modo normal para iterar
```

No requiere preparación manual: el script detecta si `:5173` (Vite) y `:8081/api/health` (backend)
ya responden; si no, lanza `./start.sh local` en background, espera hasta 3 min y lo apaga al
terminar (si el stack ya estaba arriba, lo deja intacto). Si falla: la salida de Playwright nombra
el test y la aserción exacta; si el fallo es "el stack local no levantó", revisar el log en
`$TMPDIR/fluency-test-site-e2e-start.log` (normalmente `/tmp/...`); para depurar un test puntual con
navegador visible, `cd client && npx playwright test first-login-and-full-navigation --headed
--project=desktop-chromium`; el reporte HTML queda en `client/playwright-report/`. La cobertura de
navegación total vive en
`e2e/first-login-and-full-navigation.spec.js`: (1) primer login real — wizard de onboarding de 4
pasos + tour interactivo completo hasta la primera lección; (2) regresión: cerrar el tour con la ×
mientras fuerza el catálogo abierto lo deja todo cerrado; (3) regresión: entrar vía dashboard →
menú "Categorías" (navegación con `state {openCatalog}`) y elegir mazo — el catálogo cierra y se
QUEDA cerrado; (4) walkthrough de todo el shell: sidebar completo, las 9 categorías del catálogo,
niveles, popover de ayuda, tarjeta (flip/nav/audio), diálogo de reset, cambio de dirección de
estudio y rutas públicas; (5) generación de imagen y voz como admin con los servicios de
producción EMULADOS — `page.route` responde `generate-image`/`synthesize-speech`/`delete-audio`
con el contrato real (`{path}`/`{audio_url}`/`{previous_voice}`) apuntando a assets locales
existentes, sin llamar a Gemini; el flujo de UI real es: elegir motor del prompt (diálogo
Gemini/Local) → confirmar "Update image?" → POST; (6) roles `premium` y `user` — se fuerza el rol
efectivo reescribiendo `/api/auth/me` (fuente del rol en `AuthContext`) y se verifica que NUNCA
ven los controles admin de media pero estudian con normalidad. Cada test acumula errores de
consola/página/respuestas API y falla ante cualquiera fuera del allowlist comentado en el spec
(contratos 404 de resolve-image/audio, aborts por navegación, autoplay bloqueado, y el flake local
de SurrealDB "Specify a namespace" en `/api/auth/me`).

**PWA online-first:** `public/manifest.webmanifest` define la identidad instalable y `public/sw.js`
delega las navegaciones directamente a la red, sin Cache Storage ni interceptar API, catálogos o
media. `components/pwa/` está partida por responsabilidad única: `registerServiceWorker.js`,
`useOnlineStatus.js`, `useInstallPrompt.js` y los avisos `PwaNotice`/`OfflineNotice`/`InstallPrompt`,
orquestados por `PwaExperience.jsx`. La navegación inferior de la app instalada sigue el patrón
WhatsApp iOS (referencia: `menu.jpg` en la raíz): píldora FLOTANTE de cristal translúcido con
márgenes, pestañas constantes Inicio/Estudiar/Categorías/Idioma, iconos pequeños y pestaña activa
con pastilla clara envolviendo icono+etiqueta (tokens `--pwa-nav-*`): `PwaShellNavigation.jsx`
(container, montado UNA vez en `App.jsx`) + `PwaBottomDock.jsx` (presentacional). Las páginas NO
montan navegación PWA propia; `Categorías` usa el uiBridge (`openCatalog`) sobre la sesión de
estudio activa. ⚠️ En standalone `overscroll-behavior-y` debe ser `contain` (html), nunca `none`
en html+body: con `none` Chrome descarta el gesto táctil y la página deja de scrollear.
Validar con `npm run test:pwa`, `npm run build` y `npm run preview:pwa`; este último fija
`http://localhost:4173`, aplica el header requerido por Google Identity Services en pruebas HTTP y
proxyfica API/media al backend local `:8081`. El OAuth client debe autorizar exactamente ese origen.
En producción, manifest y service worker deben responder con su MIME real y no caer al HTML de la SPA.

---

## 9. Deudas conocidas (NO "arreglar" de pasada)

Desviaciones SOLID identificadas y aceptadas (jul 2026, re-auditadas 2026-07-26). Son el código más delicado de la app (reintentos, carreras de generación, refs de secuencia, orden de catálogo probado); cualquier corrección requiere refactor planificado + arnés visual + revisión de comportamiento, nunca un fix oportunista:

1. **Hooks-dios (SRP)**: `useImageGeneration.js` (~909 líneas y creciendo: resolución + pipeline de generación + upload + borrado + reintentos + demo + bootstrap), `CategorySelector.jsx` (~925, subió de ~780), `FlashcardPage.jsx` (~615, subió de ~550), `useAudioPlayback.jsx` (~490), `useDeckSession.js` (~848: orquestación HTTP del flashcardPort + lectura/escritura de `localStorage` + lógica SRS + outbox IndexedDB, todo en un solo hook), `FlashcardOnboardingTour.jsx` (~1029, el archivo más grande del cliente: medición de viewport/DOM + máquina de estados del tour + temporizadores + `ResizeObserver` + render vía `createPortal`).
2. **Autorización en presentación**: `canGenerateImages`/`canDeleteImages` con `user?.role === 'premium'|'admin'` dentro de `useImageGeneration` — política de dominio que debería ser un useCase/policy.
3. **Fuga de infraestructura**: `useImageGeneration.js` (`pathMatchesDeck`) hardcodea el patrón `` `/card_images/${category}/…` `` en vez de delegar en `imagePort`.
4. **useCase impuro**: `deckUseCases.js` se declara "lógica pura" pero lee `localStorage` (~línea 609).
5. **Módulo→registry**: `modules/flashcards/index.jsx` importa `isDefaultHomeModule` desde `../index` (ciclo suave; funciona por import dinámico, pero invierte la dirección de dependencia). Mismo patrón en `modules/pricing/CheckoutPage.jsx` (importa `getAuthenticatedHomePath` de `../index`).
6. ~~`dashboard` → `flashcards` (import horizontal)~~ — **resuelto 2026-07-26**: `sortDeckNames`, `getLevelFromDeckName`, `getDeckCategoryName`, las tablas `XXX_DECK_ORDER` y `formatDeckCategoryName` (ahora pura, recibe el diccionario de traducción por parámetro) viven en `contracts/deckOrder.js`; la traducción ES de nombres de grupo vive en `contracts/deckGroupTranslations.js` (`DECK_GROUP_TRANSLATIONS_ES`, única fuente — `flashcards/config/translations.js` la reexpone en `categorySelector.groups` para sus propios consumidores). `deckUseCases.js` re-exporta/envuelve para sus consumidores internos (sin cambios de firma); `dashboard/useCases/dashboardProgress.js` ya no importa nada de `flashcards`.
6. **`!important` fuera del kit** (auditado 2026-07-14; el kit sigue en 0): `FlashcardOnboardingTour.module.css` (41 — overrides del tour sobre estilos del kit, en parte inherentes a pisar estilos ajenos), `CardCounter.module.css` (27), `IpaModal.module.css` (8), `CategorySelector.module.css` (7), `pages/LoginPage.css` (4), `landing/styles/why-cta.css` (2). Reducirlos = mismo tratamiento que el refactor del kit: por archivo, con arnés pixel-diff, nunca de pasada.
7. **Breakpoints sueltos fuera del kit** (auditado 2026-07-14): apariciones únicas o casi únicas de `767px`, `760px`, `680px`, `860px`, `901px`, `520px`… en landing/pricing/dashboard, contra la regla del spec `refactor` de no añadir breakpoints por defecto aislado. Este CSS está PROBADO en móvil, portátil y PC — consolidarlos a las familias canónicas (768/768.02/900/720/480/1600) solo con arnés pixel-diff por archivo, nunca de pasada.

## 10. Checklist para la IA antes de modificar el frontend

1. ¿Toca la tarjeta/kit de estudio? → relee §4; captura pixel-diff ANTES; no rompas los intocables.
2. ¿Necesita datos nuevos del backend? → adapter → typedef del puerto → composition.js → consumir el puerto (§2). Nunca fetch directo.
3. ¿Ruta/página nueva? → manifiesto del módulo correspondiente (o módulo nuevo), no `App.jsx` salvo rutas del shell.
4. ¿Estilos? → CSS Modules locales + variables existentes; tokens solo desde `app-brand.css`; cero `!important`; sin breakpoints nuevos; variantes por `data-*`.
5. ¿Estado? → ¿es de servidor? TanStack Query. ¿UI compartida? Provider existente (§5). No crear contexts nuevos sin agotar los actuales.
6. Verifica con el arnés (§8) y reporta el resultado (PASS/FAIL con píxeles) — la apariencia validada es un contrato.
7. `docs/REFACTOR_CSS_SPEC.md` (antes el archivo `refactor` en la raíz) es la especificación de calidad CSS/estructura vigente: cualquier cambio debe seguir cumpliéndola.
8. **Regla de cierre** (`GEMINI.md` raíz): al terminar, testear y actualizar el plano del módulo en `docs/modules/<módulo>.md` en el MISMO cambio (nuevos endpoints consumidos, archivos nuevos en el mapa, invariantes).
