import React, { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { CategoryContext as StudyCategoryContext } from '../../../components/flashcardStudy/context/flashcardStudyContext';
import { flashcardPort } from '../composition';
import { useAuth } from '../../../context/AuthContext';
import { useUIContext } from '../../../context/UIContext';
import { FALLBACK_CATEGORIES, sortCategories } from '../config/catalogOrder';
import {
    getCategoryOrderPreference,
    hasLegacyAlphabeticalCategoryOrder,
    moveOrderedItem,
    saveCategoryOrderPreference,
    isCatalogPreferencesCurrent,
} from '../config/catalogPreferences';
import { markUserNavigation } from '../navigationIntent';
import {
    getCourseDirectionFromStudyLanguage,
    parseCategoriesResponse,
    resolvePersistedChoice,
} from '../useCases/deckUseCases';
import { consumeCategoryPreload } from '../preload';
import { LAST_CATEGORY_KEY, RECENTLY_FINISHED_DECK_KEY } from '../config/sessionKeys';

const readRecentlyFinishedDecks = () => {
    try {
        const raw = localStorage.getItem(RECENTLY_FINISHED_DECK_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        return list.filter((entry) => entry?.category && entry?.deck);
    } catch {
        return [];
    }
};

// Agrega `entry` al final de `list` (más reciente = más al fondo de la lista renderizada),
// quitando cualquier ocurrencia previa para no duplicar ni dejarla "vieja" en medio.
const pushRecent = (list, entry, isSameEntry) => [...list.filter((item) => !isSameEntry(item, entry)), entry];

export const CategoryContext = StudyCategoryContext;
export const CategoryProvider = ({ children, resumeSession = null }) => {
    const [rawCategories, setRawCategories] = useState([]);
    const [categories, setCategories] = useState([]);
    const [categoryTotals, setCategoryTotals] = useState({});
    const [areCategoryTotalsLoading, setAreCategoryTotalsLoading] = useState(false);
    const [currentCategory, setCurrentCategory] = useState(null);
    const [recentlyFinishedDecks, setRecentlyFinishedDecks] = useState(readRecentlyFinishedDecks);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingStage, setLoadingStage] = useState('loading_categories');
    const clearedInvalidPreferencesRef = useRef(false);
    const { isAuthenticated, user, updateCatalogPreferences } = useAuth();
    const { studyLanguage = 'en' } = useUIContext();
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);

    useEffect(() => {
        if (!isAuthenticated) {
            setIsLoading(false);
            setAreCategoryTotalsLoading(false);
            setLoadingStage(null);
            setRawCategories([]);
            setCategories([]);
            return;
        }

        const load = async () => {
            setIsLoading(true);
            setLoadingStage('loading_categories');
            try {
                const preloaded = await consumeCategoryPreload(
                    user?.email,
                    resumeSession,
                    studyLanguage,
                );
                if (
                    preloaded?.courseDirection === courseDirection
                    && preloaded?.categories?.length
                ) {
                    setRawCategories(preloaded.categories);
                    setCategoryTotals(preloaded.categoryTotals ?? {});
                    setAreCategoryTotalsLoading(
                        preloaded.categories.some((category) => preloaded.categoryTotals?.[category] == null),
                    );
                    return;
                }

                const result = await flashcardPort.fetchCategories(courseDirection);
                const { names, totals } = parseCategoriesResponse(result);
                const nextCategories = names.length > 0 ? names : [...FALLBACK_CATEGORIES];
                setRawCategories(nextCategories);
                setCategoryTotals(totals);
                setAreCategoryTotalsLoading(
                    nextCategories.some((category) => totals?.[category] == null),
                );
            } catch {
                console.error('No se pudieron cargar las categorías. Usando fallback local.');
                setRawCategories([...FALLBACK_CATEGORIES]);
                setCategoryTotals({});
                setAreCategoryTotalsLoading(false);
            } finally {
                setLoadingStage(null);
                setIsLoading(false);
            }
        };

        load();
    }, [courseDirection, isAuthenticated, resumeSession, studyLanguage, user?.email]);

    useEffect(() => {
        if (rawCategories.length === 0) return;

        const getValidCatalogPreferences = (availableCategories) => {
            const preferences = user?.catalog_preferences;
            const isCurrent = isCatalogPreferencesCurrent(preferences);
            const isLegacyAlphabetical = hasLegacyAlphabeticalCategoryOrder(preferences, availableCategories);

            if (isCurrent && !isLegacyAlphabetical) {
                return user?.catalog_preferences;
            }

            if (preferences && !clearedInvalidPreferencesRef.current) {
                clearedInvalidPreferencesRef.current = true;
                void updateCatalogPreferences(null);
            }
            return null;
        };

        const preferences = getValidCatalogPreferences(rawCategories);
        const sorted = sortCategories(
            rawCategories,
            getCategoryOrderPreference(user?.email, rawCategories, preferences),
        );

        setCategories(sorted);

        // Update currentCategory if it's not set or not valid anymore
        setCurrentCategory((prev) => {
            if (prev && sorted.includes(prev)) return prev;
            if (resumeSession?.category && sorted.includes(resumeSession.category)) {
                return resumeSession.category;
            }
            return resolvePersistedChoice(LAST_CATEGORY_KEY, sorted, sorted[0] ?? null);
        });
    }, [rawCategories, user?.catalog_preferences, user?.email, resumeSession, updateCatalogPreferences]);

    useEffect(() => {
        clearedInvalidPreferencesRef.current = false;
    }, [user?.email]);

    const changeCategory = useCallback((cat) => {
        markUserNavigation();
        setCurrentCategory(cat);
        localStorage.setItem(LAST_CATEGORY_KEY, cat);
    }, []);

    const markDeckFinished = useCallback((cat, deckName) => {
        if (!cat || !deckName) return;
        setRecentlyFinishedDecks((prev) => {
            const next = pushRecent(
                prev,
                { category: cat, deck: deckName },
                (a, b) => a.category === b.category && a.deck === b.deck,
            );
            localStorage.setItem(RECENTLY_FINISHED_DECK_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const moveCategory = useCallback((fromIndex, toIndex) => {
        console.log(`[CategoryContext] 🔄 Moviendo categoría en memoria de índice ${fromIndex} a ${toIndex}`);
        let next;
        setCategories((previous) => {
            next = moveOrderedItem(previous, fromIndex, toIndex);
            console.log('[CategoryContext] ➡️ Nuevo orden de categorías en memoria:', next);
            return next;
        });

        setTimeout(() => {
            if (next) {
                console.log('[CategoryContext] 💾 Guardando orden final de categorías en servidor:', next);
                const nextPreferences = saveCategoryOrderPreference(
                    user?.email,
                    next,
                    user?.catalog_preferences,
                );
                console.log('[CategoryContext] ➡️ Preferencias de catálogo actualizadas a enviar:', nextPreferences);
                void updateCatalogPreferences(nextPreferences);
            }
        }, 0);
    }, [updateCatalogPreferences, user?.catalog_preferences, user?.email]);

    return (
        <CategoryContext.Provider value={{
            categories,
            categoryTotals,
            areCategoryTotalsLoading,
            currentCategory,
            changeCategory,
            moveCategory,
            markDeckFinished,
            recentlyFinishedDecks,
            isLoading,
            loadingStage,
        }}
        >
            {children}
        </CategoryContext.Provider>
    );
};

export const useCategoryContext = () => useContext(CategoryContext);
