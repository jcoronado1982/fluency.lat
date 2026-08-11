import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Flashcard, Controls, StudyMediaProvider } from '../../components/flashcardStudy';
import { useRealViewportHeight } from '../../components/flashcardStudy/features/useRealViewportHeight';
import { useNextImagePrefetch } from '../../components/flashcardStudy/features/useNextImagePrefetch';
import { useNextAudioPrefetch } from '../../components/flashcardStudy/features/useNextAudioPrefetch';
import { STUDY_MEDIA_VARIANT_APP } from '../../contracts/studyMediaVariants';
import { useAuth } from '../../context/AuthContext';
import CategorySelector from './features/CategorySelector';
import PageLoader from '../../components/common/PageLoader';
import { usePageLoader } from '../../components/common/usePageLoader';
import styles from './features/CardCounter.module.css';
import CompletionCard from './features/CompletionCard';
import { useUIContext } from '../../context/UIContext';
import { useFlashcardUiContext } from './context/FlashcardUiContext';
import { useCategoryContext } from './context/CategoryContext';
import { useFlashcardContext } from './context/FlashcardContext';
import { getCategoryDisplayName, getGroupDisplayName, getProgressLabel } from './features/categoryDisplay';
import { getNextStudyStep } from './config/catalogOrder';
import { getCategoryOrderPreference, getGroupOrderPreference } from './config/catalogPreferences';
import { navigationIntentRef, markInitialNavigation } from './navigationIntent';
import { formatDeckCategoryName, getLevelFromDeckName, usesNestedLevelDecks } from './useCases/deckUseCases';
import { flashcardPort, audioPort, imagePort, imageCompressionService } from './composition';
import SrsControls from './features/SrsControls';
import PwaStudyChrome from './features/PwaStudyChrome';
import PwaStudyControls from './features/PwaStudyControls';
import { usePwaStudyRecommendations } from './hooks/usePwaStudyRecommendations';
import { LAST_DECK_KEY_PREFIX } from './config/sessionKeys';
import {
    registerUiBridgeHandler,
    unregisterUiBridgeHandler,
    invokeUiBridge,
} from './uiBridge';

const FLASHCARD_LOADING_COPY = {
    es: {
        loading_categories: {
            title: 'Cargando',
            subtitle: 'Estamos preparando el contenido.',
            status: 'Obteniendo información...',
            operation: 'Categorías y totales',
            progress: 18,
            holdProgress: 38,
            expectedMs: 7000,
        },
        loading_decks: {
            title: 'Cargando',
            subtitle: 'Estamos preparando el contenido.',
            status: 'Buscando niveles y colecciones...',
            operation: 'Niveles y colecciones',
            progress: 44,
            holdProgress: 66,
            expectedMs: 5000,
        },
        loading_cards: {
            title: 'Cargando',
            subtitle: 'Estamos preparando el contenido.',
            status: 'Obteniendo tarjetas y progreso...',
            operation: 'Tarjetas y progreso',
            progress: 76,
            holdProgress: 88,
            expectedMs: 6500,
        },
        preparing_content: {
            title: 'Cargando',
            subtitle: 'Estamos dejando todo listo para continuar.',
            status: 'Organizando la información cargada...',
            operation: 'Organización local',
            progress: 92,
            holdProgress: 96,
            expectedMs: 2500,
        },
        fallback: {
            title: 'Cargando',
            subtitle: 'Estamos preparando el contenido.',
            status: 'Procesando información...',
            operation: 'Procesamiento',
            progress: 56,
            holdProgress: 82,
            expectedMs: 6000,
        },
    },
    en: {
        loading_categories: {
            title: 'Loading',
            subtitle: 'We are preparing the content.',
            status: 'Fetching information...',
            operation: 'Categories and totals',
            progress: 18,
            holdProgress: 38,
            expectedMs: 7000,
        },
        loading_decks: {
            title: 'Loading',
            subtitle: 'We are preparing the content.',
            status: 'Finding levels and collections...',
            operation: 'Levels and collections',
            progress: 44,
            holdProgress: 66,
            expectedMs: 5000,
        },
        loading_cards: {
            title: 'Loading',
            subtitle: 'We are preparing the content.',
            status: 'Fetching cards and progress...',
            operation: 'Cards and progress',
            progress: 76,
            holdProgress: 88,
            expectedMs: 6500,
        },
        preparing_content: {
            title: 'Loading',
            subtitle: 'We are getting everything ready to continue.',
            status: 'Organizing the loaded information...',
            operation: 'Local organization',
            progress: 92,
            holdProgress: 96,
            expectedMs: 2500,
        },
        fallback: {
            title: 'Loading',
            subtitle: 'We are preparing the content.',
            status: 'Processing information...',
            operation: 'Processing',
            progress: 56,
            holdProgress: 82,
            expectedMs: 6000,
        },
    },
};

