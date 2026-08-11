import { useState, useEffect, useCallback, useRef } from 'react';
import { useStudyMediaContext } from '../StudyMediaContext';
import { AI_ENABLED } from '../../../config/api';
import { useAuth } from '../../../context/AuthContext';
import { useDialog } from '../../../context/DialogContext';
import { useUIContext } from '../../../context/UIContext';
import { useFlashcardUiContext, useFlashcardContext } from '../context/flashcardStudyContext';
import {
    isLandingDemoCategory,
} from '../../../contracts/landingDemoNamespace';
import { resolveStudyMediaNamespace } from '../../../contracts/studyMediaVariants';
import {
    clearPrefetchedImages,
    makePrefetchKey,
    getPrefetchedImagePath,
} from './imagePrefetchCache';
import { parseCardImageStorageIdentity } from './imageStorageIdentity.js';

const MAX_IMAGE_ATTEMPTS = 3;
const IMAGE_RETRY_DELAY = 5000;
const NOOP_SET_LOADING = () => {};
const GENERATING_UI_DELAY_MS = 2500;
const GEN_SLOT_WAIT_MS = 120000;
const GEN_SLOT_POLL_MS = 200;

const FORM_DEF_MAP = {
    v1: (card) => card.definitions || [],
    v2: (card) => defsFromFormBlock(card.irregular?.past),
    v3: (card) => defsFromFormBlock(card.irregular?.participle),
};

/** Igual que CardFront: past/participle pueden traer usage_example sin array definitions. */
function defsFromFormBlock(block) {
    if (!block) return [];
    if (Array.isArray(block.definitions) && block.definitions.length > 0) {
        return block.definitions;
    }
    if (block.usage_example) {
        return [{
            usage_example: block.usage_example,
            usage_example_es: block.usage_example_es,
            usage_context_en: block.usage_context_en,
            alternative_example: block.alternative_example,
            pronunciation_guide_es: block.pronunciation_guide_es,
            meaning: block.meaning,
            imagePath: block.imagePath ?? null,
        }];
    }
    return [];
}

/** En demo landing, la ruta debe corresponder al tiempo activo (v1/v2/v3). */
function pathMatchesVerbForm(path, form) {
    if (!path) return false;
    const clean = path.split('?')[0];
    if (form === 'v2') return clean.includes('_v2.');
    if (form === 'v3') return clean.includes('_v3.');
    return !clean.includes('_v2.') && !clean.includes('_v3.');
}

/** Solo landing demo: envía el complemento aparte (la frase de la tarjeta va sin mezclar). */
function demoSceneComplement(extra) {
    const trimmed = extra?.trim();
    return trimmed || undefined;
}

function pathMatchesDeck(path, category, deck) {
    if (!path || !category || !deck) return false;
    const cleanDeck = String(deck).replace(/\.json$/, '');
    const identity = parseCardImageStorageIdentity(path);
    return identity?.category === category && identity.deck === cleanDeck;
}

