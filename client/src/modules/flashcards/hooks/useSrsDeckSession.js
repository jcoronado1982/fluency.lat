import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useUIContext } from '../../../context/UIContext';
import { flashcardPort, srsPort, staticDeckPort } from '../composition';
import { getCourseDirectionFromStudyLanguage } from '../useCases/deckUseCases';
import { assembleSrsDeck } from '../useCases/srsDeckUseCases';
import { SRS_ACTIONS, SrsEngine } from '../domain/SrsEngine';
import { listSrsBatches, queueSrsBatch, removeSrsBatch } from '../adapters/srsOutboxIndexedDb';

const SRS_BATCH_FLUSH_SIZE = 3;

const batchKey = ({ userId, courseDirection, category, deck }) => (
    `${userId}::${courseDirection}::${category}::${deck}`
);

const totalPending = (groups) => Array.from(groups.values())
    .reduce((total, group) => total + group.cards.size, 0);

export function useSrsDeckSession() {
    const { user, isAuthenticated } = useAuth();
    const { studyLanguage = 'en', setAppMessage } = useUIContext();
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    const [masterData, setMasterData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isDeckLoading, setIsDeckLoading] = useState(true);
    const [loadingStage, setLoadingStage] = useState('loading_cards');
    const [justCompletedInSession, setJustCompletedInSession] = useState(false);
    const pendingGroupsRef = useRef(new Map());

    const flushProgress = useCallback(async ({ silent = false } = {}) => {
        if (pendingGroupsRef.current.size === 0) return;
        const snapshot = pendingGroupsRef.current;
        pendingGroupsRef.current = new Map();

        for (const group of snapshot.values()) {
            const cards = Array.from(group.cards.values());
            try {
                await flashcardPort.updateCardsBatch(
                    group.context.userId,
                    group.context.category,
                    group.context.deck,
                    cards,
                    group.context.courseDirection,
                );
                await removeSrsBatch(group.context);
            } catch (error) {
                const key = batchKey(group.context);
                const restored = pendingGroupsRef.current.get(key) || {
                    context: group.context,
                    cards: new Map(),
                };
                cards.forEach((card) => restored.cards.set(card.index, card));
                pendingGroupsRef.current.set(key, restored);
                await queueSrsBatch(group.context, cards).catch(() => {});
                if (!silent) {
                    setAppMessage({ text: `Error al guardar el repaso: ${error.message}`, isError: true });
                }
            }
        }
    }, [setAppMessage]);

    useEffect(() => {
        if (!isAuthenticated || !user?.email) return undefined;
        let cancelled = false;

        const loadReview = async () => {
            setIsDeckLoading(true);
            setLoadingStage('loading_cards');
            try {
                const stored = (await listSrsBatches().catch(() => [])).filter(
                    (batch) => batch.userId === user.email && batch.courseDirection === courseDirection,
                );
                for (const batch of stored) {
                    if (cancelled) return;
                    await flashcardPort.updateCardsBatch(
                        batch.userId,
                        batch.category,
                        batch.deck,
                        batch.cards,
                        batch.courseDirection,
                    );
                    await removeSrsBatch(batch);
                }

                const response = await srsPort.fetchDueCards(courseDirection);
                const queue = SrsEngine.buildDailyQueue(response?.cards || [], new Date(), 10);
                const cards = await assembleSrsDeck(queue, (coordinate) => staticDeckPort.fetchDeck({
                    userId: user.email,
                    courseDirection,
                    category: coordinate.category,
                    deck: coordinate.deck,
                }));
                if (cancelled) return;
                setMasterData(cards);
                setFilteredData(cards);
                setCurrentIndex(0);
                setJustCompletedInSession(false);
            } catch (error) {
                if (!cancelled) {
                    setMasterData([]);
                    setFilteredData([]);
                    setAppMessage({ text: `No se pudo preparar el repaso: ${error.message}`, isError: true });
                }
            } finally {
                if (!cancelled) {
                    setLoadingStage(null);
                    setIsDeckLoading(false);
                }
            }
        };

        void loadReview();
        return () => { cancelled = true; };
    }, [courseDirection, isAuthenticated, setAppMessage, user?.email]);

    const reviewCard = useCallback(async (action) => {
        const card = filteredData[currentIndex];
        if (!card?.srs_coordinate || !user?.email) return;
        const schedule = SrsEngine.calculateReview(card.srs_progress, action, new Date());
        const { category, deck, card_index: cardIndex } = card.srs_coordinate;
        const context = { userId: user.email, courseDirection, category, deck };
        const key = batchKey(context);
        const group = pendingGroupsRef.current.get(key) || { context, cards: new Map() };
        group.cards.set(cardIndex, {
            index: cardIndex,
            // "No la sé"/"La sé" solo reprograman el repaso: no tocan si la tarjeta
            // cuenta como aprendida en el mazo libre (conservan `card.learned` tal
            // cual). "Ya la domino" (EXPEL) sí es una graduación real: además de
            // sacarla de futuros repasos (box_level 99), la marca aprendida.
            learned: action === SRS_ACTIONS.EXPEL ? true : Boolean(card.learned),
            ...schedule,
        });
        pendingGroupsRef.current.set(key, group);
        await queueSrsBatch(context, Array.from(group.cards.values())).catch(() => {});

        const remaining = filteredData.filter((entry) => entry.srs_key !== card.srs_key);
        if (remaining.length === 0) {
            // Evita que el dashboard vuelva a sugerir una sesión que acaba de terminar.
            await flushProgress({ silent: true });
        } else if (totalPending(pendingGroupsRef.current) >= SRS_BATCH_FLUSH_SIZE) {
            void flushProgress({ silent: true });
        }

        setFilteredData(remaining);
        setCurrentIndex((position) => Math.max(0, Math.min(position, remaining.length - 1)));
        if (remaining.length === 0) setJustCompletedInSession(true);
    }, [courseDirection, currentIndex, filteredData, flushProgress, user?.email]);

    const flushProgressBeacon = useCallback(() => {
        if (pendingGroupsRef.current.size === 0) return;
        const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';
        const token = localStorage.getItem('auth_token');
        for (const group of pendingGroupsRef.current.values()) {
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            try {
                fetch(`${apiBase}/api/update-batch`, {
                    method: 'POST',
                    headers,
                    credentials: 'include',
                    keepalive: true,
                    body: JSON.stringify({
                        user_id: group.context.userId,
                        category: group.context.category,
                        deck: group.context.deck,
                        course_direction: group.context.courseDirection,
                        cards: Array.from(group.cards.values()),
                    }),
                });
            } catch {
                // El respaldo local se reintentará en la siguiente sesión.
            }
        }
    }, []);

    useEffect(() => {
        window.addEventListener('beforeunload', flushProgressBeacon);
        return () => window.removeEventListener('beforeunload', flushProgressBeacon);
    }, [flushProgressBeacon]);

    useEffect(() => () => { void flushProgress({ silent: true }); }, [flushProgress]);

    const currentCard = filteredData[currentIndex] || null;
    const nextCard = () => filteredData.length && setCurrentIndex((value) => (value + 1) % filteredData.length);
    const prevCard = () => filteredData.length && setCurrentIndex(
        (value) => (value - 1 + filteredData.length) % filteredData.length,
    );

    return {
        masterData,
        filteredData,
        currentIndex,
        setCurrentIndex,
        currentCard,
        currentCategory: currentCard?.srs_coordinate?.category || null,
        currentDeckName: currentCard?.srs_coordinate?.deck || null,
        isDeckLoading,
        loadingStage,
        isSrsMode: true,
        justCompletedInSession,
        reviewCard,
        removeFromReview: () => reviewCard(SRS_ACTIONS.EXPEL),
        markAsLearned: () => reviewCard(SRS_ACTIONS.CORRECT),
        nextCard,
        prevCard,
        flushProgress,
        deckNames: [],
        deckSummaries: {},
        selectedGroup: null,
        setSelectedGroup: () => {},
        changeDeck: () => {},
        resetDeck: () => {},
        resetGroup: async () => false,
        updateCardImagePath: () => {},
        deleteDefinition: async () => false,
    };
}
