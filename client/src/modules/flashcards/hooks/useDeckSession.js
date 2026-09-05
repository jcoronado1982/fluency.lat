import { useCallback, useEffect, useRef, useState } from 'react';
import { useCategoryContext } from '../context/CategoryContext';
import { useFlashcardUiContext } from '../context/FlashcardUiContext';
import { useUIContext } from '../../../context/UIContext';
import { useDialog } from '../../../context/AppContext';
import { flashcardPort, personalWordPort } from '../composition';
import { queueSrsBatch, listSrsBatches, removeSrsBatch } from '../adapters/srsOutboxIndexedDb';
import { SrsEngine } from '../domain/SrsEngine';
import { useAuth } from '../../../context/AuthContext';
import { getFlashcardTranslations } from '../config/translations';
import { markUserNavigation } from '../navigationIntent';
import {
    excludeDeletedCards,
    filterUnlearned,
    getCourseDirectionFromStudyLanguage,
    getLevelFromDeckName,
    normalizeDeckResponse,
    resolvePersistedChoice,
    sortDeckNames,
    usesNestedLevelDecks,
} from '../useCases/deckUseCases';
import {
    computeFilteredAfterLearn,
    computeNextIndex,
    getGroupLearnedCards,
    resolveResumeCardIndex,
    resetGroupInDeck,
    updateCardImageInDeck,
    removeDefinitionFromDeck,
} from '../useCases/deckSessionUseCases';
import {
    LAST_DECK_KEY_PREFIX,
    writeResumeSession,
} from '../config/sessionKeys';
import { consumeFlashcardPreload, resetFlashcardPreload } from '../preload';

/** Número de tarjetas acumuladas antes de forzar un flush automático. */
const BATCH_FLUSH_SIZE = 3;
const PENDING_PROGRESS_STORAGE_KEY = 'flashcards_pending_progress_batches';
const PRELOAD_TIMEOUT_MS = 1500;

function raceWithTimeout(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((resolve) => {
            window.setTimeout(() => resolve(null), timeoutMs);
        }),
    ]);
}