export function useImageGeneration({
    cardData,
    currentCategory: categoryFromContext,
    currentDeckName: deckFromContext,
    setAppMessage,
    updateCardImagePath,
    activeForm,
}) {
    const { imagePort, imageCompressionService, mediaVariant, isLandingDemoMedia } = useStudyMediaContext();
    const { category: currentCategory, deck: currentDeckName } = resolveStudyMediaNamespace(
        mediaVariant,
        categoryFromContext,
        deckFromContext,
    );
    const { user, isAuthenticated, loading: authLoading } = useAuth();
    const { confirm } = useDialog();
    const { language = 'en', studyLanguage = 'en' } = useUIContext();
    const courseDirection = studyLanguage === 'es' ? 'en_es' : 'es_en';
    const {
        demoImagePromptExtraRef,
        imagePromptApplySignal = 0,
    } = useFlashcardContext() ?? {};
    const uiContext = useFlashcardUiContext();
    const isImageLoading = uiContext?.isImageLoading ?? false;
    // NOOP_SET_LOADING (módulo) mantiene identidad estable cuando no hay provider,
    // igual que el setter de useState del provider cuando sí lo hay.
    const setIsImageLoading = uiContext?.setIsImageLoading ?? NOOP_SET_LOADING;
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [imageUrl, setImageUrl] = useState(null);
    const [currentDefIndex, setCurrentDefIndex] = useState(0);
    const imageRef = useRef(null);
    const imageAttempts = useRef({});
    const activeGenerations = useRef({});
    const generatingUiTimerRef = useRef(null);
    const imageAbortControllerRef = useRef(null);

    const loadSeqRef = useRef(0);
    const currentDefIndexRef = useRef(0);
    const displayedFormRef = useRef('v1');
    const imageUrlRef = useRef(null);
    const confirmedPathRef = useRef(null);
    const isTransitioningRef = useRef(false);
    /** Ref siempre actualizado con activeForm — permite leer el valor actual en closures de efectos */
    const activeFormRef = useRef(activeForm);
    activeFormRef.current = activeForm;

    const getActiveDefinitions = useCallback(() => {
        if (!cardData) return [];
        const getter = FORM_DEF_MAP[activeForm] || FORM_DEF_MAP.v1;
        return getter(cardData);
    }, [cardData, activeForm]);

    const isLandingDemo = isLandingDemoMedia || isLandingDemoCategory(currentCategory);
    const hasExplicitImageForActiveDefinition = Boolean(getActiveDefinitions()?.[currentDefIndex]?.imagePath);
    const hasSafeImageStorageTarget = studyLanguage !== 'es' || hasExplicitImageForActiveDefinition;
    const canGenerateImages = (isLandingDemo
        || user?.role === 'admin') && hasSafeImageStorageTarget;
    const canDeleteImages = (isLandingDemo
        || user?.role === 'admin') && hasSafeImageStorageTarget;
    const canCustomizeImages = !isLandingDemo
        && user?.role === 'admin'
        && hasSafeImageStorageTarget;

    const clearGeneratingUiTimer = useCallback(() => {
        if (generatingUiTimerRef.current) {
            clearTimeout(generatingUiTimerRef.current);
            generatingUiTimerRef.current = null;
        }
    }, []);

    const abortImageRequest = useCallback(() => {
        imageAbortControllerRef.current?.abort();
        imageAbortControllerRef.current = null;
    }, []);

    const waitForGenerationSlot = useCallback((genKey, isStale) => new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
            if (!activeGenerations.current[genKey] || isStale() || Date.now() - started > GEN_SLOT_WAIT_MS) {
                resolve();
                return;
            }
            setTimeout(tick, GEN_SLOT_POLL_MS);
        };
        tick();
    }), []);

    const releasePipelineLoading = useCallback((seq) => {
        if (loadSeqRef.current !== seq) return;
        setIsImageLoading(false);
        setIsGeneratingImage(false);
        isTransitioningRef.current = false;
        clearGeneratingUiTimer();
    }, [clearGeneratingUiTimer, setIsImageLoading]);

    const buildGlobalFallbackPath = useCallback((defIndex, formOverride) => {
        const form = formOverride ?? activeForm;
        if (!cardData) return null;
        const isGroupedDeck = typeof currentDeckName === 'string' && currentDeckName.includes('/');

        const getter = FORM_DEF_MAP[form] || FORM_DEF_MAP.v1;
        const defs = getter(cardData);
        const definition = defs?.[defIndex];

        if (definition?.imagePath) {
            const jsonPath = imagePort.normalizeToAvif(definition.imagePath);
            if (isGroupedDeck && !isLandingDemo && !pathMatchesDeck(jsonPath, currentCategory, currentDeckName)) {
                return imagePort.buildGlobalStoragePath({
                    category: currentCategory,
                    deck: currentDeckName,
                    index: cardData.id,
                    defIndex,
                    form,
                    courseDirection,
                });
            }
            if (isLandingDemo && !pathMatchesVerbForm(jsonPath, form)) {
                return imagePort.buildGlobalStoragePath({
                    category: currentCategory,
                    deck: currentDeckName,
                    index: cardData.id,
                    defIndex,
                    form,
                    courseDirection,
                });
            }
            return jsonPath;
        }
        if (isGroupedDeck && !isLandingDemo) {
            return null;
        }
        if (currentCategory && currentDeckName) {
            return imagePort.buildGlobalStoragePath({
                category: currentCategory,
                deck: currentDeckName,
                index: cardData.id,
                defIndex,
                form,
                courseDirection,
            });
        }
        return null;
    }, [cardData, currentCategory, currentDeckName, activeForm, courseDirection, isLandingDemo, imagePort]);

    const applyLoadedImage = useCallback((url, path, defIndex, form) => {
        if (form !== activeFormRef.current) return;
        confirmedPathRef.current = path;
        imageUrlRef.current = url;
        displayedFormRef.current = form;
        setCurrentDefIndex(defIndex);
        currentDefIndexRef.current = defIndex;
        setImageUrl(url);
        setIsImageLoading(false);
        setIsGeneratingImage(false);
        isTransitioningRef.current = false;
        clearGeneratingUiTimer();
    }, [clearGeneratingUiTimer, setIsImageLoading]);

    const setImageFromPath = useCallback((path, defIndex, cacheBust = false, form) => {
        const normalizedPath = imagePort.normalizeToAvif(path);
        const url = imagePort.buildUrl(normalizedPath, cacheBust);
        applyLoadedImage(url, normalizedPath, defIndex, form);
        return true;
    }, [applyLoadedImage, imagePort]);

    const setOptimisticImageFromPath = useCallback((path, defIndex, cacheBust = false, form) => {
        if (!path) return false;
        const normalizedPath = imagePort.normalizeToAvif(path);
        const url = imagePort.buildUrl(normalizedPath, cacheBust);
        confirmedPathRef.current = normalizedPath;
        imageUrlRef.current = url;
        displayedFormRef.current = form;
        setCurrentDefIndex(defIndex);
        currentDefIndexRef.current = defIndex;
        setImageUrl(url);
        setIsImageLoading(false);
        setIsGeneratingImage(false);
        isTransitioningRef.current = false;
        clearGeneratingUiTimer();
        return true;
    }, [clearGeneratingUiTimer, imagePort, setIsImageLoading]);

    const fetchViaGenerate = useCallback(async (defIndex, forceRegenerate, seq, pipelineForm, legacyImagePath = null, promptEngine = null, signal) => {
        const requestForm = pipelineForm ?? activeFormRef.current;
        const formDefs = (FORM_DEF_MAP[requestForm] || FORM_DEF_MAP.v1)(cardData);
        if (!cardData || !formDefs?.[defIndex] || !currentCategory) return false;

        if (!AI_ENABLED || !canGenerateImages) {
            setIsImageLoading(false);
            setIsGeneratingImage(false);
            isTransitioningRef.current = false;
            return false;
        }

        const isRequestStale = () => loadSeqRef.current !== seq;

        const genKey = `${cardData.id}_${requestForm}_${defIndex}`;
        if (activeGenerations.current[genKey]) {
            await waitForGenerationSlot(genKey, isRequestStale);
            if (isRequestStale()) return false;
            if (
                imageUrlRef.current
                && displayedFormRef.current === requestForm
                && currentDefIndexRef.current === defIndex
            ) {
                return true;
            }
            if (activeGenerations.current[genKey]) return false;
        }
        activeGenerations.current[genKey] = true;

        if (!imageAttempts.current[genKey]) imageAttempts.current[genKey] = 0;
        if (imageAttempts.current[genKey] >= MAX_IMAGE_ATTEMPTS) {
            setAppMessage({ text: `Fallaron todos los intentos para imagen def ${defIndex + 1}`, isError: true });
            releasePipelineLoading(seq);
            delete activeGenerations.current[genKey];
            return false;
        }

        imageAttempts.current[genKey]++;
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        setAppMessage({ text: `⏳ Obteniendo imagen (Def ${defIndex + 1})...`, isError: false });

        clearGeneratingUiTimer();
        generatingUiTimerRef.current = setTimeout(() => {
            if (!isRequestStale()) {
                setIsGeneratingImage(true);
        setAppMessage({
            text: isLandingDemo
                ? `⏳ Gemini — generando imagen (Def ${defIndex + 1})...`
                : `⏳ Generando imagen (Def ${defIndex + 1})...`,
            isError: false,
        });
            }
        }, GENERATING_UI_DELAY_MS);

        try {
            const def = formDefs[defIndex];
            const usageExample = def.usage_example;
            const sceneComplement = isLandingDemoCategory(currentCategory)
                ? demoSceneComplement(demoImagePromptExtraRef?.current)
                : undefined;
            const explicitIdentity = parseCardImageStorageIdentity(def.imagePath);
            const storageIdentity = explicitIdentity || {
                category: currentCategory,
                deck: currentDeckName,
                index: cardData.id,
                defIndex,
                form: requestForm,
            };
            const data = await imagePort.generate({
                ...storageIdentity,
                courseDirection: storageIdentity.courseDirection || courseDirection,
                prompt: usageExample,
                meaning: def.meaning,
                usageExample,
                usageContext: def.usage_context_en,
                alternativeExample: def.alternative_example,
                sceneComplement,
                forceGeneration: forceRegenerate,
                legacyImagePath,
                promptEngine,
                signal,
            });

            if (isRequestStale()) {
                releasePipelineLoading(seq);
                return false;
            }

            clearPrefetchedImages();
            const normalizedPath = imagePort.normalizeToAvif(data.path);
            updateCardImagePath(cardData.id, normalizedPath, defIndex, requestForm);

            try {
                await imagePort.preloadImageWithRetry(normalizedPath, true, { signal });
            } catch (preloadErr) {
                if (isRequestStale()) {
                    releasePipelineLoading(seq);
                    return false;
                }
                console.warn('[img-gen] Precarga fallida tras generar, reintentando URL:', preloadErr);
            }

            if (isRequestStale()) {
                releasePipelineLoading(seq);
                return false;
            }

            setImageFromPath(normalizedPath, defIndex, true, requestForm);
            setAppMessage({ text: `Imagen (Def ${defIndex + 1}) lista`, isError: false });
            return true;

        } catch (err) {
            if (err?.name === 'AbortError' || isRequestStale()) {
                releasePipelineLoading(seq);
                return false;
            }
            console.warn(`Error imagen def ${defIndex}:`, err);
            const isDisabled = err.message.includes('deshabilitada');

            if (isDisabled || imageAttempts.current[genKey] >= MAX_IMAGE_ATTEMPTS) {
                setAppMessage({
                    text: isDisabled ? err.message : `Error final al cargar imagen: ${err.message}`,
                    isError: !isDisabled,
                });
                releasePipelineLoading(seq);
            } else if (!isRequestStale()) {
                setTimeout(() => {
                    if (!isRequestStale()) {
                        fetchViaGenerate(defIndex, forceRegenerate, seq, requestForm, legacyImagePath, promptEngine, signal);
                    }
                }, IMAGE_RETRY_DELAY);
                return 'retrying';
            } else {
                releasePipelineLoading(seq);
            }
            return false;
        } finally {
            clearGeneratingUiTimer();
            delete activeGenerations.current[genKey];
        }
    }, [
        cardData, currentCategory, currentDeckName, setAppMessage,
        updateCardImagePath, canGenerateImages, courseDirection, demoImagePromptExtraRef, imagePort, isLandingDemo,
        setImageFromPath, clearGeneratingUiTimer, waitForGenerationSlot,
        releasePipelineLoading,
        setIsImageLoading,
    ]);

    const runEnsurePipeline = useCallback(async (defIndex, { forceRegenerate = false, formOverride, promptEngine = null } = {}) => {
        abortImageRequest();
        const abortController = new AbortController();
        imageAbortControllerRef.current = abortController;
        const { signal } = abortController;
        const pipelineForm = formOverride ?? activeFormRef.current;
        // Sincronizar ref antes de async: setActiveForm y ensureImageForForm van en la misma tick.
        if (formOverride) {
            activeFormRef.current = formOverride;
        }
        const seq = ++loadSeqRef.current;
        const isStale = () => loadSeqRef.current !== seq;

        const pipelineDefs = (FORM_DEF_MAP[pipelineForm] || FORM_DEF_MAP.v1)(cardData);
        if (!cardData || !pipelineDefs?.[defIndex] || !currentCategory) {
            setIsImageLoading(false);
            isTransitioningRef.current = false;
            return;
        }

        // Ya visible la misma frase Y la misma forma verbal (v1/v2/v3)
        if (
            !forceRegenerate
            && currentDefIndexRef.current === defIndex
            && displayedFormRef.current === pipelineForm
            && imageUrlRef.current
            && confirmedPathRef.current
        ) {
            setIsImageLoading(false);
            isTransitioningRef.current = false;
            return;
        }

        const contextChanged = displayedFormRef.current !== pipelineForm
            || currentDefIndexRef.current !== defIndex;

        isTransitioningRef.current = true;
        setCurrentDefIndex(defIndex);
        currentDefIndexRef.current = defIndex;

        setIsImageLoading(true);
        setIsGeneratingImage(false);
        clearGeneratingUiTimer();

        if (contextChanged) {
            setImageUrl(null);
            imageUrlRef.current = null;
            confirmedPathRef.current = null;
        }

        setAppMessage({ text: `⏳ Verificando imagen (Def ${defIndex + 1})...`, isError: false });

        const getFormDefs = (form) => (FORM_DEF_MAP[form] || FORM_DEF_MAP.v1)(cardData);

        const tryVerifiedJsonPath = async (form) => {
            const formDefs = getFormDefs(form);
            if (!formDefs?.[defIndex]?.imagePath) return false;

            const jsonPath = imagePort.normalizeToAvif(formDefs[defIndex].imagePath);
            if (isLandingDemo && !pathMatchesVerbForm(jsonPath, form)) return false;

            // Los JSON históricos guardan una ruta sin ?v=. Antes este atajo
            // la mostraba directamente y saltaba la resolución del backend,
            // dejando a Cloudflare sin una clave de caché versionada. La
            // identidad persistida permite resolver el mismo archivo (incluido
            // el layout legacy) y obtener su versión por metadatos, sin
            // regenerar ni leer el contenido de la imagen.
            const identity = parseCardImageStorageIdentity(jsonPath);
            if (identity) {
                try {
                    const data = await imagePort.resolve({
                        category: identity.category,
                        deck: identity.deck,
                        index: identity.index,
                        defIndex: identity.defIndex,
                        form: identity.form !== 'v1' ? identity.form : undefined,
                        courseDirection: identity.courseDirection || courseDirection,
                        signal,
                    });
                    if (data?.path) {
                        return tryVerifyPath(imagePort.normalizeToAvif(data.path), form);
                    }
                } catch (err) {
                    if (err?.name === 'AbortError' || isStale()) return false;
                    // La ruta directa queda como compatibilidad para un JSON
                    // legado que no pueda resolverse. Al no llevar versión,
                    // responde no-cache y no puede quedar stale.
                    console.warn('[ensureImage] no se pudo versionar imagePath:', err.message);
                }
            }
            return tryVerifyPath(jsonPath, form);
        };

        const tryResolveForm = async (form) => {
            const isLandingDemoResolve = isLandingDemoCategory(currentCategory);
            if ((!isAuthenticated && !isLandingDemoResolve) || !currentCategory || !currentDeckName) return false;

            // Ruta ya resuelta por el prefetch de la tarjeta siguiente
            // (useNextImagePrefetch): mismo resultado que el POST de abajo,
            // sin viaje de red. Expira por TTL; las mutaciones la invalidan.
            const prefetched = getPrefetchedImagePath(
                makePrefetchKey({
                    category: currentCategory,
                    deck: currentDeckName,
                    cardId: cardData.id,
                    defIndex,
                    form,
                    studyLanguage,
                }),
            );
            if (prefetched && !isStale()) {
                const resolvedPath = imagePort.normalizeToAvif(prefetched);
                if (!isLandingDemo || pathMatchesVerbForm(resolvedPath, form)) {
                    setOptimisticImageFromPath(resolvedPath, defIndex, cardData.force_generation, form);
                    setAppMessage({ text: `Imagen (Def ${defIndex + 1}) lista`, isError: false });
                    return true;
                }
            }

            try {
                const data = await imagePort.resolve({
                    category: currentCategory,
                    deck: currentDeckName,
                    index: cardData.id,
                    defIndex,
                    form: form && form !== 'v1' ? form : undefined,
                    courseDirection,
                    signal,
                });
                if (isStale()) {
                    isTransitioningRef.current = false;
                    return false;
                }
                if (data?.path) {
                    const resolvedPath = imagePort.normalizeToAvif(data.path);
                    if (isLandingDemo && !pathMatchesVerbForm(resolvedPath, form)) return false;
                    setOptimisticImageFromPath(resolvedPath, defIndex, cardData.force_generation, form);
                    setAppMessage({ text: `Imagen (Def ${defIndex + 1}) lista`, isError: false });
                    return true;
                }
            } catch (err) {
                if (isStale()) {
                    isTransitioningRef.current = false;
                    return false;
                }
                const isNotFound = err.message?.includes('404') || err.message?.includes('no encontrada');
                if (!isNotFound) {
                    console.warn('[ensureImage] resolve falló:', err.message);
                }
            }
            return false;
        };

        const tryVerifyPath = async (path, form = pipelineForm) => {
            if (!path) return false;
            if (isStale()) {
                isTransitioningRef.current = false;
                return false;
            }
            setOptimisticImageFromPath(path, defIndex, cardData.force_generation, form);
            setAppMessage({ text: `Imagen (Def ${defIndex + 1}) lista`, isError: false });
            return true;
        };

        if (!forceRegenerate) {
            // La ruta explícita conserva la asociación semántica aunque los índices
            // de en_es y es_en sean diferentes.
            if (!isLandingDemo && (await tryVerifiedJsonPath(pipelineForm))) return;

            // El fallback por índice es seguro únicamente para el catálogo histórico
            // es_en. En en_es podría apuntar a otra palabra del mazo inverso.
            if (!isLandingDemo) {
                if (studyLanguage !== 'es' && (await tryResolveForm(pipelineForm))) return;
                if (studyLanguage !== 'es') {
                    const exactPath = buildGlobalFallbackPath(defIndex, pipelineForm);
                    if (await tryVerifyPath(exactPath, pipelineForm)) return;
                }
            } else {
                // Demo landing: resolve en servidor (Oracle/local) antes del preload en navegador
                if (await tryResolveForm(pipelineForm)) return;
                const ownPath = buildGlobalFallbackPath(defIndex, pipelineForm);
                if (await tryVerifyPath(ownPath, pipelineForm)) return;
            }
        }

        if (isStale()) {
            isTransitioningRef.current = false;
            setIsImageLoading(false);
            return;
        }

        // La generación con IA ocurre únicamente por una acción explícita del
        // usuario (Generar/Regenerar o aplicar un prompt en la demo). Una imagen
        // ausente durante la carga normal termina en el placeholder.
        if (canGenerateImages && AI_ENABLED && forceRegenerate) {
            // forceGeneration queda reservado para acciones explícitas del usuario.
            // Si solo falta la ruta nueva, backend primero intenta migrar una imagen legacy.
            const shouldForceGenerate = forceRegenerate;
            const rawLegacyPath = pipelineDefs?.[defIndex]?.imagePath
                ? imagePort.normalizeToAvif(pipelineDefs[defIndex].imagePath)
                : null;
            const legacyImagePath = !forceRegenerate
                && rawLegacyPath
                && !isLandingDemo
                && typeof currentDeckName === 'string'
                && currentDeckName.includes('/')
                && !pathMatchesDeck(rawLegacyPath, currentCategory, currentDeckName)
                ? rawLegacyPath
                : null;
            const generated = await fetchViaGenerate(
                defIndex,
                shouldForceGenerate,
                seq,
                pipelineForm,
                legacyImagePath,
                promptEngine,
                signal,
            );
            if (generated === false && !isStale()) {
                releasePipelineLoading(seq);
            }
            return;
        }

        setImageUrl(null);
        imageUrlRef.current = null;
        confirmedPathRef.current = null;
        setIsImageLoading(false);
        setIsGeneratingImage(false);
        isTransitioningRef.current = false;
    }, [
        cardData, currentCategory, currentDeckName, courseDirection, isAuthenticated, studyLanguage,
        buildGlobalFallbackPath, isLandingDemo,
        canGenerateImages, fetchViaGenerate, setAppMessage,
        clearGeneratingUiTimer, imagePort, releasePipelineLoading, setOptimisticImageFromPath,
        setIsImageLoading, abortImageRequest,
    ]);

    const ensureImageForDefinition = useCallback(async (defIndex, options = {}) => {
        if (authLoading) return;
        await runEnsurePipeline(defIndex, options);
    }, [authLoading, runEnsurePipeline]);

    const ensureImageForForm = useCallback((formKey, defIndex = 0, options = {}) => {
        if (authLoading) return;
        void runEnsurePipeline(defIndex, { ...options, formOverride: formKey });
    }, [authLoading, runEnsurePipeline]);

    const displayImageForIndex = useCallback((defIndex) => {
        ensureImageForDefinition(defIndex);
    }, [ensureImageForDefinition]);

    const handleImageError = useCallback(() => {
        const defIndex = currentDefIndexRef.current;
        // Un error del <img> significa que la ruta no está disponible. La carga
        // automática no debe convertir ese fallo en una generación con IA: al
        // limpiar la URL, ImageViewer muestra inmediatamente /noimages.png.
        confirmedPathRef.current = null;
        imageUrlRef.current = null;
        setImageUrl(null);
        setIsImageLoading(false);
        setIsGeneratingImage(false);
        isTransitioningRef.current = false;
        clearGeneratingUiTimer();
        setAppMessage({ text: `Imagen no disponible (Def ${defIndex + 1})`, isError: false });
    }, [clearGeneratingUiTimer, setAppMessage, setIsImageLoading]);

    const prevCardIdRef = useRef(null);

    useEffect(() => {
        if (!cardData) return;
        if (prevCardIdRef.current === cardData.id) return;

        prevCardIdRef.current = cardData.id;
        abortImageRequest();
        loadSeqRef.current += 1;
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        setImageUrl(null);
        imageUrlRef.current = null;
        confirmedPathRef.current = null;
        activeGenerations.current = {};
        currentDefIndexRef.current = 0;
        displayedFormRef.current = activeFormRef.current; // Bug 3: usar el form activo real, no hardcoded 'v1'
        isTransitioningRef.current = false;
        clearGeneratingUiTimer();
    }, [cardData, abortImageRequest, clearGeneratingUiTimer, setIsImageLoading]);

    const prevFormContextRef = useRef({ form: activeForm, cardId: cardData?.id });

    useEffect(() => {
        if (!cardData) return;
        const prev = prevFormContextRef.current;
        if (prev.form === activeForm && prev.cardId === cardData.id) return;
        prevFormContextRef.current = { form: activeForm, cardId: cardData.id };

        setImageUrl(null);
        imageUrlRef.current = null;
        confirmedPathRef.current = null;
        displayedFormRef.current = '';
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        isTransitioningRef.current = true;
        clearGeneratingUiTimer();
    }, [activeForm, cardData, clearGeneratingUiTimer, setIsImageLoading]);

    const ensureImageRef = useRef(ensureImageForDefinition);
    ensureImageRef.current = ensureImageForDefinition;

    const imageBootstrapRef = useRef({
        cardId: null,
        form: null,
        category: null,
        deck: null,
        authReady: false,
    });

    useEffect(() => {
        if (authLoading || !cardData || !currentCategory) return;

        const snapshot = {
            cardId: cardData.id,
            form: activeForm,
            category: currentCategory,
            deck: currentDeckName,
            authReady: true,
        };
        const prev = imageBootstrapRef.current;
        const shouldBootstrap =
            prev.cardId !== snapshot.cardId
            || prev.form !== snapshot.form
            || prev.category !== snapshot.category
            || prev.deck !== snapshot.deck
            || !prev.authReady;

        if (!shouldBootstrap) return;

        imageBootstrapRef.current = snapshot;
        ensureImageRef.current(0);
        // El bootstrap se re-ejecuta por cambio de tarjeta (id), no por identidad
        // del objeto cardData: el resto de campos se lee como snapshot puntual.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, cardData?.id, currentCategory, currentDeckName, activeForm]);

    const prevApplySignalRef = useRef(0);
    useEffect(() => {
        if (!isLandingDemoCategory(currentCategory)) return;
        if (!imagePromptApplySignal || imagePromptApplySignal === prevApplySignalRef.current) return;
        prevApplySignalRef.current = imagePromptApplySignal;
        if (authLoading || !cardData) return;

        const defIndex = currentDefIndexRef.current;
        const genKey = `${cardData.id}_${activeFormRef.current}_${defIndex}`;
        imageAttempts.current[genKey] = 0;
        loadSeqRef.current += 1;
        confirmedPathRef.current = null;
        imageUrlRef.current = null;
        setImageUrl(null);
        ensureImageForDefinition(defIndex, { forceRegenerate: true });
    }, [imagePromptApplySignal, currentCategory, authLoading, cardData, ensureImageForDefinition]);

    useEffect(() => () => {
        abortImageRequest();
        clearGeneratingUiTimer();
    }, [abortImageRequest, clearGeneratingUiTimer]);

    const deleteImage = useCallback(async () => {
        const activeDefs = getActiveDefinitions();
        const defIndex = currentDefIndexRef.current;
        if (!cardData || !activeDefs?.[defIndex] || !currentCategory || !currentDeckName) {
            setAppMessage({ text: 'Error: No se puede eliminar la imagen (datos incompletos)', isError: true });
            return;
        }

        const isEs = language === 'es';
        const confirmed = await confirm({
            title: isEs ? '¿Eliminar imagen?' : 'Delete image?',
            message: isEs 
                ? 'Esta acción eliminará de forma permanente la imagen asociada a esta tarjeta.' 
                : 'This will permanently delete the image associated with this card.',
            confirmLabel: isEs ? 'Eliminar' : 'Delete',
            tone: 'danger',
        });

        if (!confirmed) return;

        const genKey = `${cardData.id}_${activeForm}_${defIndex}`;
        imageAttempts.current[genKey] = 0;
        setAppMessage({ text: 'Eliminando imagen...', isError: false });
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        confirmedPathRef.current = null;
        clearGeneratingUiTimer();

        try {
            const storageIdentity = parseCardImageStorageIdentity(activeDefs[defIndex].imagePath) || {
                category: currentCategory,
                deck: currentDeckName,
                index: cardData.id,
                defIndex,
                form: activeForm,
            };
            await imagePort.delete({
                ...storageIdentity,
                courseDirection: storageIdentity.courseDirection || courseDirection,
            });

            clearPrefetchedImages();
            setImageUrl(null);
            imageUrlRef.current = null;
            updateCardImagePath(cardData.id, null, defIndex, activeForm);
            setIsImageLoading(false);
            setAppMessage({ text: 'Imagen eliminada de forma permanente.', isError: false });

        } catch (err) {
            if (err.message.includes('404') || err.message.includes('No se encontró')) {
                setImageUrl(null);
                imageUrlRef.current = null;
                updateCardImagePath(cardData.id, null, defIndex, activeForm);
                setIsImageLoading(false);
                setAppMessage({ text: 'Imagen no encontrada en el servidor; limpiada localmente.', isError: false });
            } else {
                console.error('Error al eliminar imagen:', err);
                setAppMessage({ text: `Error: ${err.message}`, isError: true });
                setIsImageLoading(false);
            }
        }
    }, [
        cardData, currentCategory, currentDeckName,
        setAppMessage, updateCardImagePath, getActiveDefinitions, activeForm,
        clearGeneratingUiTimer, courseDirection, imagePort, confirm, language,
        setIsImageLoading,
    ]);

    const uploadImage = useCallback(async (file) => {
        const defIndex = currentDefIndexRef.current;
        if (!file || !cardData || !currentCategory || !currentDeckName) {
            setAppMessage({ text: 'Error: Faltan datos para subir la imagen.', isError: true });
            return;
        }

        setAppMessage({ text: '⏳ Optimizando y comprimiendo imagen localmente (AVIF/WASM)...', isError: false });
        setIsImageLoading(true);
        setIsGeneratingImage(false);
        setImageUrl(null);
        imageUrlRef.current = null;
        confirmedPathRef.current = null;
        clearGeneratingUiTimer();

        try {
            if (!imageCompressionService) {
                throw new Error('Image upload is not available');
            }
            const compressedBlob = await imageCompressionService.compress(file);
            const compressedFile = new File([compressedBlob], 'upload.avif', { type: 'image/avif' });

            const activeDefs = getActiveDefinitions();
            const explicitIdentity = parseCardImageStorageIdentity(activeDefs?.[defIndex]?.imagePath);
            const data = await imagePort.upload(compressedFile, {
                category: explicitIdentity?.category || currentCategory,
                deck: explicitIdentity?.deck || currentDeckName,
                cardIndex: explicitIdentity?.index ?? cardData.id,
                defIndex: explicitIdentity?.defIndex ?? defIndex,
                form: explicitIdentity?.form || activeForm,
                courseDirection: explicitIdentity?.courseDirection || courseDirection,
            });

            clearPrefetchedImages();
            const path = imagePort.normalizeToAvif(data.path);
            updateCardImagePath(cardData.id, path, defIndex, activeForm);
            setImageFromPath(path, defIndex, true, activeFormRef.current);
            setAppMessage({ text: '✅ Imagen personal guardada (solo visible para ti).', isError: false });

        } catch (err) {
            console.error('Error al subir imagen:', err);
            setAppMessage({ text: `Error al subir: ${err.message}`, isError: true });
            setImageUrl(null);
            imageUrlRef.current = null;
        } finally {
            setIsImageLoading(false);
            setIsGeneratingImage(false);
        }
    }, [
        cardData, currentCategory, currentDeckName,
        setAppMessage, updateCardImagePath, activeForm, setImageFromPath, clearGeneratingUiTimer,
        courseDirection, imageCompressionService, imagePort, getActiveDefinitions,
        setIsImageLoading,
    ]);

    return {
        isImageLoading,
        isGeneratingImage,
        imageUrl,
        imageRef,
        currentDefIndex,
        displayImageForIndex,
        ensureImageForDefinition,
        ensureImageForForm,
        deleteImage,
        uploadImage,
        handleImageError,
        canCustomizeImages,
        canDeleteImages,
    };
}