const LOADING_HISTORY_KEY = 'flashcards_loading_stage_history_v1';

const readLoadingHistory = () => {
    try {
        return JSON.parse(window.localStorage.getItem(LOADING_HISTORY_KEY) || '{}');
    } catch {
        return {};
    }
};

const writeLoadingHistory = (history) => {
    try {
        window.localStorage.setItem(LOADING_HISTORY_KEY, JSON.stringify(history));
    } catch {
        // Best effort only; loading estimates should not affect the study flow.
    }
};

const getStageEstimateMs = (stage, copy) => {
    const history = readLoadingHistory();
    return history?.[stage]?.averageMs || copy?.expectedMs || 6000;
};

const rememberStageDuration = (stage, durationMs) => {
    if (!stage || !Number.isFinite(durationMs) || durationMs < 150) return;
    const history = readLoadingHistory();
    const previous = history[stage];
    const count = Math.min((previous?.count || 0) + 1, 8);
    const previousAverage = previous?.averageMs || durationMs;
    const averageMs = Math.round((previousAverage * (count - 1) + durationMs) / count);
    history[stage] = { averageMs, count };
    writeLoadingHistory(history);
};

const formatLoaderTime = (ms, language) => {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    if (seconds <= 1) return language === 'es' ? '1 s' : '1s';
    return language === 'es' ? `${seconds} s` : `${seconds}s`;
};