function readStoredProgressBatches() {
    try {
        const raw = localStorage.getItem(PENDING_PROGRESS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeStoredProgressBatches(batches) {
    try {
        const next = Array.isArray(batches) ? batches.filter((batch) => batch?.cards?.length) : [];
        if (next.length === 0) {
            localStorage.removeItem(PENDING_PROGRESS_STORAGE_KEY);
            return;
        }
        localStorage.setItem(PENDING_PROGRESS_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // El guardado local es respaldo; si falla, el batch en memoria sigue activo.
    }
}

function normalizeStoredCourseDirection(courseDirection) {
    if (courseDirection === 'en_es') return 'en_es';
    if (courseDirection === 'es_de') return 'es_de';
    return 'es_en';
}

function makeProgressBatchKey({ userId, category, deck, courseDirection }) {
    return `${userId || ''}::${normalizeStoredCourseDirection(courseDirection)}::${category || ''}::${deck || ''}`;
}

function persistProgressBatch(context, cards) {
    if (!context?.userId || !context?.category || !context?.deck || !Array.isArray(cards) || cards.length === 0) {
        return;
    }

    const batches = readStoredProgressBatches();
    const targetKey = makeProgressBatchKey(context);
    const existingIndex = batches.findIndex((batch) => makeProgressBatchKey(batch) === targetKey);
    const existing = existingIndex >= 0 ? batches[existingIndex] : { ...context, cards: [] };
    const mergedCards = new Map(existing.cards.map((card) => [card.index, card]));

    cards.forEach((card) => {
        mergedCards.set(card.index, { index: card.index, learned: Boolean(card.learned) });
    });

    const nextBatch = { ...context, cards: Array.from(mergedCards.values()) };
    if (existingIndex >= 0) {
        batches[existingIndex] = nextBatch;
    } else {
        batches.push(nextBatch);
    }
    writeStoredProgressBatches(batches);
}

function removeStoredProgressBatch(context) {
    const targetKey = makeProgressBatchKey(context);
    writeStoredProgressBatches(
        readStoredProgressBatches().filter((batch) => makeProgressBatchKey(batch) !== targetKey),
    );
}

function removeStoredProgressCards(context, indexes) {
    const targetKey = makeProgressBatchKey(context);
    const indexSet = new Set(indexes);
    const batches = readStoredProgressBatches().map((batch) => {
        if (makeProgressBatchKey(batch) !== targetKey) return batch;
        return {
            ...batch,
            cards: batch.cards.filter((card) => !indexSet.has(card.index)),
        };
    });
    writeStoredProgressBatches(batches);
}

export function useDeckSession(resumeSession = null) {
    const { currentCategory } = useCategoryContext();
    const { setIsCatalogVisible } = useFlashcardUiContext();
    const { setAppMessage, language = 'en', studyLanguage = 'en' } = useUIContext();
    const { confirm } = useDialog();
    const controlsCopy = getFlashcardTranslations(language).controls;
    const { isAuthenticated, user } = useAuth();
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);

    const [masterData, setMasterData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    /** Carta introductoria opcional del mazo activo (imagen sola, sin chrome) — ver §Content JSON Schema. */
    const [introCard, setIntroCard] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isDeckLoading, setIsDeckLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState(null);
    const [deckNames, setDeckNames] = useState([]);
    const [deckNamesCategory, setDeckNamesCategory] = useState(null);
    const [currentDeckName, setCurrentDeckName] = useState(null);
    const [deckSummaries, setDeckSummaries] = useState({});
    // "Crear palabra": fuerza un refetch del resumen personal aunque `currentCategory` no haya
    // cambiado (si el usuario ya estaba parado en la categoría donde creó la palabra, nada más
    // dispara el efecto de abajo — bug real: había que cerrar y volver a abrir la categoría para
    // verla). `CreateWordModal` llama `refreshPersonalWords()` después de crear con éxito.
    const [personalWordsRefreshToken, setPersonalWordsRefreshToken] = useState(0);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [resetKey, setResetKey] = useState(0);
    const [justCompletedInSession, setJustCompletedInSession] = useState(false);
    const [reachedDeckEnd, setReachedDeckEnd] = useState(false);
    const [resumeApplied, setResumeApplied] = useState(false);

    /**
     * Lote de progreso pendiente de enviar.
     * Clave: card.id  →  Valor: { index, learned, category, deck }
     * Se acumula hasta BATCH_FLUSH_SIZE o hasta que el usuario cambia de deck/grupo.
     */
    const pendingBatchRef = useRef(new Map());
    /** Contexto activo en el momento de acumular (para el flush correcto al cambiar). */
    const batchContextRef = useRef({ category: null, deck: null, userId: null, courseDirection });
    /** Ids de tarjetas ya vistas en la pasada actual (ver `reachedDeckEnd`). */
    const visitedCardIdsRef = useRef(new Set());
    /** Tarjeta objetivo solicitada (ej. al seleccionar resultado de búsqueda). */
    const pendingTargetCardRef = useRef(null);
    /** Evita que resetKey sobrescriba currentIndex a 0 al cargar tarjeta solicitada. */
    const skipNextResetRef = useRef(false);
    const summarizeDeck = useCallback((cards) => ({
        total: cards.length,
        learned: cards.filter((card) => card.learned).length,
    }), []);

    const loadFlashcards = useCallback(async (category, deck) => {
        if (!category || !deck || !user?.email) return;
        setIsDeckLoading(true);
        setLoadingStage('loading_cards');
        // Salto de búsqueda en curso hacia este (category, deck): no subir `resetKey` — este
        // callback puede invocarse más de una vez para el mismo destino (su propia identidad
        // cambia cuando `deckNames` cambia, ej. al anteponerse un mazo personal), y cada bump
        // de más dispara el efecto de reseteo de índice DESPUÉS de que `applyPendingTargetCard`
        // ya hubiera posicionado la carta correcta — pisándola de nuevo a 0.
        const jumpingToTarget = pendingTargetCardRef.current
            && pendingTargetCardRef.current.category === category
            && pendingTargetCardRef.current.deck === deck;
        if (!jumpingToTarget) {
            setResetKey((k) => k + 1);
        }
        setIntroCard(null);
        try {
            const applyLoadedDeck = (cards) => {
                setMasterData(cards);
                setFilteredData(filterUnlearned(cards));
                setDeckSummaries((prev) => ({ ...prev, [deck]: summarizeDeck(cards) }));
            };

            const preloaded = await raceWithTimeout(
                consumeFlashcardPreload(user.email, null, studyLanguage),
                PRELOAD_TIMEOUT_MS,
            );
            if (
                preloaded?.courseDirection === courseDirection
                && preloaded?.category === category
                && preloaded?.deck === deck
                && Array.isArray(preloaded.deckData)
                && preloaded.deckData.length > 0
            ) {
                applyLoadedDeck(preloaded.deckData);
                setIntroCard(preloaded.introCard || null);
                return;
            }

            const data = await flashcardPort.fetchDeckData(user.email, category, deck, courseDirection);
            const normalized = excludeDeletedCards(normalizeDeckResponse(data));
            if (normalized.length === 0) {
                throw new Error(`Deck vacío: ${category}/${deck}`);
            }
            applyLoadedDeck(normalized);
            setIntroCard(data?.intro_card?.enabled ? data.intro_card : null);
        } catch (err) {
            console.error('Error al cargar tarjetas:', { category, deck, courseDirection, error: err });
            const message = String(err?.message || '');
            const isRecoverableDeckError = message.includes('Deck vacío')
                || message.includes('not found')
                || message.includes('no encontrado');
            const fallbackDeck = isRecoverableDeckError && usesNestedLevelDecks(category)
                ? deckNames.find((name) => name !== deck)
                : null;
            if (fallbackDeck) {
                setCurrentDeckName(fallbackDeck);
                localStorage.setItem(`${LAST_DECK_KEY_PREFIX}${category}`, fallbackDeck);
            } else {
                setMasterData([]);
                setFilteredData([]);
                setAppMessage({ text: `Error al cargar tarjetas: ${deck}`, isError: true });
            }
        } finally {
            setLoadingStage(null);
            setIsDeckLoading(false);
        }
    }, [courseDirection, deckNames, setAppMessage, studyLanguage, summarizeDeck, user?.email]);

    useEffect(() => {
        // Salto de búsqueda con categoría + mazo destino en el mismo click (`changeDeck` ya fijó
        // `currentDeckName` explícitamente vía `pendingTargetCardRef`): no lo pisemos a null, o
        // se pierde y la carta buscada nunca se resuelve — solo el mazo persistido en
        // localStorage la reemplazaría, y eso no cubre mazos personales ("Crear palabra").
        const jumpingToTarget = pendingTargetCardRef.current
            && pendingTargetCardRef.current.category === currentCategory;
        if (!jumpingToTarget) {
            setCurrentDeckName(null);
        }
        setDeckNames([]);
        setDeckNamesCategory(null);
        setMasterData([]);
        setFilteredData([]);
        setDeckSummaries({});
    }, [currentCategory]);

    useEffect(() => {
        setSelectedGroup(null);
        // Salto de búsqueda en curso para esta categoría/mazo: NO subir `resetKey` acá. Cualquier
        // re-disparo posterior de este efecto (StrictMode lo invoca 2 veces por commit; también
        // puede pasar por reordenamiento de efectos async) volvería a incrementarlo, y eso
        // dispara el efecto de reseteo de índice DESPUÉS de que `applyPendingTargetCard` ya
        // hubiera posicionado la carta correcta — pisándola de nuevo a 0 (bug real reportado en
        // vivo: la carta buscada nunca se resolvía).
        const jumpingToTarget = pendingTargetCardRef.current
            && pendingTargetCardRef.current.category === currentCategory
            && pendingTargetCardRef.current.deck === currentDeckName;
        if (!jumpingToTarget) {
            setResetKey((k) => k + 1);
        }
        setJustCompletedInSession(false);
        setReachedDeckEnd(false);
    }, [currentCategory, currentDeckName]);

    const applyPendingTargetCard = useCallback((master, filtered) => {
        const pending = pendingTargetCardRef.current;
        if (!pending || master.length === 0) return;

        const getCardWordString = (c) => {
            if (!c) return '';
            const raw = c.name || c.word || c.extra?.name || c.extra?.word || '';
            return String(raw).trim().toLowerCase();
        };

        let targetCard = null;
        if (pending.word) {
            const pWord = pending.word.toLowerCase();
            targetCard = master.find((c) => getCardWordString(c) === pWord);
        }
        if (!targetCard && typeof pending.cardIndex === 'number' && pending.cardIndex >= 0 && pending.cardIndex < master.length) {
            targetCard = master[pending.cardIndex];
        }

        if (targetCard) {
            pendingTargetCardRef.current = null;
            const targetWordStr = getCardWordString(targetCard);
            const matchIdx = filtered.findIndex(
                (c) => c === targetCard || (targetWordStr && getCardWordString(c) === targetWordStr),
            );
            if (matchIdx !== -1) {
                setCurrentIndex(matchIdx);
            } else {
                const fallbackIdx = master.findIndex(
                    (c) => c === targetCard || (targetWordStr && getCardWordString(c) === targetWordStr),
                );
                if (fallbackIdx !== -1) {
                    setFilteredData(master);
                    setCurrentIndex(fallbackIdx);
                }
            }
        }
    }, []);

    useEffect(() => {
        const unlearned = filterUnlearned(masterData, selectedGroup);
        setFilteredData(unlearned);
        applyPendingTargetCard(masterData, unlearned);
    }, [masterData, selectedGroup, applyPendingTargetCard]);

    useEffect(() => {
        if (
            skipNextResetRef.current
            || (pendingTargetCardRef.current
                && pendingTargetCardRef.current.category === currentCategory
                && pendingTargetCardRef.current.deck === currentDeckName)
        ) {
            skipNextResetRef.current = false;
            visitedCardIdsRef.current = new Set();
            return;
        }
        setCurrentIndex(0);
        visitedCardIdsRef.current = new Set();
    }, [resetKey, currentCategory, currentDeckName]);

    /**
     * Cuenta las tarjetas realmente vistas en esta pasada (por id, no por índice)
     * para que `reachedDeckEnd` solo se dispare tras recorrer TODO el mazo/grupo
     * activo, no por un índice de límite falseado (ver `prevCard`, que ya no da
     * la vuelta, pero esto es la garantía real).
     */
    useEffect(() => {
        const card = filteredData[currentIndex];
        if (card) visitedCardIdsRef.current.add(card.id);
    }, [filteredData, currentIndex]);

    useEffect(() => {
        if (!currentCategory || !isAuthenticated) return;
        const loadDecks = async () => {
            setIsDeckLoading(true);
            setLoadingStage('loading_decks');
            try {
                // Salto de búsqueda (`changeDeck` con `pendingTargetCardRef` ya fijado para esta
                // categoría): el mazo destino ya está decidido explícitamente — incluye mazos
                // personales ("Crear palabra"), que ni siquiera aparecen en `names` (catálogo
                // general) y por lo tanto `resolvePersistedChoice` jamás los elegiría. No pisar
                // `currentDeckName` con el resuelto por preferencia/persistencia en ese caso.
                const hasPendingTargetForCategory = pendingTargetCardRef.current?.category === currentCategory;

                const preloaded = await raceWithTimeout(
                    consumeFlashcardPreload(user?.email, resumeSession, studyLanguage),
                    PRELOAD_TIMEOUT_MS,
                );
                if (
                    preloaded?.courseDirection === courseDirection
                    && preloaded?.category === currentCategory
                    && Array.isArray(preloaded.deckNames)
                    && preloaded.deckNames.length > 0
                ) {
                    const names = preloaded.deckNames;
                    setDeckNames(names);
                    setDeckNamesCategory(currentCategory);
                    if (hasPendingTargetForCategory) return;
                    const storageKey = `${LAST_DECK_KEY_PREFIX}${currentCategory}`;
                    const preferredDeck = resumeSession?.category === currentCategory && resumeSession?.deck
                        && names.includes(resumeSession.deck)
                        ? resumeSession.deck
                        : (preloaded.deck && names.includes(preloaded.deck)
                            ? preloaded.deck
                            : resolvePersistedChoice(storageKey, names, names[0]));
                    setCurrentDeckName(preferredDeck);
                    return;
                }

                const [result, personalResult] = await Promise.all([
                    flashcardPort.fetchDecksForCategory(currentCategory, courseDirection),
                    personalWordPort.getPersonalWordsSummary({ category: currentCategory, courseDirection }).catch(() => null),
                ]);

                if (result.success && Array.isArray(result.files)) {
                    let names = sortDeckNames(result.files, currentCategory);
                    const personalDecks = Array.isArray(personalResult?.decks) ? personalResult.decks : [];
                    if (personalDecks.length > 0) {
                        const personalNames = personalDecks.map((entry) => entry.deck).filter(Boolean);
                        names = [...personalNames.filter((name) => !names.includes(name)), ...names];
                        setDeckSummaries((prev) => {
                            const next = { ...prev };
                            personalDecks.forEach((entry) => {
                                if (!entry?.deck) return;
                                next[entry.deck] = {
                                    total: entry.total,
                                    learned: entry.learned,
                                    topicName: entry.topic_name,
                                };
                            });
                            return next;
                        });
                    }

                    setDeckNames(names);
                    setDeckNamesCategory(currentCategory);
                    if (hasPendingTargetForCategory) return;
                    const storageKey = `${LAST_DECK_KEY_PREFIX}${currentCategory}`;
                    const persistedDeck = resolvePersistedChoice(storageKey, names, names[0]);
                    const fallbackDeck = usesNestedLevelDecks(currentCategory) && persistedDeck
                        ? (names.find((name) => getLevelFromDeckName(name) === getLevelFromDeckName(persistedDeck)) ?? names[0])
                        : persistedDeck;
                    const preferredDeck = resumeSession?.category === currentCategory && resumeSession?.deck
                        && names.includes(resumeSession.deck)
                        ? resumeSession.deck
                        : fallbackDeck;
                    setCurrentDeckName(preferredDeck);
                }
            } catch {
                setAppMessage({ text: 'Error al cargar decks', isError: true });
            } finally {
                setLoadingStage((prev) => (prev === 'loading_decks' ? null : prev));
                setIsDeckLoading(false);
            }
        };
        loadDecks();
    }, [courseDirection, currentCategory, setAppMessage, isAuthenticated, resumeSession, studyLanguage, user?.email]);

    /**
     * "Crear palabra" (mazo personal — ver docs/modules/flashcards.md §Personal Words): justo
     * después de que el catálogo general de la categoría termina de cargar, consulta aparte si el
     * usuario tiene mazos personales ahí y los ANTEPONE a `deckNames`/`deckSummaries` — nunca
     * bloquea ni modifica la carga general; si no tiene ninguno no se toca nada. El usuario que
     * acaba de crear una palabra quiere verla primero, no al final de la lista.
     */
    useEffect(() => {
        if (!currentCategory || !isAuthenticated || personalWordsRefreshToken === 0) return;
        let cancelled = false;
        const loadPersonalDecks = async () => {
            try {
                const result = await personalWordPort.getPersonalWordsSummary({
                    category: currentCategory,
                    courseDirection,
                });
                const personalDecks = Array.isArray(result?.decks) ? result.decks : [];
                if (cancelled || personalDecks.length === 0) return;

                setDeckNames((prev) => {
                    const newNames = personalDecks
                        .map((entry) => entry.deck)
                        .filter((name) => name && !prev.includes(name));
                    return newNames.length > 0 ? [...newNames, ...prev] : prev;
                });
                setDeckSummaries((prev) => {
                    const next = { ...prev };
                    personalDecks.forEach((entry) => {
                        if (!entry?.deck) return;
                        // `topicName`: nombre puesto por el usuario (ver CreateWordModal/
                        // rename_personal_deck); `undefined` si nunca le puso nombre — la grilla
                        // cae al label genérico ("Mis palabras") en ese caso.
                        next[entry.deck] = {
                            total: entry.total,
                            learned: entry.learned,
                            topicName: entry.topic_name,
                        };
                    });
                    return next;
                });
            } catch {
                // Silencioso: si falla, el usuario simplemente no ve sus palabras personales esta
                // vez — el catálogo general (ya cargado) no se ve afectado.
            }
        };
        loadPersonalDecks();
        return () => {
            cancelled = true;
        };
    }, [currentCategory, courseDirection, isAuthenticated, deckNamesCategory, personalWordsRefreshToken]);

    const refreshPersonalWords = useCallback(() => {
        setPersonalWordsRefreshToken((v) => v + 1);
    }, []);

    useEffect(() => {
        if (
            currentCategory
            && currentDeckName
            && isAuthenticated
            && deckNamesCategory === currentCategory
            && deckNames.includes(currentDeckName)
        ) {
            loadFlashcards(currentCategory, currentDeckName);
        }
    }, [currentCategory, currentDeckName, deckNames, deckNamesCategory, loadFlashcards, isAuthenticated]);

    useEffect(() => {
        if (
            !usesNestedLevelDecks(currentCategory)
            || deckNamesCategory !== currentCategory
            || !user?.email
            || !isAuthenticated
            || deckNames.length === 0
        ) {
            return;
        }

        const missingDecks = deckNames.filter((deckName) => !deckSummaries[deckName]);
        if (missingDecks.length === 0) return;

        let cancelled = false;
        const loadDeckSummaries = async () => {
            try {
                const apiResult = await flashcardPort.fetchDeckSummaries(currentCategory, courseDirection);
                if (apiResult?.success && apiResult?.summaries && !cancelled) {
                    setDeckSummaries((prev) => ({ ...prev, ...apiResult.summaries }));
                    return;
                }
            } catch {
                // Fallback transparente al método por mazo si el endpoint no está disponible
            }

            const results = await Promise.allSettled(
                missingDecks.map(async (deckName) => {
                    if (deckName === currentDeckName && masterData.length > 0) {
                        return [deckName, summarizeDeck(masterData)];
                    }

                    const data = await flashcardPort.fetchDeckData(
                        user.email,
                        currentCategory,
                        deckName,
                        courseDirection,
                    );
                    const normalized = excludeDeletedCards(normalizeDeckResponse(data));
                    return [deckName, summarizeDeck(normalized)];
                }),
            );

            if (cancelled) return;

            setDeckSummaries((prev) => {
                const next = { ...prev };
                results.forEach((result) => {
                    if (result.status === 'fulfilled') {
                        const [deckName, summary] = result.value;
                        next[deckName] = summary;
                    }
                });
                return next;
            });
        };

        void loadDeckSummaries();
        return () => {
            cancelled = true;
        };
    }, [
        currentCategory,
        currentDeckName,
        deckNames,
        deckNamesCategory,
        deckSummaries,
        isAuthenticated,
        masterData,
        courseDirection,
        summarizeDeck,
        user?.email,
    ]);

    useEffect(() => {
        if (resumeApplied || !resumeSession) return;
        if (resumeSession.category !== currentCategory || resumeSession.deck !== currentDeckName) return;
        if (!masterData.length) return;

        const resumeGroup = resumeSession.selectedGroup === 'General'
            ? null
            : resumeSession.selectedGroup;
        const resumeGroupRemaining = resumeGroup ? filterUnlearned(masterData, resumeGroup) : [];
        const shouldResumeGroup = Boolean(resumeGroup && resumeGroupRemaining.length);

        if (shouldResumeGroup && resumeGroup !== selectedGroup) {
            setSelectedGroup(resumeGroup);
            return;
        }

        if (!shouldResumeGroup && selectedGroup) {
            setSelectedGroup(null);
            return;
        }

        const remaining = filterUnlearned(masterData, shouldResumeGroup ? resumeGroup : null);
        if (!remaining.length) {
            setResumeApplied(true);
            return;
        }

        setCurrentIndex(resolveResumeCardIndex(remaining, resumeSession));
        setResumeApplied(true);
    }, [
        resumeApplied,
        resumeSession,
        masterData,
        selectedGroup,
        currentCategory,
        currentDeckName,
    ]);

    useEffect(() => {
        if (!currentCategory || !currentDeckName || !filteredData.length) return;
        const card = filteredData[currentIndex];
        const scopeCards = selectedGroup
            ? masterData.filter((c) => c.group_name === selectedGroup)
            : masterData;
        writeResumeSession({
            category: currentCategory,
            deck: currentDeckName,
            cardIndex: currentIndex,
            cardId: card?.id,
            cardWord: card?.word || card?.name || card?.translation || '',
            selectedGroup: selectedGroup || null,
            cardsRemaining: filteredData.length,
            deckTotal: scopeCards.length,
        });
    }, [currentCategory, currentDeckName, currentIndex, filteredData, selectedGroup, masterData]);

    /**
     * Envía el lote pendiente al backend en una sola petición POST /api/update-batch.
     * Se llama automáticamente al cambiar de deck/grupo, al desmontar y en beforeunload.
     * @param {{ silent?: boolean }} [opts]
     */
    const flushProgress = useCallback(async ({ silent = false } = {}) => {
        const batch = pendingBatchRef.current;
        if (batch.size === 0) return;

        const { category, deck, userId, courseDirection: batchCourseDirection } = batchContextRef.current;
        if (!category || !deck || !userId) return;

        const cards = Array.from(batch.values()).map(({ index, learned }) => ({ index, learned }));
        pendingBatchRef.current = new Map();
        const storedContext = { category, deck, userId, courseDirection: batchCourseDirection };
        persistProgressBatch(storedContext, cards);

        try {
            await flashcardPort.updateCardsBatch(userId, category, deck, cards, batchCourseDirection);
            removeStoredProgressBatch(storedContext);
        } catch (err) {
            cards.forEach((card) => {
                pendingBatchRef.current.set(card.index, card);
            });
            if (!silent) {
                setAppMessage({ text: `Error al guardar progreso: ${err.message}`, isError: true });
            }
        }
    }, [setAppMessage]);

    const previousCourseDirectionRef = useRef(courseDirection);
    useEffect(() => {
        if (previousCourseDirectionRef.current === courseDirection) return;
        void flushProgress({ silent: true });
        previousCourseDirectionRef.current = courseDirection;
    }, [courseDirection, flushProgress]);

    /**
     * Versión fire-and-forget para beforeunload (no puede usar async/await).
     * Usa fetch con keepalive: true para que el navegador complete la petición
     * incluso si la página se está cerrando.
     */
    const flushProgressBeacon = useCallback(() => {
        const batch = pendingBatchRef.current;
        if (batch.size === 0) return;
        const { category, deck, userId, courseDirection: batchCourseDirection } = batchContextRef.current;
        if (!category || !deck || !userId) return;

        const cards = Array.from(batch.values()).map(({ index, learned }) => ({ index, learned }));
        pendingBatchRef.current = new Map();
        persistProgressBatch({ category, deck, userId, courseDirection: batchCourseDirection }, cards);

        const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';
        const token = localStorage.getItem('auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        try {
            fetch(`${apiBase}/api/update-batch`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    user_id: userId,
                    category,
                    deck,
                    cards,
                    course_direction: normalizeStoredCourseDirection(batchCourseDirection),
                }),
                keepalive: true,
                credentials: 'include',
            });
        } catch (_) {
            // No podemos hacer nada en beforeunload
        }
    }, []);

    useEffect(() => {
        if (!isAuthenticated || !user?.email) return;

        let cancelled = false;
        const retryStoredBatches = async () => {
            const batches = readStoredProgressBatches().filter((batch) => batch.userId === user.email);
            for (const batch of batches) {
                if (cancelled) return;
                try {
                    await flashcardPort.updateCardsBatch(
                        batch.userId,
                        batch.category,
                        batch.deck,
                        batch.cards,
                        normalizeStoredCourseDirection(batch.courseDirection),
                    );
                    removeStoredProgressBatch(batch);
                } catch {
                    return;
                }
            }

            const srsBatches = (await listSrsBatches().catch(() => [])).filter(
                (batch) => batch.userId === user.email,
            );
            for (const batch of srsBatches) {
                if (cancelled) return;
                try {
                    await flashcardPort.updateCardsBatch(
                        batch.userId,
                        batch.category,
                        batch.deck,
                        batch.cards,
                        normalizeStoredCourseDirection(batch.courseDirection),
                    );
                    await removeSrsBatch(batch);
                } catch {
                    return;
                }
            }
        };

        void retryStoredBatches();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, user?.email]);

    const changeDeck = (newDeck, targetCardIndex = null, targetCategory = null, targetMeta = null) => {
        markUserNavigation();
        void flushProgress({ silent: true });
        setJustCompletedInSession(false);
        setReachedDeckEnd(false);
        visitedCardIdsRef.current = new Set();
        const cat = targetCategory || currentCategory;
        if (cat) {
            localStorage.setItem(`${LAST_DECK_KEY_PREFIX}${cat}`, newDeck);
        }
        if (typeof targetCardIndex === 'number' || targetMeta) {
            pendingTargetCardRef.current = {
                category: cat,
                deck: newDeck,
                cardIndex: targetCardIndex,
                word: targetMeta?.word || null,
            };
            skipNextResetRef.current = true;
        }
        if (cat === currentCategory && newDeck === currentDeckName && masterData.length > 0) {
            if (pendingTargetCardRef.current) {
                applyPendingTargetCard(masterData, filteredData);
            } else {
                setCurrentIndex(0);
                setResetKey((k) => k + 1);
            }
        } else {
            setCurrentDeckName(newDeck);
        }
    };

    const updateCardImagePath = (cardId, newPath, defIndex, form = 'v1') => {
        const updater = (prev) => updateCardImageInDeck(prev, cardId, newPath, defIndex, form);
        setMasterData(updater);
        setFilteredData(updater);
    };

    const deleteDefinition = async (cardId, defIndex, form = 'v1') => {
        try {
            await flashcardPort.deleteDefinition({
                category: currentCategory,
                deck: currentDeckName,
                index: cardId,
                defIndex,
                form,
                courseDirection,
            });
        } catch (err) {
            setAppMessage({ text: `Error al eliminar frase: ${err.message}`, isError: true });
            return false;
        }
        const updater = (prev) => removeDefinitionFromDeck(prev, cardId, defIndex, form);
        setMasterData(updater);
        setFilteredData(updater);
        return true;
    };

    /**
     * Retira del catálogo la tarjeta visible (curaduría de admin: `DELETE /api/delete-card` la
     * marca `"deleted": true` en el JSON, para TODOS los usuarios de esa dirección de curso) y
     * deja la sesión en un estado coherente. Devuelve qué pasó, para que la página decida si
     * además tiene que navegar:
     *
     * | Situación tras borrar                          | Devuelve          | Qué ve el admin |
     * |------------------------------------------------|-------------------|-----------------|
     * | Quedan tarjetas por estudiar                    | `advanced`        | La siguiente tarjeta (o la anterior si borró la última de la lista) |
     * | Era la última SIN aprender, pero quedan aprendidas | `deck_completed` | Pantalla de fin de mazo/grupo con la recomendación de continuar |
     * | Era la última tarjeta del mazo (mazo vacío)     | `deck_empty`      | La página salta al siguiente mazo/categoría |
     * | Falló la petición (403/404/409/red)             | `error`           | Mensaje de error; nada cambia en pantalla |
     *
     * El 409 (`WordMismatch`) es el caso de índice viejo: el mazo cambió en disco desde que se
     * cargó, y el backend prefiere no borrar nada antes que borrar la tarjeta equivocada.
     */
    const deleteCard = async () => {
        const card = filteredData[currentIndex];
        if (!card || !currentCategory || !currentDeckName) return 'error';

        try {
            await flashcardPort.deleteCard({
                category: currentCategory,
                deck: currentDeckName,
                index: card.id,
                expectedWord: card.name || card.word || '',
                courseDirection,
            });
        } catch (err) {
            setAppMessage({ text: `No se pudo eliminar la tarjeta: ${err.message}`, isError: true });
            return 'error';
        }

        // La precarga silenciosa cachea el mazo entero: sin invalidarla, la tarjeta retirada
        // reaparece la próxima vez que se entre al mazo (gana la carrera contra el fetch).
        resetFlashcardPreload(user?.email);

        const updatedMaster = masterData.filter((c) => c.id !== card.id);
        const remaining = filterUnlearned(updatedMaster, selectedGroup);
        setMasterData(updatedMaster);
        setFilteredData(remaining);
        setDeckSummaries((prev) => ({ ...prev, [currentDeckName]: summarizeDeck(updatedMaster) }));
        // Progreso sin enviar y conteo de "pasada completa" de una tarjeta que ya no existe.
        pendingBatchRef.current.delete(card.id);
        visitedCardIdsRef.current.delete(card.id);
        // Mismo criterio que al aprender: el índice se queda donde está (la siguiente ocupa el
        // lugar de la borrada) salvo que se haya borrado la última, donde retrocede una.
        setCurrentIndex((prev) => computeNextIndex(prev, remaining.length));

        if (updatedMaster.length === 0) return 'deck_empty';
        if (remaining.length === 0) {
            // Sin esto `isCompletionVisible` sería true pero no habría pantalla que mostrar
            // (`shouldShowCompletionCard` exige justCompleted/reachedEnd/intención de usuario):
            // el admin caería en "No hay tarjetas disponibles" sin salida.
            setJustCompletedInSession(true);
            return 'deck_completed';
        }
        return 'advanced';
    };

    const markAsLearned = async () => {
        const card = filteredData[currentIndex];
        if (!card || !user?.email) return;
        resetFlashcardPreload(user.email);

        // Actualización optimista: la UI avanza de inmediato sin esperar la red.
        const { updated, remaining, completed } = computeFilteredAfterLearn(masterData, card.id, selectedGroup);
        setMasterData(updated);
        setFilteredData(remaining);
        setDeckSummaries((prev) => ({ ...prev, [currentDeckName]: summarizeDeck(updated) }));
        if (completed) setJustCompletedInSession(true);
        setCurrentIndex((prev) => computeNextIndex(prev, remaining.length));

        // Registrar en el lote pendiente usando el índice original de la tarjeta.
        batchContextRef.current = {
            category: currentCategory,
            deck: currentDeckName,
            userId: user.email,
            courseDirection,
        };
        pendingBatchRef.current.set(card.id, { index: card.id, learned: true });
        persistProgressBatch(batchContextRef.current, Array.from(pendingBatchRef.current.values()));

        // Flush automático cuando el lote alcanza el tamaño máximo.
        if (pendingBatchRef.current.size >= BATCH_FLUSH_SIZE) {
            void flushProgress({ silent: true });
        }
    };

    /**
     * La selección manual convierte la tarjeta en candidata SRS para hoy, sin
     * marcarla como aprendida: es solo un recordatorio adicional para que
     * también aparezca en el repaso diario — sigue en el mazo original tal
     * cual estaba (`learned` conserva su valor actual, no se fuerza a true).
     * Se respalda primero en IndexedDB para sobrevivir modo offline/cierre.
     */
    const addToReview = async () => {
        const card = filteredData[currentIndex];
        if (!card || !user?.email || !currentCategory || !currentDeckName) return;

        const context = {
            category: currentCategory,
            deck: currentDeckName,
            userId: user.email,
            courseDirection,
        };
        const update = {
            index: card.id,
            learned: Boolean(card.learned),
            ...SrsEngine.scheduleForReview(new Date()),
        };

        try {
            await queueSrsBatch(context, [update]);
            await flashcardPort.updateCardsBatch(
                context.userId,
                context.category,
                context.deck,
                [update],
                context.courseDirection,
            );
            await removeSrsBatch(context);
            setAppMessage({ text: language === 'es' ? 'Tarjeta agregada al repaso diario.' : 'Card added to daily review.', isError: false });
        } catch {
            setAppMessage({
                text: language === 'es'
                    ? 'Tarjeta guardada localmente; se sincronizará al reconectar.'
                    : 'Card saved locally; it will sync when reconnected.',
                isError: false,
            });
        }
    };

    const resetDeck = async () => {
        if (!user?.email) return;
        resetFlashcardPreload(user.email);

        const shouldReset = await confirm({
            title: controlsCopy.resetConfirmTitle,
            message: controlsCopy.resetConfirmMessage,
            tone: 'danger',
            confirmLabel: controlsCopy.reset,
        });
        if (!shouldReset) return;

        // El reset solo afecta al deck/tópico activo. Conservamos los lotes pendientes
        // de los demás decks y categorías del usuario.
        pendingBatchRef.current = new Map();
        removeStoredProgressBatch({
            category: currentCategory,
            deck: currentDeckName,
            userId: user.email,
            courseDirection,
        });

        try {
            await flashcardPort.resetDeckStatus(
                user.email,
                currentCategory,
                currentDeckName,
                courseDirection,
            );
            resetFlashcardPreload(user.email);
            const resetCards = masterData.map((card) => ({ ...card, learned: false }));
            setMasterData(resetCards);
            setFilteredData(filterUnlearned(resetCards, selectedGroup));
            setDeckSummaries((prev) => ({
                ...prev,
                [currentDeckName]: { total: resetCards.length, learned: 0 },
            }));
            setJustCompletedInSession(false);
            setReachedDeckEnd(false);
            setResetKey((k) => k + 1);
            await loadFlashcards(currentCategory, currentDeckName);
        } catch {
            setAppMessage({ text: 'Error al resetear', isError: true });
        }
    };

    const resetDeckByName = async (deckName) => {
        if (!user?.email || !currentCategory || !deckName) return false;
        resetFlashcardPreload(user.email);

        if (deckName === currentDeckName) {
            pendingBatchRef.current = new Map();
        }
        removeStoredProgressBatch({
            category: currentCategory,
            deck: deckName,
            userId: user.email,
            courseDirection,
        });

        setIsDeckLoading(true);
        setLoadingStage('loading_cards');

        try {
            await flashcardPort.resetDeckStatus(
                user.email,
                currentCategory,
                deckName,
                courseDirection,
            );
            resetFlashcardPreload(user.email);

            if (deckName === currentDeckName) {
                const resetCards = masterData.map((card) => ({ ...card, learned: false }));
                setMasterData(resetCards);
                setFilteredData(filterUnlearned(resetCards, selectedGroup));
                setJustCompletedInSession(false);
                setReachedDeckEnd(false);
                setResetKey((k) => k + 1);
                await loadFlashcards(currentCategory, deckName);
            }

            setDeckSummaries((prev) => ({
                ...prev,
                [deckName]: { total: prev[deckName]?.total ?? 0, learned: 0 },
            }));
            return true;
        } catch {
            setAppMessage({ text: 'Error al resetear', isError: true });
            return false;
        } finally {
            setLoadingStage(null);
            setIsDeckLoading(false);
        }
    };

    const resetGroup = async (groupName) => {
        if (!user?.email || !currentCategory || !currentDeckName) return false;
        resetFlashcardPreload(user.email);

        const targetCards = getGroupLearnedCards(masterData, groupName);
        if (targetCards.length === 0) return false;

        // Vaciar lote antes de resetear un grupo (no tiene sentido guardar tarjetas que se van a desaprender).
        const targetIndexes = targetCards.map((card) => card.id);
        targetIndexes.forEach((index) => pendingBatchRef.current.delete(index));
        removeStoredProgressCards(
            { category: currentCategory, deck: currentDeckName, userId: user.email, courseDirection },
            targetIndexes,
        );

        setIsDeckLoading(true);
        setLoadingStage('loading_cards');

        try {
            await Promise.all(
                targetCards.map((card) =>
                    flashcardPort.updateCardStatus(
                        user.email,
                        currentCategory,
                        currentDeckName,
                        card.id,
                        false,
                        courseDirection,
                    ),
                ),
            );

            const updated = resetGroupInDeck(masterData, groupName);
            setMasterData(updated);
            setDeckSummaries((prev) => ({ ...prev, [currentDeckName]: summarizeDeck(updated) }));
            setSelectedGroup(groupName === 'General' ? null : groupName);
            setResetKey((k) => k + 1);
            return true;
        } catch {
            setAppMessage({ text: 'Error al reiniciar subcategoría', isError: true });
            return false;
        } finally {
            setLoadingStage(null);
            setIsDeckLoading(false);
        }
    };

    const nextCard = () => {
        // La intro ocupa el lugar visual de la carta 0: "siguiente" simplemente la descarta,
        // dejando ver la carta real que ya está debajo (currentIndex no se mueve).
        if (introCard) {
            setIntroCard(null);
            return;
        }
        if (!filteredData.length) return;
        if (currentIndex >= filteredData.length - 1) {
            // Solo cierra la pasada si de verdad se vieron todas las tarjetas del
            // mazo/grupo activo (no solo si el índice quedó en el límite, que
            // `prevCard` podría alcanzar sin haber recorrido nada).
            if (visitedCardIdsRef.current.size >= filteredData.length) {
                setReachedDeckEnd(true);
                visitedCardIdsRef.current = new Set();
            }
            return;
        }
        setCurrentIndex((p) => p + 1);
    };
    // No da la vuelta al llegar a la primera tarjeta: envolver a la última falseaba
    // el conteo de "fin de mazo" (bug real jul 2026 — ver `nextCard`/reporte de usuario).
    const prevCard = () => {
        if (!filteredData.length) return;
        setCurrentIndex((p) => Math.max(0, p - 1));
    };

    /**
     * Repasar de nuevo tras llegar al final navegando (sin marcar todo como aprendido):
     * vuelve a la tarjeta 1 sin borrar progreso ni pedir confirmación (a diferencia de
     * resetDeck, que sí reinicia el aprendizaje y es la acción correcta cuando ya se
     * marcó todo como aprendido).
     */
    const reviewDeckAgain = () => {
        setCurrentIndex(0);
        setReachedDeckEnd(false);
        visitedCardIdsRef.current = new Set();
    };

    const changeGroup = (group) => {
        markUserNavigation();
        void flushProgress({ silent: true });
        setSelectedGroup(group);
        setResetKey((k) => k + 1);
        setJustCompletedInSession(false);
        setReachedDeckEnd(false);
        setIsCatalogVisible(false);
    };

    // Flush al desmontar el componente (navegación SPA, cierre de sesión, etc.)
    useEffect(() => {
        return () => {
            void flushProgress({ silent: true });
        };
    }, [flushProgress]);

    // Flush en beforeunload (cierre de pestaña / recarga de página).
    // Usa keepalive fetch para que el navegador complete la petición tras cerrar.
    useEffect(() => {
        window.addEventListener('beforeunload', flushProgressBeacon);
        return () => window.removeEventListener('beforeunload', flushProgressBeacon);
    }, [flushProgressBeacon]);

    return {
        masterData,
        filteredData,
        introCard,
        dismissIntroCard: () => setIntroCard(null),
        currentIndex,
        setCurrentIndex,
        isDeckLoading,
        loadingStage,
        deckNames,
        deckSummaries,
        currentDeckName,
        changeDeck,
        updateCardImagePath,
        deleteDefinition,
        deleteCard,
        markAsLearned,
        addToReview,
        resetDeck,
        resetDeckByName,
        resetGroup,
        nextCard,
        prevCard,
        reviewDeckAgain,
        currentCard: filteredData[currentIndex],
        selectedGroup,
        setSelectedGroup: changeGroup,
        justCompletedInSession,
        reachedDeckEnd,
        flushProgress,
        refreshPersonalWords,
    };
}
