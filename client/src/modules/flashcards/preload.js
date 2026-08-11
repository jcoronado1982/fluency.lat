import { flashcardPort } from './composition';
import { FALLBACK_CATEGORIES, sortCategories } from './config/catalogOrder';
import { getCategoryOrderPreference } from './config/catalogPreferences';
import { LAST_CATEGORY_KEY, LAST_DECK_KEY_PREFIX } from './config/sessionKeys';
import {
    getCourseDirectionFromStudyLanguage,
    normalizeDeckResponse,
    parseCategoriesResponse,
    resolvePersistedChoice,
    sortDeckNames,
} from './useCases/deckUseCases';

const preloadState = {
    email: null,
    courseDirection: null,
    categoriesPromise: null,
    promise: null,
    data: null,
};

const getPreferredCategory = (resumeSessionCategory, categories) => {
    if (resumeSessionCategory && categories.includes(resumeSessionCategory)) {
        return resumeSessionCategory;
    }
    return resolvePersistedChoice(LAST_CATEGORY_KEY, categories, categories[0] ?? null);
};

const getPreferredDeck = (category, resumeSessionDeck, deckNames) => {
    if (resumeSessionDeck && deckNames.includes(resumeSessionDeck)) {
        return resumeSessionDeck;
    }
    return resolvePersistedChoice(`${LAST_DECK_KEY_PREFIX}${category}`, deckNames, deckNames[0] ?? null);
};

/**
 * Precarga silenciosa del arranque de Flashcards.
 * Se ejecuta desde onboarding para que categorías, decks y el primer deck lleguen cacheados.
 */
export async function preloadFlashcardStart(userEmail, resumeSession = null, studyLanguage = 'en') {
    if (!userEmail) return null;
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    if (
        preloadState.email === userEmail
        && preloadState.courseDirection === courseDirection
        && preloadState.promise
    ) {
        return preloadState.promise;
    }

    const categoriesPromise = (async () => {
        const categoriesResult = await flashcardPort.fetchCategories(courseDirection);
        const { names, totals } = parseCategoriesResponse(categoriesResult);
        const categories = sortCategories(names, getCategoryOrderPreference(userEmail, names));
        const resolvedCategories = categories.length > 0 ? categories : [...FALLBACK_CATEGORIES];
        const category = getPreferredCategory(resumeSession?.category, resolvedCategories);

        return {
            categories: resolvedCategories,
            categoryTotals: totals,
            category,
            courseDirection,
        };
    })();

    const promise = (async () => {
        const categoryData = await categoriesPromise;
        const { category } = categoryData;

        let deckNames = [];
        let deck = null;
        let deckData = null;

        if (category) {
            const decksResult = await flashcardPort.fetchDecksForCategory(category, courseDirection);
            deckNames = decksResult?.success && Array.isArray(decksResult.files)
                ? sortDeckNames(decksResult.files, category)
                : [];
            deck = getPreferredDeck(category, resumeSession?.deck, deckNames);

            if (deck) {
                const rawDeck = await flashcardPort.fetchDeckData(userEmail, category, deck, courseDirection);
                deckData = normalizeDeckResponse(rawDeck);
            }
        }

        const data = {
            ...categoryData,
            deck,
            deckNames,
            deckData,
        };

        preloadState.data = data;
        return data;
    })().catch((error) => {
        console.error('No se pudo precargar Flashcards desde onboarding.', error);
        preloadState.data = null;
        return null;
    });

    preloadState.email = userEmail;
    preloadState.courseDirection = courseDirection;
    preloadState.categoriesPromise = categoriesPromise;
    preloadState.promise = promise;
    return promise;
}

/** Entrega las categorías apenas están disponibles, sin esperar decks ni tarjetas. */
export function consumeCategoryPreload(userEmail, resumeSession = null, studyLanguage = 'en') {
    if (!userEmail) return Promise.resolve(null);
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    if (
        preloadState.email === userEmail
        && preloadState.courseDirection === courseDirection
        && preloadState.categoriesPromise
    ) {
        return preloadState.categoriesPromise;
    }
    void preloadFlashcardStart(userEmail, resumeSession, studyLanguage);
    return preloadState.categoriesPromise;
}

/** Reutiliza la precarga en curso o la inicia si aún no existe. */
export function consumeFlashcardPreload(userEmail, resumeSession = null, studyLanguage = 'en') {
    if (!userEmail) return Promise.resolve(null);
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    if (
        preloadState.email === userEmail
        && preloadState.courseDirection === courseDirection
        && preloadState.promise
    ) {
        return preloadState.promise;
    }
    return preloadFlashcardStart(userEmail, resumeSession, studyLanguage);
}

export function getFlashcardPreloadSnapshot(userEmail) {
    if (preloadState.email === userEmail && preloadState.data) {
        return preloadState.data;
    }
    return null;
}

export function resetFlashcardPreload(userEmail = null) {
    if (userEmail && preloadState.email !== userEmail) {
        return;
    }

    preloadState.email = null;
    preloadState.courseDirection = null;
    preloadState.categoriesPromise = null;
    preloadState.promise = null;
    preloadState.data = null;
}
