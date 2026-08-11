/**
 * Lógica pura de resolución de rutas (testeable sin React Router).
 */

export const DASHBOARD_HOME_PATH = '/dashboard';

export function pickHomeRoute(routes, defaultModuleId, getModuleRoutesForId) {
  const defaultModuleRoutes = getModuleRoutesForId(defaultModuleId) || [];
  const homeRoute = defaultModuleRoutes.find((route) => route.path === '/')
    || defaultModuleRoutes[0];

  if (homeRoute && routes.some((route) => route.path === homeRoute.path)) {
    return homeRoute.path;
  }

  const preferred = routes.find((route) => route.path !== '/admin' && route.path !== '/');
  return preferred?.path || routes[0]?.path || '/login';
}

export function shouldUseFlashcardLegacyAlias(landingOwnsRoot, appRoutes) {
  return !landingOwnsRoot
    && appRoutes.some((route) => route.path === '/' && route.moduleId === 'flashcards');
}

/** Home tras login: `/dashboard` si el módulo está activo; si no, módulo por defecto. */
export function resolveAuthenticatedHomePath(
  routes,
  defaultModuleId,
  getModuleRoutesForId,
  { dashboardEnabled = false } = {},
) {
  if (dashboardEnabled && routes.some((route) => route.path === DASHBOARD_HOME_PATH)) {
    return DASHBOARD_HOME_PATH;
  }
  return pickHomeRoute(routes, defaultModuleId, getModuleRoutesForId);
}

export function resolveFallbackPath(pathname, knownAppPaths, authenticatedHomePath) {
  if (knownAppPaths.has(pathname)) return null;
  if (knownAppPaths.has(authenticatedHomePath)) return authenticatedHomePath;
  return '/login';
}

/** Ruta pública tras cerrar sesión o sin credenciales (landing en `/` si está activo). */
export function getPublicEntryPath(landingActive) {
  return landingActive ? '/' : '/login';
}

/**
 * ¿La ruta representa intención de pago? El checkout es el único flujo que mueve dinero:
 * esa intención tiene prioridad sobre el desvío a onboarding (tanto en LoginPage como en
 * ProtectedRoute — única fuente de la política, no duplicar el literal '/checkout').
 */
export function isCheckoutIntentPath(path) {
  if (typeof path !== 'string') return false;
  return path === '/checkout'
    || path.startsWith('/checkout?')
    || path.startsWith('/checkout/');
}

/**
 * Destino tras un login exitoso (sin contar el retorno de feedback del demo, que se
 * resuelve antes y aparte): la ruta protegida original si existía; onboarding solo si
 * está pendiente Y el destino no es el checkout — a un usuario que vino a pagar no se
 * le desvía, el onboarding le llegará al entrar a la app después del pago.
 */
export function resolvePostLoginPath({ from, defaultPath, needsOnboarding }) {
  const target = from || defaultPath;
  if (needsOnboarding && !isCheckoutIntentPath(target)) return '/onboarding';
  return target;
}
