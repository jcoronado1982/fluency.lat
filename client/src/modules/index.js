import {
  pickHomeRoute as pickHomeRoutePure,
  resolveAuthenticatedHomePath,
  getPublicEntryPath,
  resolveFallbackPath,
  shouldUseFlashcardLegacyAlias,
} from './routingPaths';

const moduleLoaders = [];

if (import.meta.env.VITE_ENABLE_LANDING === 'true') {
  moduleLoaders.push(['landing', () => import('./landing/index.jsx')]);
}

if (import.meta.env.VITE_ENABLE_PAYMENTS !== 'false') {
  moduleLoaders.push(['pricing', () => import('./pricing/index.jsx')]);
}

if (import.meta.env.VITE_ENABLE_DASHBOARD !== 'false') {
  moduleLoaders.push(['dashboard', () => import('./dashboard/index.jsx')]);
}

if (import.meta.env.VITE_ENABLE_FLASHCARDS !== 'false') {
  moduleLoaders.push(['flashcards', () => import('./flashcards/index.jsx')]);
}




/** @type {Array<{ id: string, enabled?: Function, routes?: Function, [key: string]: unknown }>} */
let modules = [];

/** Carga los módulos presentes físicamente; sparse-checkout decide qué existe en disco. */
export async function initModules() {
  modules = [];

  for (const [path, loadModule] of moduleLoaders) {
    const { default: moduleDef } = await loadModule();
    if (!moduleDef?.id) {
      throw new Error(`Module '${path}' must export a default object with an id`);
    }
    modules.push(moduleDef);
  }

  return modules;
}

function normalizeRoute(route, moduleId) {
  return {
    ...route,
    moduleId,
    layout: route.layout || 'app',
    enabled: route.enabled !== false,
  };
}

function normalizeRoutes(routes, moduleId) {
  return (routes || []).map((route) => normalizeRoute(route, moduleId));
}

export function getEnabledModules(config) {
  return modules.filter((module) => {
    if (typeof module.enabled === 'function') return module.enabled(config);
    return module.enabled !== false;
  });
}

export function getModuleRoutes(config) {
  return getEnabledModules(config).flatMap((module) => {
    const routes = typeof module.routes === 'function'
      ? module.routes(config)
      : module.routes;
    return normalizeRoutes(routes, module.id);
  });
}

export function isLandingHomeActive(config) {
  return Boolean(
    config?.features?.landing
    && getEnabledModules(config).some((module) => module.id === 'landing'),
  );
}

export function getAppShell(config) {
  const dashboard = getEnabledModules(config).find(
    (module) => module.id === 'dashboard' && module.appShell,
  );
  return dashboard?.appShell || null;
}

export function getModuleNavSections(config, context) {
  return getEnabledModules(config).flatMap((module) => {
    const sections = typeof module.navSections === 'function'
      ? module.navSections({ ...context, config })
      : module.navSections;
    return sections || [];
  });
}

function getOnboardingRegistry(language = 'en') {
  void language;

  return [
    // Futuro:
    // {
    //   id: 'pronoun',
    //   enabled: (config, user) => config.features.pronounPractice && userHasModule(user, 'pronoun'),
    //   path: () => '/pronoun-practice',
    //   name: 'Pronouns',
    //   description: '...'
    // }
  ];
}

export function getOnboardingModules(config, context = {}) {
  const { language = 'en', user = null } = context;

  const registryEntries = getOnboardingRegistry(language)
    .filter((entry) => {
      if (typeof entry.enabled === 'function') return entry.enabled(config, user);
      return entry.enabled !== false;
    })
    .map((entry) => ({
      id: entry.id,
      moduleId: entry.id,
      session: entry.session || null,
      name: entry.name,
      description: entry.description,
      to: typeof entry.path === 'function' ? entry.path(config, user) : entry.path,
    }));

  const moduleEntries = getEnabledModules(config).flatMap((module) => {
    if (typeof module.onboarding !== 'function') return [];
    return module.onboarding({ ...context, config }) || [];
  });

  return [...moduleEntries, ...registryEntries].filter((entry, index, entries) => (
    entries.findIndex((candidate) => candidate.id === entry.id) === index
  ));
}

export function getModuleOverlays(config) {
  return getEnabledModules(config).flatMap((module) => {
    if (typeof module.overlays !== 'function') return [];
    const overlay = module.overlays(config);
    return overlay ? [overlay] : [];
  });
}

