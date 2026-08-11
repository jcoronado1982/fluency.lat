import React, { useEffect, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUIContext } from '../context/UIContext';
import config from '../config';
import { getAuthenticatedHomePath, getOnboardingModules } from '../modules';

const OnboardingPage = () => {
    const navigate = useNavigate();
    const { language = 'en', studyLanguage = 'en' } = useUIContext();
    const { loading, isAuthenticated, onboardingRequired, completeOnboarding, user } = useAuth();
    const activeModules = useMemo(
        () => getOnboardingModules(config, { language, studyLanguage, user }),
        [language, studyLanguage, user],
    );

    useEffect(() => {
        const preload = activeModules.find((module) => typeof module.preload === 'function')?.preload;
        if (preload) {
            void preload();
        }
    }, [activeModules]);

    if (loading) return null;
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (!onboardingRequired) {
        return <Navigate to={getAuthenticatedHomePath(config, [])} replace />;
    }

    const handleStartModule = async (path) => {
        const completedUser = await completeOnboarding();
        if (!completedUser?.onboarding_completed) return;
        navigate(path, { replace: true });
    };

    const handleStartTour = () => {
        const homePath = getAuthenticatedHomePath(config, []);
        const separator = homePath.includes('?') ? '&' : '?';
        navigate(`${homePath}${separator}onboarding_tour=flashcards`, { replace: true });
    };

    const handleSkipToHome = async () => {
        const completedUser = await completeOnboarding();
        if (!completedUser?.onboarding_completed) return;
        navigate(getAuthenticatedHomePath(config, []), { replace: true });
    };

    const activeSessionModule = activeModules[0] || null;

    if (activeSessionModule?.component) {
        const OnboardingComponent = activeSessionModule.component;
        return (
            <OnboardingComponent
                module={activeSessionModule}
                user={user}
                onStart={handleStartModule}
                onStartTour={handleStartTour}
            />
        );
    }

    return (
        <main style={{ padding: 'clamp(1rem, 4vw, 2rem)', maxWidth: '56rem', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            <h1>Onboarding</h1>
            <p style={{ marginTop: '2rem' }}>
                No hay una sesion de onboarding asociada a los modulos activos de este usuario.
            </p>

            <div style={{ marginTop: '2rem' }}>
                <button type="button" onClick={handleSkipToHome}>
                    Continuar al inicio
                </button>
            </div>
        </main>
    );
};

export default OnboardingPage;
