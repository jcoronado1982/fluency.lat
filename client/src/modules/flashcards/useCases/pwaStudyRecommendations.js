import { formatDeckCategoryName } from './deckUseCases';

const formatCategoryLabel = (category, language = 'en') => {
    const value = String(category || '').replace(/[_-]+/g, ' ').trim();
    if (!value) return '';

    const label = value.replace(/\b\w/g, (letter) => letter.toUpperCase());
    if (language !== 'es') return label;

    const translations = {
        nouns: 'Sustantivos',
        verbs: 'Verbos',
        adjectives: 'Adjetivos',
        adverbs: 'Adverbios',
        preposition: 'Preposiciones',
        pronouns: 'Pronombres',
        connectors: 'Conectores',
        determinant: 'Determinantes',
        phrasal_verbs: 'Verbos Frasales',
    };
    return translations[category] || label;
};

const getLevelId = (deckName) => {
    if (String(deckName).startsWith('2-intermediate')) return 'A2';
    if (String(deckName).startsWith('3-advanced')) return 'B1';
    return 'A1';
};

/**
 * Adapta learning-stats a las tarjetas reales de recomendación del carrusel PWA.
 * Prioriza otros mazos de la MISMA categoría activa (para continuar la ruta que
 * el usuario ya eligió: verbos -> verbos, sustantivos -> sustantivos), evita el
 * mazo activo, y solo diversifica con otras categorías para llenar los espacios
 * restantes.
 */
export function buildPwaStudyRecommendations({
    stats,
    currentCategory = null,
    currentDeck = null,
    language = 'en',
    limit = 4,
} = {}) {
    const decks = Array.isArray(stats?.decks_progress) ? stats.decks_progress : [];
    const activeCategory = String(currentCategory || '').toLowerCase();
    const activeDeck = String(currentDeck || '').replace(/\.json$/i, '').toLowerCase();

    const candidates = decks
        .filter((deck) => deck?.category && deck?.deck)
        .map((deck, index) => {
            const totalCount = Number(deck.total_count) || 0;
            const learnedCount = Number(deck.learned_count) || 0;
            const progress = totalCount > 0 ? learnedCount / totalCount : 0;
            return {
                category: deck.category,
                deckName: deck.deck,
                learnedCount,
                totalCount,
                progress,
                lastTouched: deck.last_touched ? new Date(deck.last_touched).getTime() : 0,
                firstImagePath: deck.first_image_path || null,
                sourceIndex: index,
            };
        })
        .filter((deck) => {
            const normalizedDeck = deck.deckName.replace(/\.json$/i, '').toLowerCase();
            return !(deck.category.toLowerCase() === activeCategory && normalizedDeck === activeDeck);
        })
        .sort((left, right) => {
            const leftInProgress = left.progress > 0 && left.progress < 1 ? 1 : 0;
            const rightInProgress = right.progress > 0 && right.progress < 1 ? 1 : 0;
            if (leftInProgress !== rightInProgress) return rightInProgress - leftInProgress;
            if (left.progress === 1 && right.progress !== 1) return 1;
            if (right.progress === 1 && left.progress !== 1) return -1;
            return right.lastTouched - left.lastTouched || left.sourceIndex - right.sourceIndex;
        });

    const selected = [];
    const selectedCategories = new Set();
    const selectedDecks = new Set();
    const addCandidate = (candidate, allowRepeatedCategory = false) => {
        if (!candidate || selected.length >= limit) return;
        const categoryKey = candidate.category.toLowerCase();
        const deckKey = `${categoryKey}|${candidate.deckName.replace(/\.json$/i, '').toLowerCase()}`;
        if (selectedDecks.has(deckKey)) return;
        if (!allowRepeatedCategory && selectedCategories.has(categoryKey)) return;
        selected.push(candidate);
        selectedCategories.add(categoryKey);
        selectedDecks.add(deckKey);
    };

    candidates
        .filter((deck) => deck.category.toLowerCase() === activeCategory)
        .forEach((deck) => addCandidate(deck, true));
    candidates
        .filter((deck) => deck.category.toLowerCase() !== activeCategory)
        .forEach((deck) => addCandidate(deck));
    candidates.forEach((deck) => addCandidate(deck, true));

    return selected.slice(0, limit).map((deck) => ({
        category: deck.category,
        categoryLabel: formatCategoryLabel(deck.category, language),
        deckName: deck.deckName,
        deckLabel: formatDeckCategoryName(deck.deckName, language),
        levelId: getLevelId(deck.deckName),
        firstImagePath: deck.firstImagePath,
    }));
}

export function extractPwaRecommendationImage(deckResponse) {
    const cards = Array.isArray(deckResponse)
        ? deckResponse
        : (Array.isArray(deckResponse?.flashcards) ? deckResponse.flashcards : []);
    const card = cards.find((item) => !item?.learned) || cards[0];
    const definition = Array.isArray(card?.definitions) ? card.definitions[0] : null;
    return definition?.imagePath || definition?.image_path || null;
}
