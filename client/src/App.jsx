
import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import './App.css';

import GrammarPage from './pages/GrammarPage';
import TestPage from './pages/TestPage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import AdminPage from './pages/AdminPage';
import ProtectedRoute from './components/common/ProtectedRoute';
import AdminRoute from './components/common/AdminRoute';
import BareLayout from './components/shell/BareLayout';
import MinimalAppShell from './components/shell/MinimalAppShell';
import SafeRedirect from './components/routing/SafeRedirect';
import PwaShellNavigation from './components/pwa/PwaShellNavigation';
import config from './config';
import {
  getAppRoutes,
  getAppShell,
  getAuthenticatedHomePath,
  getDefaultAppPath,
  getModuleShellProviders,
  isLandingHomeActive,
  resolveFallbackPath,
  shouldUseFlashcardLegacyAlias,
} from './modules';

import { AppProvider } from './context/AppContext';

const shellRoutes = [
  {
    path: '/admin',
    enabled: config.features.admin,
    element: <AdminRoute><AdminPage /></AdminRoute>,
  },
];

const labRoutes = [
  {
    path: '/grammar',
    enabled: config.features.grammar,
    element: <ProtectedRoute><GrammarPage /></ProtectedRoute>,
  },
  {
    path: '/test',
    enabled: config.features.tests,
    element: <ProtectedRoute><TestPage /></ProtectedRoute>,
  },
];

const baseRoutes = [...shellRoutes, ...labRoutes];
const enabledRoutes = getAppRoutes(config, baseRoutes).filter(
  (route) => route.enabled !== false,
);
const defaultPath = getDefaultAppPath(config, baseRoutes);
const authenticatedHomePath = getAuthenticatedHomePath(config, baseRoutes);
const moduleShellProviders = getModuleShellProviders(config);
const AppShellComponent = getAppShell(config) || MinimalAppShell;

const bareRoutes = enabledRoutes.filter((route) => route.layout === 'bare');
const appRoutes = enabledRoutes.filter((route) => route.layout !== 'bare');

function AppFallback() {
  const location = useLocation();
  const knownAppPaths = new Set(enabledRoutes.map((route) => route.path));
  const target = resolveFallbackPath(
    location.pathname,
    knownAppPaths,
    authenticatedHomePath,
  );
  if (!target) return null;
  return <SafeRedirect to={target} />;
}

function AppContent() {
  const landingOwnsRoot = isLandingHomeActive(config)
    && bareRoutes.some((route) => route.path === '/');

  const flashcardLegacyAlias = shouldUseFlashcardLegacyAlias(landingOwnsRoot, appRoutes);

  return (
    <Routes>
      <Route element={<BareLayout />}>
        <Route path="/login" element={<LoginPage />} />
        {bareRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Route>

      <Route element={<AppShellComponent />}>
        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
        {appRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}

        {!landingOwnsRoot && !enabledRoutes.some((route) => route.path === '/') && (
          <Route path="/" element={<SafeRedirect to={defaultPath} />} />
        )}
        {flashcardLegacyAlias && (
          <Route path="/flashcard" element={<SafeRedirect to="/" />} />
        )}
        <Route path="*" element={<AppFallback />} />
      </Route>
    </Routes>
  );
}

function App() {
  let content = (
    <AppProvider>
      <AppContent />
      <PwaShellNavigation barePaths={bareRoutes.map((route) => route.path)} />
    </AppProvider>
  );

  moduleShellProviders.forEach((Provider, index) => {
    content = <Provider key={Provider.name || index}>{content}</Provider>;
  });

  return content;
}

export default App;