export default function FlashcardPage() {
    useRealViewportHeight();
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isOnboardingTour = new URLSearchParams(location.search).get('onboarding_tour') === 'flashcards';
    const {
        isCatalogVisible,
        setIsCatalogVisible,
        isIpaModalOpen, isPhonicsModalOpen,
        setIsIpaModalOpen,
        isAudioLoading,
        isImageLoading,
    } = useFlashcardUiContext();
    const {
        isFloatingMenuOpen, isSidebarOpen,
        language = 'en',
        studyLanguage = 'en',
        setIsHeaderSuppressed,
    } = useUIContext();
    const {
        categories,
        currentCategory: categoryFromCatalog,
        changeCategory,
        markDeckFinished,
        loadingStage: categoryLoadingStage,
    } = useCategoryContext();

    const {
        currentCard, loadingStage: flashcardLoadingStage, filteredData, masterData, currentDeckName,
        currentIndex, nextCard, prevCard, markAsLearned, resetDeck, reviewDeckAgain,
        selectedGroup, changeDeck, setSelectedGroup, justCompletedInSession, reachedDeckEnd,
        currentCategory: categoryFromSession, isSrsMode = false,
    } = useFlashcardContext();
    const currentCategory = categoryFromSession || categoryFromCatalog;
    const isInstalledPwa = typeof window !== 'undefined'
        && window.matchMedia('(display-mode: standalone) and (max-width: 768px)').matches;
    const pwaRecommendations = usePwaStudyRecommendations({
        enabled: isInstalledPwa && !isSrsMode,
        currentCategory,
        currentDeck: currentDeckName,
        language,
        studyLanguage,
        userEmail: user?.email,
    });

    // Precarga silenciosa de la imagen de la tarjeta SIGUIENTE: al avanzar, la
    // imagen ya está en la caché del navegador y no se paga el viaje de red.
    const upcomingCard = filteredData.length > 1
        ? filteredData[(currentIndex + 1) % filteredData.length]
        : null;
    const upcomingCategory = upcomingCard?.srs_coordinate?.category || currentCategory;
    const upcomingDeck = upcomingCard?.srs_coordinate?.deck || currentDeckName;
    useNextImagePrefetch({
        imagePort,
        card: upcomingCard,
        category: upcomingCategory,
        deckName: upcomingDeck,
        studyLanguage,
        enabled: Boolean(currentCard) && !isAudioLoading && !isImageLoading,
    });
    useNextAudioPrefetch({
        audioPort,
        card: upcomingCard,
        category: upcomingCategory,
        deckName: upcomingDeck,
        studyLanguage,
        enabled: Boolean(currentCard) && !isAudioLoading && !isImageLoading,
    });
    const isPronounsCategory = currentCategory === 'pronouns';
    const { progress, currentTask, reset, setProgress, setCurrentTask, animateTo } = usePageLoader();
    const [loadingTelemetry, setLoadingTelemetry] = useState({
        stage: null,
        elapsedMs: 0,
        estimateMs: 0,
    });

    useEffect(() => {
        const state = location.state;
        if (!state) return;
        if (state.openCatalog) {
            setIsCatalogVisible(true);
            markDeckFinished(currentCategory, currentDeckName);
        }
        if (state.openIpa) setIsIpaModalOpen(true);
        if (state.openCatalog || state.openIpa) {
            // Consumir el state vía el ROUTER, no con window.history.replaceState: ese hack
            // limpia la entrada del historial pero NO el location.state en memoria de React
            // Router. Como este efecto depende de currentCategory/currentDeckName (para
            // markDeckFinished, agregado ago 2026), con el state en memoria aún truthy cada
            // selección de categoría/mazo lo re-ejecutaba y REABRÍA el catálogo recién cerrado
            // (bug real reportado: "elijo y hace como que cierra pero se queda abierta" —
            // solo al entrar vía menú "Categorías"/PWA nav desde fuera de /flashcard, el único
            // camino que navega con state). navigate(replace) anula location.state de verdad:
            // el efecto re-corre una vez con state=null y sale por el early-return. Se preserva
            // location.search a propósito: si se llega con ?onboarding_tour= activo (p.ej. vía
            // PWA nav durante la guía), quitar el query aquí mataría el tour.
            navigate({ pathname: location.pathname, search: location.search }, { replace: true });
        }
    }, [location.state, location.pathname, location.search, navigate, setIsCatalogVisible, setIsIpaModalOpen, markDeckFinished, currentCategory, currentDeckName]);

    useEffect(() => {
        registerUiBridgeHandler('openCatalog', () => {
            setIsCatalogVisible(true);
            markDeckFinished(currentCategory, currentDeckName);
        });
        registerUiBridgeHandler('openIpa', () => setIsIpaModalOpen(true));
        registerUiBridgeHandler('nextCard', () => nextCard());
        registerUiBridgeHandler('prevCard', () => prevCard());
        registerUiBridgeHandler('markLearned', () => { void markAsLearned(); });
        registerUiBridgeHandler('resetDeck', () => resetDeck());
        registerUiBridgeHandler('flipCard', () => {
            const card = document.querySelector('[data-tour="boton-voltear-tarjeta"]');
            if (card instanceof HTMLElement && card.getAttribute('data-flipped') !== 'true') {
                card.click();
            }
        });
        registerUiBridgeHandler('unflipCard', () => {
            const card = document.querySelector('[data-tour="boton-voltear-tarjeta"]');
            if (card instanceof HTMLElement && card.getAttribute('data-flipped') === 'true') {
                card.click();
            }
        });
        registerUiBridgeHandler('prepareReproducirAudioStep', () => {
            const card = document.querySelector('[data-tour="boton-voltear-tarjeta"]');
            if (card instanceof HTMLElement && card.getAttribute('data-flipped') === 'true') {
                card.click();
            }
            window.setTimeout(() => {
                invokeUiBridge('revealPhrase');
            }, 900);
        });
        return () => {
            unregisterUiBridgeHandler('openCatalog');
            unregisterUiBridgeHandler('openIpa');
            unregisterUiBridgeHandler('nextCard');
            unregisterUiBridgeHandler('prevCard');
            unregisterUiBridgeHandler('markLearned');
            unregisterUiBridgeHandler('resetDeck');
            unregisterUiBridgeHandler('flipCard');
            unregisterUiBridgeHandler('unflipCard');
            unregisterUiBridgeHandler('prepareReproducirAudioStep');
        };
    }, [
        markAsLearned,
        nextCard,
        prevCard,
        resetDeck,
        setIsCatalogVisible,
        setIsIpaModalOpen,
        markDeckFinished,
        currentCategory,
        currentDeckName,
    ]);

    useEffect(() => {
        if (!isSrsMode) flashcardPort.touchStudyDay().catch(() => {});
    }, [isSrsMode]);

    const touchStartRef = useRef(null);
    const minSwipeDistance = 50;

    const isOverlayOpen = isFloatingMenuOpen || isSidebarOpen || isCatalogVisible || isIpaModalOpen || isPhonicsModalOpen;

    const groupCards = selectedGroup ? masterData.filter(c => c.group_name === selectedGroup) : masterData;
    const displayTotal = isSrsMode ? masterData.length : groupCards.length;
    const displayLearned = isSrsMode
        ? masterData.length - filteredData.length
        : groupCards.filter(c => c.learned).length;
    const displayLabel = isSrsMode
        ? (language === 'es' ? 'Repaso diario' : 'Daily review')
        : getProgressLabel(currentCategory, selectedGroup, language);
    const locale = language === 'es' ? 'es' : 'en';
    const isCompletionVisible = masterData.length > 0 && filteredData.length === 0;
    const isUserViewingCompleted = isCompletionVisible
        && !justCompletedInSession
        && navigationIntentRef.current === 'user';
    const shouldShowCompletionCelebration = !isSrsMode && isCompletionVisible && justCompletedInSession;
    const shouldShowCompletionCard = shouldShowCompletionCelebration
        || (!isSrsMode && isUserViewingCompleted)
        || (!isSrsMode && reachedDeckEnd);
    const activeLoadingStage = flashcardLoadingStage || (!isSrsMode ? categoryLoadingStage : null);
    const shouldShowLoading = Boolean(activeLoadingStage);
    const completedGroupNames = Array.from(
        masterData.reduce((acc, card) => {
            const groupName = card.group_name || 'General';
            if (!acc.has(groupName)) {
                acc.set(groupName, []);
            }
            acc.get(groupName).push(card);
            return acc;
        }, new Map()).entries(),
    )
        .filter(([, cards]) => cards.length > 0 && cards.every((card) => card.learned))
        .map(([groupName]) => groupName);
    const loadingCopy = activeLoadingStage
        ? (FLASHCARD_LOADING_COPY[locale][activeLoadingStage] ?? FLASHCARD_LOADING_COPY[locale].fallback)
        : null;
    const loaderStats = loadingCopy ? [
        {
            label: locale === 'es' ? 'Operación' : 'Operation',
            value: loadingCopy.operation || loadingCopy.status,
        },
        {
            label: locale === 'es' ? 'Tiempo' : 'Elapsed',
            value: formatLoaderTime(loadingTelemetry.elapsedMs, locale),
        },
        {
            label: locale === 'es' ? 'Estimado' : 'Estimate',
            value: loadingTelemetry.estimateMs > loadingTelemetry.elapsedMs
                ? formatLoaderTime(loadingTelemetry.estimateMs - loadingTelemetry.elapsedMs, locale)
                : (locale === 'es' ? 'Terminando' : 'Finishing'),
        },
    ] : [];
    const recommendation = !isSrsMode && (isCompletionVisible || reachedDeckEnd)
        ? getNextStudyStep(currentCategory, currentDeckName, selectedGroup, {
            categoryOrder: getCategoryOrderPreference(
                user?.email,
                categories,
                user?.catalog_preferences,
            ),
            groupOrder: getGroupOrderPreference(
                user?.email,
                currentCategory,
                currentDeckName,
                Array.from(new Set(masterData.map((card) => card.group_name || 'General'))),
                user?.catalog_preferences,
            ),
            completedGroups: completedGroupNames,
        })
        : null;
    const completionScope = selectedGroup ? 'group' : 'deck';
    const getDeckDisplayName = (deckName) => {
        if (!deckName) return '';
        const levels = FLASHCARD_LOADING_COPY[locale] && locale === 'es'
            ? { basic: 'Básico', intermediate: 'Intermedio', advanced: 'Avanzado' }
            : { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' };

        const level = getLevelFromDeckName(deckName);
        if (usesNestedLevelDecks(currentCategory) && deckName.includes('/')) {
            return `${formatDeckCategoryName(deckName, language)} • ${levels[level] ?? deckName}`;
        }
        if (level && levels[level]) return levels[level];
        return deckName;
    };
    const completedLabel = selectedGroup
        ? getGroupDisplayName(selectedGroup, language)
        : `${getCategoryDisplayName(currentCategory, language)} • ${getDeckDisplayName(currentDeckName)}`;
    const allCardsLearned = displayTotal > 0 && displayLearned === displayTotal;

    useEffect(() => {
        if (!activeLoadingStage || !loadingCopy) {
            reset();
            setLoadingTelemetry({ stage: null, elapsedMs: 0, estimateMs: 0 });
            return;
        }

        const startedAt = performance.now();
        const estimateMs = getStageEstimateMs(activeLoadingStage, loadingCopy);
        const holdProgress = loadingCopy.holdProgress ?? loadingCopy.progress;
        const progressRange = Math.max(0, holdProgress - loadingCopy.progress);

        const updateLoader = () => {
            const elapsedMs = performance.now() - startedAt;
            const timeRatio = estimateMs > 0 ? Math.min(1, elapsedMs / estimateMs) : 0;
            const nextProgress = Math.min(
                holdProgress,
                Math.round((loadingCopy.progress + progressRange * timeRatio) * 10) / 10,
            );
            setProgress((prev) => Math.max(prev, nextProgress));
            setLoadingTelemetry({
                stage: activeLoadingStage,
                elapsedMs,
                estimateMs,
            });
        };

        setProgress((prev) => Math.max(prev, loadingCopy.progress));
        setCurrentTask(loadingCopy.status);
        animateTo(Math.min(holdProgress, loadingCopy.progress + Math.max(4, progressRange * 0.25)));
        updateLoader();
        const timer = window.setInterval(updateLoader, 350);

        return () => {
            rememberStageDuration(activeLoadingStage, performance.now() - startedAt);
            window.clearInterval(timer);
        };
    }, [activeLoadingStage, animateTo, loadingCopy, reset, setCurrentTask, setProgress]);

    useEffect(() => {
        setIsHeaderSuppressed(shouldShowLoading && !isOnboardingTour);
        return () => setIsHeaderSuppressed(false);
    }, [shouldShowLoading, isOnboardingTour, setIsHeaderSuppressed]);

    const handleContinueRecommendation = useCallback(() => {
        if (!recommendation) {
            setIsCatalogVisible(true);
            return;
        }

        if (recommendation.type === 'group') {
            setSelectedGroup(recommendation.group);
            return;
        }

        if (recommendation.type === 'deck') {
            setSelectedGroup(null);
            changeDeck(recommendation.deck);
            return;
        }

        setSelectedGroup(null);
        changeCategory(recommendation.category);
    }, [recommendation, setIsCatalogVisible, setSelectedGroup, changeDeck, changeCategory]);

    const handleOpenPwaRecommendation = useCallback((item) => {
        if (!item?.category || !item?.deckName) return;
        setSelectedGroup(null);
        localStorage.setItem(`${LAST_DECK_KEY_PREFIX}${item.category}`, item.deckName);
        if (item.category === currentCategory) {
            changeDeck(item.deckName);
            return;
        }
        changeCategory(item.category);
    }, [changeCategory, changeDeck, currentCategory, setSelectedGroup]);

    const autoAdvancedRef = useRef(false);
    const dashboardResumeRef = useRef(false);
    const deckFinishMarkedRef = useRef(false);

    useEffect(() => {
        if (location.state?.resumeSession) {
            dashboardResumeRef.current = true;
        }
    }, []);

    useEffect(() => {
        autoAdvancedRef.current = false;
        deckFinishMarkedRef.current = false;
    }, [currentCategory, currentDeckName, selectedGroup]);

    useEffect(() => {
        if (isSrsMode || shouldShowLoading) return;
        if (!isCompletionVisible && !reachedDeckEnd) return;
        if (deckFinishMarkedRef.current) return;
        deckFinishMarkedRef.current = true;
        markDeckFinished(currentCategory, currentDeckName);
    }, [isSrsMode, shouldShowLoading, isCompletionVisible, reachedDeckEnd, currentCategory, currentDeckName, markDeckFinished]);

    useEffect(() => {
        if (isSrsMode || !dashboardResumeRef.current) return;
        if (shouldShowLoading) return;
        if (justCompletedInSession) { dashboardResumeRef.current = false; return; }
        if (!isCompletionVisible) { dashboardResumeRef.current = false; return; }
        if (autoAdvancedRef.current) return;

        dashboardResumeRef.current = false;
        autoAdvancedRef.current = true;
        handleContinueRecommendation();
        markInitialNavigation();
    }, [isCompletionVisible, shouldShowLoading, justCompletedInSession, handleContinueRecommendation, isSrsMode]);

    return (
        <StudyMediaProvider
            mediaVariant={STUDY_MEDIA_VARIANT_APP}
            audioPort={audioPort}
            imagePort={imagePort}
            imageCompressionService={imageCompressionService}
        >
            <div
                className="flashcard-page-wrapper"
                data-onboarding-tour={isOnboardingTour ? 'true' : undefined}
                data-catalog-open={isCatalogVisible ? 'true' : undefined}
                data-completion-open={shouldShowCompletionCard ? 'true' : undefined}
            >
                {masterData.length > 0 && !isOverlayOpen && !shouldShowLoading && !shouldShowCompletionCard && (
                    <div className={`${styles.cardCounter} ${isPronounsCategory ? styles.pronounsCounter : ''}`}>
                        <div className={styles.counterItem}>
                            <span className={styles.counterLabel}>{displayLabel}</span>
                            <div className={styles.counterValues}>
                                <span className={styles.learnedValue}>{displayLearned}</span>
                                <span className={styles.totalValue}>/ {displayTotal}</span>
                            </div>
                        </div>
                    </div>
                )}

                {isCatalogVisible && !isSrsMode && <CategorySelector />}

                <div className="app-container">
                    <div
                        className="flashcard-main-area"
                        onTouchStart={(e) => {
                            if (shouldShowLoading || shouldShowCompletionCard) return;
                            touchStartRef.current = e.targetTouches[0].clientX;
                        }}
                        onTouchEnd={(e) => {
                            if (shouldShowLoading || isCompletionVisible || touchStartRef.current == null) return;
                            const distance = touchStartRef.current - e.changedTouches[0].clientX;
                            if (distance > minSwipeDistance) nextCard();
                            else if (distance < -minSwipeDistance) prevCard();
                            touchStartRef.current = null;
                        }}
                    >
                        {shouldShowLoading ? (
                            <PageLoader
                                title={loadingCopy.title}
                                subtitle={loadingCopy.subtitle}
                                status={loadingCopy.status}
                                currentTask={currentTask}
                                operation={loadingCopy.operation || loadingCopy.status}
                                progress={progress}
                                stats={loaderStats}
                            />
                        ) : isSrsMode && !currentCard ? (
                            <div className="all-done-message">
                                {masterData.length > 0
                                    ? (language === 'es' ? 'Repaso diario completado.' : 'Daily review complete.')
                                    : (language === 'es' ? 'No tienes tarjetas pendientes hoy.' : 'You have no cards due today.')}
                            </div>
                        ) : shouldShowCompletionCard ? (
                            <CompletionCard
                                language={language}
                                completionScope={completionScope}
                                completedLabel={completedLabel}
                                completedCount={displayLearned}
                                totalCount={displayTotal}
                                allLearned={allCardsLearned}
                                recommendation={recommendation}
                                onContinue={handleContinueRecommendation}
                                onOpenCatalog={() => setIsCatalogVisible(true)}
                                onRestart={allCardsLearned ? resetDeck : reviewDeckAgain}
                            />
                        ) : !currentCard ? (
                            !currentCategory ? (
                                <div className="all-done-message">Selecciona una categoría.</div>
                            ) : (
                                <div className="all-done-message">No hay tarjetas disponibles en este momento.</div>
                            )
                        ) : (
                            <Flashcard key={`${currentCard?.srs_key || `${currentCategory}-${currentDeckName}`}-${language}-${studyLanguage}`} />
                        )}
                        {!shouldShowLoading && !shouldShowCompletionCard && (!isSrsMode || currentCard) && (
                            isSrsMode ? <SrsControls /> : (
                                <>
                                    <Controls />
                                    <PwaStudyControls />
                                </>
                            )
                        )}
                    </div>
                </div>
                <PwaStudyChrome
                    language={language}
                    recommendations={pwaRecommendations}
                    onOpenRecommendation={handleOpenPwaRecommendation}
                    hideShelf={isOverlayOpen || shouldShowLoading || shouldShowCompletionCard}
                />
            </div>
        </StudyMediaProvider>
    );
}
