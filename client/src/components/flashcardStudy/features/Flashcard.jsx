import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './Flashcard.module.css';
import { useAudioPlayback } from './useAudioPlayback.jsx';
import { useImageGeneration } from './useImageGeneration.js';
import CardFront from './CardFront.jsx';
import CardBack from './CardBack.jsx';
import { useUIContext } from '../../../context/UIContext';
import { useDialog } from '../../../context/DialogContext';
import { useFlashcardUiContext, useFlashcardContext, useCategoryContext } from '../context/flashcardStudyContext';
import { getCardTitle, getAudioLang, getAudioLangForConjugation, getStudyExampleText } from './cardLanguageUtils';
import { registerUiBridgeHandler, unregisterUiBridgeHandler } from '../uiBridge';
import { useAuth } from '../../../context/AuthContext';
import { LuCalendarPlus } from 'react-icons/lu';

const AUTO_PLAY_DELAY_MS = 50;

const getDefinitionsForForm = (card, form) => {
    if (!card) return [];
    if (form === 'v2') {
        const past = card.irregular?.past;
        if (!past) return [];
        if (Array.isArray(past.definitions) && past.definitions.length > 0) return past.definitions;
        if (past.usage_example) return [{ usage_example: past.usage_example, usage_example_es: past.usage_example_es, pronunciation_guide_es: past.pronunciation_guide_es }];
        return [];
    }
    if (form === 'v3') {
        const part = card.irregular?.participle;
        if (!part) return [];
        if (Array.isArray(part.definitions) && part.definitions.length > 0) return part.definitions;
        if (part.usage_example) return [{ usage_example: part.usage_example, usage_example_es: part.usage_example_es, pronunciation_guide_es: part.pronunciation_guide_es }];
        return [];
    }
    return card.definitions || [];
};

