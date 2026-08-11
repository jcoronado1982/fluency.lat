import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUIContext } from '../../context/UIContext';
import config from '../../config';
import { getPublicEntryPathForConfig } from '../../modules';
import { isCheckoutIntentPath } from '../../modules/routingPaths';
import { markPostLoginRedirect } from '../../utils/postLoginRedirectStorage';
import PageLoader from './PageLoader';

const LOADING_COPY = {
    es: {
        restoring_session: {
            title: 'Restaurando sesión',
            subtitle: 'Estamos preparando tu acceso.',
            status: 'Recuperando tus datos guardados...',
            progress: 42,
        },
        syncing_session: {
            title: 'Validando sesión',
            subtitle: 'Estamos preparando tu acceso.',
            status: 'Sincronizando permisos y credenciales...',
            progress: 78,
        },
        fallback: {
            title: 'Validando acceso',
            subtitle: 'Estamos preparando tu acceso.',
            status: 'Verificando tu sesión...',
            progress: 56,
        },
    },
    en: {
        restoring_session: {
            title: 'Restoring session',
            subtitle: 'We are preparing your access.',
            status: 'Recovering your saved data...',
            progress: 42,
        },
        syncing_session: {
            title: 'Validating session',
            subtitle: 'We are preparing your access.',
            status: 'Syncing permissions and credentials...',
            progress: 78,
        },
        fallback: {
            title: 'Validating access',
            subtitle: 'We are preparing your access.',
            status: 'Checking your session...',
            progress: 56,
        },
    },
};

const ProtectedRoute = ({ children, fallbackTo }) => {
    const { isAuthenticated, loading, loadingStage, onboardingRequired } = useAuth();
    const location = useLocation();
    const { language = 'en' } = useUIContext();
    const locale = language === 'es' ? 'es' : 'en';
    const copy = LOADING_COPY[locale][loadingStage] ?? LOADING_COPY[locale].fallback;
    const searchParams = new URLSearchParams(location.search);
    const isOnboardingTour = searchParams.get('onboarding_tour') === 'flashcards';

    if (loading) {
        return (
            <PageLoader
                title={copy.title}
                subtitle={copy.subtitle}
                status={copy.status}
                progress={copy.progress}
            />
        );
    }

    if (!isAuthenticated) {
        const entryPath = fallbackTo ?? getPublicEntryPathForConfig(config);
        if (entryPath === '/login') {
            // El `state` de Navigate puede perderse durante el flujo externo de Google/Apple
            // (mismo problema que resuelve demoFeedbackStorage.js para el retorno del demo) —
            // sessionStorage es el respaldo que LoginPage consume si el state no sobrevive.
            markPostLoginRedirect(location.pathname + location.search);
        }
        return (
            <Navigate
                to={entryPath}
                replace
                state={entryPath === '/login' ? { from: location.pathname + location.search } : undefined}
            />
        );
    }

    // El checkout tiene prioridad sobre el onboarding: a quien vino a pagar no se le
    // desvía (política en routingPaths.isCheckoutIntentPath, compartida con LoginPage).
    // El onboarding le llegará al entrar a la app después del pago.
    if (
        onboardingRequired
        && location.pathname !== '/onboarding'
        && !isOnboardingTour
        && !isCheckoutIntentPath(location.pathname)
    ) {
        return <Navigate to="/onboarding" replace />;
    }

    return children;
};

export default ProtectedRoute;
