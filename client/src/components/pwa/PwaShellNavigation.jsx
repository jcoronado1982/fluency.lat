import React, { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import config from '../../config';
import { isDefaultHomeModule } from '../../modules';
import { DASHBOARD_HOME_PATH } from '../../modules/routingPaths';
import { invokeUiBridge } from '../flashcardStudy/uiBridge';
import PwaBottomDock from './PwaBottomDock';

const HIDDEN_PATHS = ['/login', '/onboarding'];

/**
 * Única instancia de la barra inferior PWA, montada a nivel shell para que
 * persista entre pantallas como en una app nativa. Resuelve rutas, contexto
 * de sesión e idioma de estudio y se los pasa al componente presentacional.
 */
export default function PwaShellNavigation({ barePaths = [] }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, updateStudyLanguage } = useAuth();
    const { language = 'en', studyLanguage = 'en', setStudyLanguage } = useAppContext();

    const flashcardPath = useMemo(
        () => (isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard'),
        [],
    );

    const isStudyRoute = location.pathname === flashcardPath || location.pathname === '/flashcard';
    const activeTab = location.pathname === DASHBOARD_HOME_PATH
        ? 'dashboard'
        : (isStudyRoute ? 'study' : null);

    const handleCatalog = useCallback(() => {
        if (isStudyRoute && invokeUiBridge('openCatalog')) return;
        navigate(flashcardPath, { state: { openCatalog: true } });
    }, [flashcardPath, isStudyRoute, navigate]);

    const handleStudyLanguageChange = useCallback((nextLanguage) => {
        if (nextLanguage === studyLanguage) return;
        setStudyLanguage(nextLanguage);
        void updateStudyLanguage(nextLanguage);
    }, [setStudyLanguage, studyLanguage, updateStudyLanguage]);

    if (!config.features.flashcards) return null;
    if (!isAuthenticated) return null;
    if (HIDDEN_PATHS.includes(location.pathname)) return null;
    if (barePaths.includes(location.pathname) && !isStudyRoute) return null;

    return (
        <PwaBottomDock
            language={language}
            studyLanguage={studyLanguage}
            activeTab={activeTab}
            showDashboard={Boolean(config.features.dashboard)}
            onDashboard={() => navigate(DASHBOARD_HOME_PATH)}
            onStudy={() => navigate(flashcardPath)}
            onCatalog={handleCatalog}
            onStudyLanguageChange={handleStudyLanguageChange}
        />
    );
}