function Flashcard() {
    const {
        setAppMessage,
        isFloatingMenuOpen,
        isSidebarOpen,
        language = 'en',
        studyLanguage = 'en',
    } = useUIContext();
    const { confirm } = useDialog();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const {
        setIsAudioLoading,
        setIsIpaModalOpen,
        isCatalogVisible,
        isIpaModalOpen,
        isPhonicsModalOpen,
    } = useFlashcardUiContext();
    const { currentCategory: categoryFromCatalog } = useCategoryContext();
    const {
        currentCard: cardData,
        currentDeckName,
        updateCardImagePath,
        deleteDefinition,
        isLandingDemo = false,
        demoStudyLanguage,
        demoSelection,
        currentCategory: categoryFromSession,
        isSrsMode = false,
        addToReview,
    } = useFlashcardContext();
    const currentCategory = categoryFromSession || categoryFromCatalog;
    const cardLanguage = isLandingDemo && demoStudyLanguage ? demoStudyLanguage : studyLanguage;
    const [prevCardId, setPrevCardId] = useState(null);
    const isAnyOverlayOpen =
        isCatalogVisible ||
        isIpaModalOpen ||
        isPhonicsModalOpen ||
        isFloatingMenuOpen ||
        isSidebarOpen;

    const [isFlipped, setIsFlipped] = useState(false);
    const [activeForm, setActiveForm] = useState('v1');
    const [blurredState, setBlurredState] = useState({});
    const autoPlayTimerRef = useRef(null);

    const {
        playAudio, stopAudio, deleteAudio, activeAudioText, highlightedWordIndex, isGeneratingAudio
    } = useAudioPlayback({
        setAppMessage, setIsAudioLoading, currentCategory, currentDeckName,
        verbName: cardData?.name
    });

    const {
        isImageLoading, isGeneratingImage, imageUrl, imageRef, currentDefIndex,
        ensureImageForDefinition, ensureImageForForm, deleteImage, uploadImage,
        handleImageError, canCustomizeImages, canDeleteImages,
    } = useImageGeneration({
        cardData, currentCategory, currentDeckName, setAppMessage, updateCardImagePath, activeForm
    });

    const handleRegenerateImage = useCallback(async () => {
        const isEs = language === 'es';
        
        let promptEngine = 'local';
        if (isAdmin) {
            const useGemini = await confirm({
                title: isEs ? '¿Quién generará el prompt?' : 'Who generates the prompt?',
                message: isEs 
                    ? '¿Deseas usar Gemini (API) o el modelo local (Ollama) para crear el prompt?' 
                    : 'Do you want to use Gemini (API) or the local model (Ollama) to create the prompt?',
                confirmLabel: 'Gemini',
                cancelLabel: 'Local',
                tone: 'default',
            });
            promptEngine = useGemini ? 'gemini' : 'local';
        }

        const confirmed = await confirm({
            title: isEs ? '¿Actualizar imagen?' : 'Update image?',
            message: isEs 
                ? 'Se generará una nueva imagen utilizando IA para esta tarjeta. La imagen actual se reemplazará.' 
                : 'A new image will be generated using AI for this card. The current image will be replaced.',
            confirmLabel: isEs ? 'Actualizar' : 'Update',
            tone: 'default',
        });
        
        if (confirmed) {
            ensureImageForDefinition(currentDefIndex, { forceRegenerate: true, promptEngine });
        }
    }, [confirm, ensureImageForDefinition, currentDefIndex, language, isAdmin]);

    const handleDeletePhrase = useCallback(async (defIndex) => {
        const isEs = language === 'es';
        const confirmed = await confirm({
            title: isEs ? '¿Eliminar frase?' : 'Delete phrase?',
            message: isEs
                ? 'Esta frase se borrará permanentemente del contenido. Si no es la última definición de la palabra, puede desalinear las imágenes con otras direcciones de idioma — revisa con check_flashcard_images.py después.'
                : 'This phrase will be permanently removed from the content. If it is not the last definition of the word, it may misalign images with other course directions — check with check_flashcard_images.py afterwards.',
            confirmLabel: isEs ? 'Eliminar' : 'Delete',
            tone: 'danger',
        });

        if (confirmed && cardData?.id !== undefined) {
            deleteDefinition(cardData.id, defIndex, activeForm);
        }
    }, [confirm, deleteDefinition, cardData, activeForm, language]);

    const buildAllBlurred = useCallback((form = activeForm) => {
        if (!cardData) return {};
        const defs = getDefinitionsForForm(cardData, form);
        return defs.reduce((acc, _, i) => ({
            ...acc,
            [i]: isLandingDemo ? i !== 0 : true,
        }), {});
    }, [cardData, activeForm, isLandingDemo]);

    const revealDefinition = useCallback((defIndex, form = activeForm) => {
        if (!cardData) return;
        const defs = getDefinitionsForForm(cardData, form);
        setBlurredState(defs.reduce((acc, _, i) => ({ ...acc, [i]: i !== defIndex }), {}));
    }, [cardData, activeForm]);

    const playDefinitionMedia = useCallback((defIndex, text, lang = 'en') => {
        revealDefinition(defIndex);
        void ensureImageForDefinition(defIndex);
        void playAudio(text, lang);
    }, [revealDefinition, ensureImageForDefinition, playAudio]);

    /** Audio e imagen en paralelo al cambiar v1/v2/v3 (sin esperar uno al otro). */
    const handleConjugationSelect = useCallback((formKey, formLabel) => {
        setActiveForm(formKey);
        ensureImageForForm(formKey, 0);
        void playAudio(formLabel, getAudioLangForConjugation());
    }, [ensureImageForForm, playAudio]);

    const handleToggleBlur = useCallback((defIndex) => {
        setBlurredState(prev => {
            if (isLandingDemo) {
                ensureImageForDefinition(defIndex);
                if (!cardData) return prev;
                const defs = getDefinitionsForForm(cardData, activeForm);
                return defs.reduce((acc, _, i) => ({ ...acc, [i]: i !== defIndex }), {});
            }
            const isCurrentlyBlurred = prev[defIndex] !== false;
            if (isCurrentlyBlurred) {
                ensureImageForDefinition(defIndex);
                if (!cardData) return prev;
                const defs = getDefinitionsForForm(cardData, activeForm);
                return defs.reduce((acc, _, i) => ({ ...acc, [i]: i !== defIndex }), {});
            }
            return { ...prev, [defIndex]: true };
        });
    }, [ensureImageForDefinition, cardData, activeForm, isLandingDemo]);

    useEffect(() => {
        if (!cardData) return;

        if (isAnyOverlayOpen) {
            if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
            autoPlayTimerRef.current = null;
            stopAudio();
            return;
        }

        // Solo reseteamos si realmente cambiamos de tarjeta (ID o nombre)
        const currentId = cardData.srs_key || cardData.id || cardData.name || cardData.word;
        if (currentId !== prevCardId) {
            if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
            autoPlayTimerRef.current = null;
            stopAudio();
            setIsFlipped(false);
            setActiveForm('v1');
            setBlurredState(buildAllBlurred('v1'));
            setAppMessage({ text: '', isError: false });
            setPrevCardId(currentId);

            const title = getCardTitle({
                name: cardData.name,
                definitions: cardData.definitions || [],
            }, cardLanguage);
            if (title) {
                // Si el usuario sigue avanzando, el siguiente cambio limpia
                // este timer antes de iniciar red o reproducción.
                autoPlayTimerRef.current = setTimeout(() => {
                    autoPlayTimerRef.current = null;
                    void playAudio(title, getAudioLang(cardLanguage));
                }, AUTO_PLAY_DELAY_MS);
            }
        }
    }, [cardData, setAppMessage, prevCardId, stopAudio, playAudio, cardLanguage, isAnyOverlayOpen, buildAllBlurred]);

    useEffect(() => {
        if (!cardData?.irregular) return;

        setBlurredState(buildAllBlurred(activeForm));
    }, [activeForm, cardData, buildAllBlurred]);

    useEffect(() => {
        if (!isLandingDemo || !demoSelection || cardData?.id !== demoSelection.cardId) return;

        const form = demoSelection.form || 'v1';
        const defIndex = demoSelection.defIndex ?? 0;
        setIsFlipped(false);
        setActiveForm(form);
        revealDefinition(defIndex, form);
        ensureImageForForm(form, defIndex);
    }, [
        cardData?.id,
        demoSelection,
        ensureImageForForm,
        isLandingDemo,
        revealDefinition,
    ]);

    useEffect(() => {
        const blurAllPhrases = () => {
            setBlurredState(buildAllBlurred(activeForm));
        };
        const revealPhrase = () => {
            if (!cardData) return;
            revealDefinition(0);
            void ensureImageForDefinition(0);
        };
        const revealAndPlayPhrase = () => {
            if (!cardData) return;
            const defs = getDefinitionsForForm(cardData, activeForm);
            const def = defs[0];
            if (!def) return;

            revealDefinition(0);
            void ensureImageForDefinition(0);
            const exampleText = getStudyExampleText(def, cardLanguage);
            if (exampleText?.trim()) {
                void playAudio(exampleText.trim(), getAudioLang(cardLanguage));
            }
        };
        const playPhrase = () => {
            if (!cardData) return;
            const defs = getDefinitionsForForm(cardData, activeForm);
            const def = defs[0];
            if (!def) return;

            revealDefinition(0);
            void ensureImageForDefinition(0);
            const exampleText = getStudyExampleText(def, cardLanguage);
            if (exampleText?.trim()) {
                void playAudio(exampleText.trim(), getAudioLang(cardLanguage));
            }
        };

        registerUiBridgeHandler('blurPhrases', blurAllPhrases);
        registerUiBridgeHandler('revealPhrase', revealPhrase);
        registerUiBridgeHandler('revealAndPlayPhrase', revealAndPlayPhrase);
        registerUiBridgeHandler('playPhrase', playPhrase);
        return () => {
            unregisterUiBridgeHandler('blurPhrases');
            unregisterUiBridgeHandler('revealPhrase');
            unregisterUiBridgeHandler('revealAndPlayPhrase');
            unregisterUiBridgeHandler('playPhrase');
        };
    }, [activeForm, buildAllBlurred, cardData, cardLanguage, ensureImageForDefinition, playAudio, revealDefinition]);

    useEffect(() => () => {
        if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
        stopAudio();
    }, [stopAudio]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                setIsFlipped(p => !p);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const visualVariant = isLandingDemo ? 'demo' : 'app';

    if (!cardData) {
        return (
            <div className={styles.flashcardContainer} data-variant={visualVariant} data-state="loading">
                Cargando datos...
            </div>
        );
    }

    return (
        <div
            className={styles.flashcardContainer}
            data-tour="flashcard-contenedor"
            data-variant={visualVariant}
            data-state="ready"
        >
            {!isLandingDemo && !isSrsMode && !isFlipped && (
                <button
                    type="button"
                    className={styles.srsToggle}
                    onClick={(event) => {
                        event.stopPropagation();
                        void addToReview?.();
                    }}
                    aria-label={language === 'es' ? 'Agregar al repaso espaciado' : 'Add to spaced review'}
                    title={language === 'es' ? 'Agregar al repaso' : 'Add to review'}
                >
                    <LuCalendarPlus aria-hidden="true" />
                </button>
            )}
            <div
                className={`${styles.card} ${isFlipped ? styles.flipped : ''}`}
                onClick={() => {
                    setIsFlipped(p => !p);
                }}
                data-tour="boton-voltear-tarjeta"
                data-flipped={isFlipped ? 'true' : 'false'}
                data-state={isFlipped ? 'back' : 'front'}
                role="button"
                tabIndex={0}
                aria-pressed={isFlipped}
                aria-label={language === 'es' ? 'Voltear tarjeta' : 'Flip card'}
                style={{ cursor: 'pointer' }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setIsFlipped((previous) => !previous);
                    }
                }}
            >


                <CardFront
                    cardData={cardData}
                    activeForm={activeForm}
                    onConjugationSelect={handleConjugationSelect}
                    onOpenIpaModal={() => setIsIpaModalOpen(true)}
                    playAudio={playAudio}
                    activeAudioText={activeAudioText}
                    highlightedWordIndex={highlightedWordIndex}
                    blurredState={blurredState}
                    toggleBlur={handleToggleBlur}
                    isImageLoading={isImageLoading}
                    isGeneratingImage={isGeneratingImage}
                    imageUrl={imageUrl}
                    imageRef={imageRef}
                    imageKey={`${activeForm}-${currentDefIndex}`}
                    playDefinitionMedia={playDefinitionMedia}
                    deleteImage={deleteImage}
                    onRegenerate={handleRegenerateImage}
                    uploadImage={uploadImage}
                    handleImageError={handleImageError}
                    canCustomizeImages={canCustomizeImages}
                    canDeleteImages={canDeleteImages}
                    deleteAudio={deleteAudio}
                    onDeletePhrase={handleDeletePhrase}
                    isGeneratingAudio={isGeneratingAudio}
                    currentLanguage={cardLanguage}
                />
                <CardBack
                    cardData={cardData}
                    activeForm={activeForm}
                    currentLanguage={cardLanguage}
                    imageUrl={imageUrl}
                    onConjugationSelect={handleConjugationSelect}
                />
            </div>
        </div>
    );
}

export default Flashcard;
