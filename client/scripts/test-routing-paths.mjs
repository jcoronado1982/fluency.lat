import assert from 'node:assert/strict';
import {
  DASHBOARD_HOME_PATH,
  isCheckoutIntentPath,
  pickHomeRoute,
  resolveAuthenticatedHomePath,
  resolveFallbackPath,
  resolvePostLoginPath,
  shouldUseFlashcardLegacyAlias,
} from '../src/modules/routingPaths.js';

const flashcardRoutes = [{ path: '/flashcard', moduleId: 'flashcards', layout: 'app' }];
const dashboardRoutes = [{ path: DASHBOARD_HOME_PATH, moduleId: 'dashboard', layout: 'app' }];
const landingRoutes = [{ path: '/', moduleId: 'landing', layout: 'bare', public: true }];

// Landing activo: home autenticado = /flashcard (sin dashboard)
assert.equal(
  pickHomeRoute(
    [...landingRoutes, ...flashcardRoutes],
    'flashcards',
    () => [{ path: '/flashcard', moduleId: 'flashcards' }],
  ),
  '/flashcard',
);

// Con dashboard activo: login cae en /dashboard
assert.equal(
  resolveAuthenticatedHomePath(
    [...landingRoutes, ...dashboardRoutes, ...flashcardRoutes],
    'flashcards',
    () => [{ path: '/flashcard', moduleId: 'flashcards' }],
    { dashboardEnabled: true },
  ),
  DASHBOARD_HOME_PATH,
);

// Sin dashboard: sigue siendo /flashcard
assert.equal(
  resolveAuthenticatedHomePath(
    [...landingRoutes, ...flashcardRoutes],
    'flashcards',
    () => [{ path: '/flashcard', moduleId: 'flashcards' }],
    { dashboardEnabled: false },
  ),
  '/flashcard',
);

// Sin landing: flashcards en /
const rootFlashcards = [{ path: '/', moduleId: 'flashcards', layout: 'app' }];
assert.equal(
  pickHomeRoute(
    rootFlashcards,
    'flashcards',
    () => [{ path: '/', moduleId: 'flashcards' }],
  ),
  '/',
);

// Legacy alias solo sin landing
assert.equal(
  shouldUseFlashcardLegacyAlias(false, rootFlashcards),
  true,
);
assert.equal(
  shouldUseFlashcardLegacyAlias(true, flashcardRoutes),
  false,
);

// Fallback no redirige si ya estamos en destino
assert.equal(
  resolveFallbackPath(DASHBOARD_HOME_PATH, new Set([DASHBOARD_HOME_PATH, '/flashcard']), DASHBOARD_HOME_PATH),
  null,
);
assert.equal(
  resolveFallbackPath('/unknown', new Set([DASHBOARD_HOME_PATH, '/flashcard']), DASHBOARD_HOME_PATH),
  DASHBOARD_HOME_PATH,
);

// --- Intención de pago: el checkout gana al onboarding -------------------------
// Flujo serio (mueve dinero): login iniciado desde "Start Premium" debe volver al
// checkout, NUNCA desviarse a /onboarding — ni en LoginPage ni en ProtectedRoute.

assert.equal(isCheckoutIntentPath('/checkout'), true);
assert.equal(isCheckoutIntentPath('/checkout?billing=annual'), true);
assert.equal(isCheckoutIntentPath('/checkout?status=success'), true);
assert.equal(isCheckoutIntentPath('/checkout/'), true);
assert.equal(isCheckoutIntentPath('/checkout-fake'), false);
assert.equal(isCheckoutIntentPath('/dashboard'), false);
assert.equal(isCheckoutIntentPath(undefined), false);
assert.equal(isCheckoutIntentPath({ pathname: '/checkout' }), false); // objetos de router: no aplica

// Usuario nuevo (onboarding pendiente) que vino a pagar → checkout intacto
assert.equal(
  resolvePostLoginPath({
    from: '/checkout?billing=annual',
    defaultPath: DASHBOARD_HOME_PATH,
    needsOnboarding: true,
  }),
  '/checkout?billing=annual',
);

// Usuario nuevo con login directo (sin intención previa) → onboarding
assert.equal(
  resolvePostLoginPath({
    from: null,
    defaultPath: DASHBOARD_HOME_PATH,
    needsOnboarding: true,
  }),
  '/onboarding',
);

// Usuario nuevo que venía de una ruta protegida normal → onboarding (el checkout es la excepción)
assert.equal(
  resolvePostLoginPath({
    from: '/flashcard',
    defaultPath: DASHBOARD_HOME_PATH,
    needsOnboarding: true,
  }),
  '/onboarding',
);

// Usuario con onboarding completo → siempre su destino original
assert.equal(
  resolvePostLoginPath({
    from: '/checkout?billing=monthly',
    defaultPath: DASHBOARD_HOME_PATH,
    needsOnboarding: false,
  }),
  '/checkout?billing=monthly',
);
assert.equal(
  resolvePostLoginPath({
    from: null,
    defaultPath: DASHBOARD_HOME_PATH,
    needsOnboarding: false,
  }),
  DASHBOARD_HOME_PATH,
);

console.log('routingPaths: OK');
