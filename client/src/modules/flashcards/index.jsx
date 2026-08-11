import React from 'react';
import { useLocation } from 'react-router-dom';
import { LuLayers } from 'react-icons/lu';
import ProtectedRoute from '../../components/common/ProtectedRoute';
import FlashcardPage from './FlashcardPage';
import FlashcardOverlays from './FlashcardOverlays';
import FlashcardOnboardingTour from './FlashcardOnboardingTour';
import OnBoardingFlashcard from './OnBoardingFlashcard';
import { CategoryContext, CategoryProvider } from './context/CategoryContext';
import { FlashcardProvider } from './context/FlashcardContext';
import { FlashcardUiProvider } from './context/FlashcardUiContext';
import { getFlashcardFloatingMenuLabels, getFlashcardSidebarLabels } from './config/translations';
import { readResumeSession } from './config/sessionKeys';
import { writeCatalogPreferencesCache } from './config/catalogPreferences';
import { preloadFlashcardStart, resetFlashcardPreload } from './preload';
import { invokeUiBridge } from './uiBridge';
import { StudyMediaProvider } from '../../components/flashcardStudy';
import { STUDY_MEDIA_VARIANT_APP } from '../../contracts/studyMediaVariants';
import { audioPort, imagePort, imageCompressionService } from './composition';
import { isDefaultHomeModule } from '../index';

/* Opción "Tabla de vocales" oculta temporalmente del menú flotante.
const IconVowelChart = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9h16M9 4v16" />
    </svg>
);
*/

function FlashcardRouteLayout({ children, mode = 'free' }) {
    const location = useLocation();
    const resumeSession = location.state?.resumeSession ?? null;

    const study = (
        <FlashcardProvider resumeSession={resumeSession} mode={mode}>
            {children}
        </FlashcardProvider>
    );

    if (mode === 'srs') {
        return (
            <CategoryContext.Provider value={{
                categories: [],
                currentCategory: null,
                changeCategory: () => {},
                markDeckFinished: () => {},
                recentlyFinishedDecks: [],
                loadingStage: null,
            }}>
                {study}
            </CategoryContext.Provider>
        );
    }

    return (
        <CategoryProvider resumeSession={resumeSession}>
            {study}
        </CategoryProvider>
    );
}

const flashcardsModule = {
    id: 'flashcards',
    enabled: (config) => config.features.flashcards,
    routes: (config) => {
        if (!config.features.flashcards) return [];
        const path = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';
        const reviewPath = path === '/' ? '/review' : `${path}/review`;
        const flashcardElement = (
            <ProtectedRoute>
                <FlashcardRouteLayout>
                    <FlashcardPage />
                </FlashcardRouteLayout>
            </ProtectedRoute>
        );
        const reviewElement = (
            <ProtectedRoute>
                <FlashcardRouteLayout mode="srs">
                    <FlashcardPage />
                </FlashcardRouteLayout>
            </ProtectedRoute>
        );
        return [
            { path, element: flashcardElement },
            { path: reviewPath, element: reviewElement },
        ];
    },
    navSections: ({ language, config }) => {
        if (!config.features.flashcards) return [];
        const t = getFlashcardSidebarLabels(language);
        const to = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';
        return [{
            id: 'flashcards',
            label: t.learn,
            items: [{
                id: 'flashcards',
                to,
                icon: <LuLayers />,
                color: 'brand',
                name: t.flashcards,
                sub: t.wordCollections,
            }],
        }];
    },
    overlays: () => (
        <StudyMediaProvider
            mediaVariant={STUDY_MEDIA_VARIANT_APP}
            audioPort={audioPort}
            imagePort={imagePort}
            imageCompressionService={imageCompressionService}
        >
            <FlashcardOverlays />
            <FlashcardOnboardingTour />
        </StudyMediaProvider>
    ),
    shellProviders: (config) => (config.features.flashcards ? [FlashcardUiProvider] : []),
    authListeners: {
        onUserSynced: (user) => {
            writeCatalogPreferencesCache(user?.email, user?.catalog_preferences ?? null);
            resetFlashcardPreload(user?.email);
        },
        onLogout: () => resetFlashcardPreload(),
    },
    onboarding: ({ language = 'en', studyLanguage = 'en', config, user }) => {
        if (!config.features.flashcards) return [];
        const isEs = language === 'es';
        return [{
            id: 'flashcards',
            moduleId: 'flashcards',
            session: 'OnBoardingFlashcard',
            component: OnBoardingFlashcard,
            preload: user?.email ? () => preloadFlashcardStart(user.email, null, studyLanguage) : null,
            name: 'Flashcards',
            description: isEs
                ? 'Configura tu experiencia inicial de vocabulario, mazos y estudio.'
                : 'Set up your initial vocabulary, deck, and study experience.',
            to: isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard',
        }];
    },
    readResumeSession,
    floatingMenuItems: ({ language, config, navigate, close, location }) => {
        if (!config.features.flashcards) return [];
        const t = getFlashcardFloatingMenuLabels(language);
        const homePath = isDefaultHomeModule('flashcards', config) ? '/' : '/flashcard';
        const openFromShell = (action, state) => {
            close();
            const onHome = location?.pathname === homePath;
            if (onHome && invokeUiBridge(action)) return;
            const search = location?.search || '';
            navigate(`${homePath}${search}`, { state });
        };
        return [
            {
                id: 'flashcards-categories',
                sectionLabel: t.learn,
                onClick: () => openFromShell('openCatalog', { openCatalog: true }),
                icon: <LuLayers />,
                iconColor: 'brand',
                name: t.categories,
                sub: t.wordCollections,
            },
            /* Opción "Tabla de vocales" oculta temporalmente.
            {
                id: 'flashcards-ipa',
                onClick: () => openFromShell('openIpa', { openIpa: true }),
                icon: <IconVowelChart />,
                iconColor: 'purple',
                name: t.vowelChart,
                sub: t.referenceChart,
            },
            */
        ];
    },
};

export default flashcardsModule;
