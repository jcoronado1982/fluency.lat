/**
 * DemoFlashcardSession — sesión real de flashcards en el landing (sin login).
 * UI compartida del shell (misma que la app); audio/imagen en namespace landing-demo.
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Flashcard,
    Controls,
    FlashcardContext,
    FlashcardUiContext,
    CategoryContext,
    StudyMediaProvider,
} from '../../../components/flashcardStudy';
import { demoAudioPort, demoImagePort } from '../composition';
import { STUDY_MEDIA_VARIANT_LANDING_DEMO } from '../../../contracts/studyMediaVariants';
import {
    LANDING_DEMO_CATEGORY,
    LANDING_DEMO_DECK,
    buildLandingDemoImagePath,
} from '../../../contracts/landingDemoNamespace';
import {
    createDemoSessionCards,
    patchDefinitionImage,
} from './demo/demoSessionUtils';
import { getLandingTranslations } from '../config/translations';
import { useNextImagePrefetch } from '../../../components/flashcardStudy/features/useNextImagePrefetch';
import { useNextAudioPrefetch } from '../../../components/flashcardStudy/features/useNextAudioPrefetch';

const noop = () => {};
const MIN_SWIPE_DISTANCE = 50;

export default function DemoFlashcardSession({
    language = 'en',
    badgeLabel = '',
    promptExtraRef,
    imagePromptApplySignal = 0,
    demoSelection = null,
}) {
    const t = getLandingTranslations(language);
    const [cards, setCards] = useState(() => createDemoSessionCards());
    const [currentIndex, setCurrentIndex] = useState(0);
    const touchStartRef = useRef(null);

    const masterData = cards;
    const filteredData = useMemo(() => masterData.filter((c) => !c.learned), [masterData]);
    const currentCard = filteredData[currentIndex] ?? null;
    const demoStudyLanguage = language === 'es' ? 'en' : 'es';

    useEffect(() => {
        if (!demoSelection) return;

        const selectedCard = cards.find((card) => card.id === demoSelection.cardId);
        if (!selectedCard) return;

        if (selectedCard.learned) {
            setCards((previous) => previous.map((card) => (
                card.id === demoSelection.cardId
                    ? { ...card, learned: false, learned_at: null }
                    : card
            )));
            return;
        }

        const selectedIndex = filteredData.findIndex((card) => card.id === demoSelection.cardId);
        if (selectedIndex >= 0) setCurrentIndex(selectedIndex);
    }, [cards, demoSelection, filteredData]);

    const nextCard = useCallback(() => {
        if (filteredData.length <= 1) return;
        setCurrentIndex((i) => (i + 1) % filteredData.length);
    }, [filteredData.length]);

    const prevCard = useCallback(() => {
        if (filteredData.length <= 1) return;
        setCurrentIndex((i) => (i - 1 + filteredData.length) % filteredData.length);
    }, [filteredData.length]);

    const markAsLearned = useCallback(() => {
        if (!currentCard) return;
        // Demo landing: el progreso es solo visual/local para este visitante.
        setCards((prev) => prev.map((c) => (
            c.id === currentCard.id
                ? { ...c, learned: true, learned_at: new Date().toISOString() }
                : c
        )));
        setCurrentIndex((i) => {
            const remaining = filteredData.length - 1;
            if (remaining <= 0) return 0;
            return i % remaining;
        });
    }, [currentCard, filteredData.length]);

    const resetDeck = useCallback(() => {
        setCards(createDemoSessionCards());
        setCurrentIndex(0);
    }, []);

    const updateCardImagePath = useCallback((cardId, imagePath, defIndex = 0, form = 'v1') => {
        setCards((prev) => patchDefinitionImage(prev, cardId, imagePath, defIndex, form));
    }, []);

    const flashcardValue = useMemo(() => ({
        currentCard,
        currentIndex,
        filteredData,
        masterData,
        nextCard,
        prevCard,
        markAsLearned,
        resetDeck,
        currentDeckName: LANDING_DEMO_DECK,
        selectedGroup: null,
        justCompletedInSession: false,
        loadingStage: null,
        changeDeck: noop,
        setSelectedGroup: noop,
        updateCardImagePath,
        isLandingDemo: true,
        demoStudyLanguage,
        buildDemoImagePath: buildLandingDemoImagePath,
        demoImagePromptExtraRef: promptExtraRef,
        imagePromptApplySignal: imagePromptApplySignal,
        demoSelection,
    }), [
        currentCard, currentIndex, filteredData, masterData,
        nextCard, prevCard, markAsLearned, resetDeck, updateCardImagePath,
        promptExtraRef, imagePromptApplySignal, demoStudyLanguage, demoSelection,
    ]);

    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isImageLoading, setIsImageLoading] = useState(false);
    const [isIpaModalOpen, setIsIpaModalOpen] = useState(false);
    const [isPhonicsModalOpen, setIsPhonicsModalOpen] = useState(false);

    const upcomingCard = filteredData.length > 1
        ? filteredData[(currentIndex + 1) % filteredData.length]
        : null;
    const canPrefetchNextMedia = Boolean(currentCard) && !isAudioLoading && !isImageLoading;

    // Mismo pipeline del estudio autenticado: solo la tarjeta siguiente,
    // únicamente archivos existentes y cancelación al navegar de largo.
    useNextImagePrefetch({
        imagePort: demoImagePort,
        card: upcomingCard,
        category: LANDING_DEMO_CATEGORY,
        deckName: LANDING_DEMO_DECK,
        studyLanguage: demoStudyLanguage,
        enabled: canPrefetchNextMedia,
    });
    useNextAudioPrefetch({
        audioPort: demoAudioPort,
        card: upcomingCard,
        category: LANDING_DEMO_CATEGORY,
        deckName: LANDING_DEMO_DECK,
        studyLanguage: demoStudyLanguage,
        enabled: canPrefetchNextMedia,
    });

    const uiValue = useMemo(() => ({
        isCatalogVisible: false,
        setIsCatalogVisible: noop,
        isIpaModalOpen,
        setIsIpaModalOpen,
        isPhonicsModalOpen,
        setIsPhonicsModalOpen,
        isAudioLoading,
        setIsAudioLoading,
        isImageLoading,
        setIsImageLoading,
        openCatalog: noop,
        openIpa: () => setIsIpaModalOpen(true),
        openPhonics: () => setIsPhonicsModalOpen(true),
    }), [isAudioLoading, isIpaModalOpen, isPhonicsModalOpen, isImageLoading]);

    const categoryValue = useMemo(() => ({
        categories: [LANDING_DEMO_CATEGORY],
        categoryTotals: { [LANDING_DEMO_CATEGORY]: cards.length },
        currentCategory: LANDING_DEMO_CATEGORY,
        changeCategory: noop,
        isLoading: false,
        loadingStage: null,
    }), [cards.length]);

    return (
        <StudyMediaProvider
            mediaVariant={STUDY_MEDIA_VARIANT_LANDING_DEMO}
            audioPort={demoAudioPort}
            imagePort={demoImagePort}
        >
            <CategoryContext.Provider value={categoryValue}>
                <FlashcardUiContext.Provider value={uiValue}>
                    <FlashcardContext.Provider value={flashcardValue}>
                        <div className="flashcard-page-wrapper" data-landing-demo>
                            <div className="app-container">
                                <div
                                    className="flashcard-main-area"
                                    onTouchStart={(event) => {
                                        if (event.targetTouches.length !== 1) {
                                            touchStartRef.current = null;
                                            return;
                                        }

                                        const touch = event.targetTouches[0];
                                        touchStartRef.current = {
                                            x: touch.clientX,
                                            y: touch.clientY,
                                        };
                                    }}
                                    onTouchEnd={(event) => {
                                        if (touchStartRef.current == null) return;

                                        const touchEnd = event.changedTouches[0];
                                        const touchStart = touchStartRef.current;
                                        touchStartRef.current = null;
                                        if (!touchEnd) return;

                                        const horizontalDistance = touchStart.x - touchEnd.clientX;
                                        const verticalDistance = touchStart.y - touchEnd.clientY;
                                        const isHorizontalGesture = (
                                            Math.abs(horizontalDistance) > Math.abs(verticalDistance)
                                        );

                                        if (!isHorizontalGesture) return;
                                        if (horizontalDistance > MIN_SWIPE_DISTANCE) nextCard();
                                        else if (horizontalDistance < -MIN_SWIPE_DISTANCE) prevCard();
                                    }}
                                    onTouchCancel={() => {
                                        touchStartRef.current = null;
                                    }}
                                >
                                    <div className="lp-demo-card-frame">
                                        {badgeLabel ? (
                                            <span className="lp-demo-badge">
                                                <span className="lp-demo-badge-dot" aria-hidden />
                                                <span className="lp-demo-badge-text">{badgeLabel}</span>
                                            </span>
                                        ) : null}
                                        {filteredData.length === 0 ? (
                                            <div className="lp-demo-complete" role="status" aria-live="polite">
                                                <div className="lp-demo-complete-card">
                                                    <p className="lp-demo-complete-kicker">
                                                        {language === 'es' ? 'Demo completado' : 'Demo completed'}
                                                    </p>
                                                    <h3 className="lp-demo-complete-title">
                                                        {language === 'es'
                                                            ? 'Terminaste el demo'
                                                            : 'You finished the demo'}
                                                    </h3>
                                                    <p className="lp-demo-complete-copy">
                                                        {language === 'es'
                                                            ? 'Entra o crea tu cuenta para seguir estudiando. El progreso de esta vista es temporal.'
                                                            : 'Log in or create your account to keep studying. Progress in this view is temporary.'}
                                                    </p>
                                                </div>
                                                <div className="lp-demo-complete-actions">
                                                    <Link
                                                        to="/login"
                                                        className="lp-demo-complete-button lp-demo-complete-button--primary"
                                                    >
                                                        {t.navLogin}
                                                    </Link>
                                                    <button
                                                        className="lp-demo-complete-button lp-demo-complete-button--secondary"
                                                        type="button"
                                                        onClick={resetDeck}
                                                    >
                                                        {language === 'es' ? 'Reiniciar demo' : 'Restart demo'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <Flashcard key={`demo-flashcard-${language}`} />
                                        )}
                                    </div>
                                    {filteredData.length > 0 && <Controls />}
                                </div>
                            </div>
                        </div>
                    </FlashcardContext.Provider>
                </FlashcardUiContext.Provider>
            </CategoryContext.Provider>
        </StudyMediaProvider>
    );
}

export { buildLandingDemoImagePath, LANDING_DEMO_CATEGORY, LANDING_DEMO_DECK };