export function getModuleFloatingMenuItems(config, context) {
  return getEnabledModules(config).flatMap((module) => {
    if (typeof module.floatingMenuItems !== 'function') return [];
    return module.floatingMenuItems({ ...context, config }) || [];
  });
}

/**
 * Ciclo de vida de auth: el shell notifica y cada módulo reacciona vía su
 * manifest (`authListeners`), sin que el shell importe internals de módulos.
 * Un listener que falle no debe romper el flujo de autenticación.
 */
function notifyAuthListeners(config, event, payload) {
  for (const module of getEnabledModules(config)) {
    const listener = module.authListeners?.[event];
    if (typeof listener !== 'function') continue;
    try {
      listener(payload);
    } catch (err) {
      console.warn(`[auth] listener '${event}' del módulo '${module.id}' falló:`, err);
    }
  }
}

/** El perfil del usuario cambió (login, restore de sesión, preferencias sincronizadas). */
export function notifyAuthUserSynced(config, user) {
  notifyAuthListeners(config, 'onUserSynced', user);
}

/** El usuario cerró sesión. */
export function notifyAuthLogout(config) {
  notifyAuthListeners(config, 'onLogout');
}

/** Providers de shell que un módulo necesita montar fuera de sus rutas (ej. UI bridge). */
export function getModuleShellProviders(config) {
  return getEnabledModules(config).flatMap((module) => {
    if (typeof module.shellProviders === 'function') return module.shellProviders(config);
    return module.shellProviders || [];
  });
}

/** Sesión de reanudación expuesta por módulos de estudio (ej. flashcards). */
export function getModuleResumeSession(config) {
  for (const module of getEnabledModules(config)) {
    if (typeof module.readResumeSession === 'function') {
      const session = module.readResumeSession();
      if (session) return session;
    }
  }
  return null;
}

export function getDefaultModuleId(config) {
  return config?.defaultModule || import.meta.env.VITE_DEFAULT_MODULE || 'flashcards';
}

export function isDefaultHomeModule(moduleId, config) {
  if (isLandingHomeActive(config)) return false;
  return getDefaultModuleId(config) === moduleId;
}

export function getAppRoutes(config, baseRoutes = []) {
  const normalizedBase = (baseRoutes || []).map((route) => normalizeRoute(route, 'shell'));
  return [
    ...normalizedBase,
    ...getModuleRoutes(config),
  ];
}

function pickHomeRoute(routes, config) {
  const defaultModuleId = getDefaultModuleId(config);
  return pickHomeRoutePure(routes, defaultModuleId, (moduleId) => {
    const mod = getEnabledModules(config).find((m) => m.id === moduleId);
    if (!mod) return [];
    return normalizeRoutes(
      typeof mod.routes === 'function' ? mod.routes(config) : mod.routes,
      mod.id,
    );
  });
}

/** Ruta inicial pública (puede ser landing en `/`). */
export function getDefaultAppPath(config, baseRoutes = []) {
  const routes = getAppRoutes(config, baseRoutes).filter((route) => route.enabled !== false);
  return pickHomeRoute(routes, config);
}

function getAuthenticatedAppRoutes(config, baseRoutes = []) {
  return getAppRoutes(config, baseRoutes).filter((route) => {
    if (route.enabled === false) return false;
    if (route.layout === 'bare' || route.public) return false;
    if (route.moduleId === 'landing') return false;
    return true;
  });
}

function isDashboardModuleEnabled(config) {
  return Boolean(
    config?.features?.dashboard
    && getEnabledModules(config).some((module) => module.id === 'dashboard'),
  );
}

/** Ruta tras login: `/dashboard` si el módulo dashboard está activo; si no, módulo por defecto. */
export function getAuthenticatedHomePath(config, baseRoutes = []) {
  const routes = getAuthenticatedAppRoutes(config, baseRoutes);
  return resolveAuthenticatedHomePath(
    routes,
    getDefaultModuleId(config),
    (moduleId) => {
      const mod = getEnabledModules(config).find((m) => m.id === moduleId);
      if (!mod) return [];
      return normalizeRoutes(
        typeof mod.routes === 'function' ? mod.routes(config) : mod.routes,
        mod.id,
      );
    },
    { dashboardEnabled: isDashboardModuleEnabled(config) },
  );
}

export function getPublicEntryPathForConfig(config) {
  return getPublicEntryPath(isLandingHomeActive(config));
}

export { getPublicEntryPath, resolveFallbackPath, shouldUseFlashcardLegacyAlias };
