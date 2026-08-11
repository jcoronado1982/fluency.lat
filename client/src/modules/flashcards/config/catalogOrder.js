import catalogOrder from '../../../contracts/catalogOrder.json';
import { applyPreferenceOrder } from './catalogPreferences';

const categoryEntries = Array.isArray(catalogOrder.categories) ? catalogOrder.categories : [];

const categoryOrderMap = new Map(
    categoryEntries.map(({ name, order }) => [name, order]),
);

const groupOrderMap = new Map(
    categoryEntries.map(({ name, decks }) => {
        const deckMap = new Map(
            Object.entries(decks || {}).map(([deckName, groups]) => [
                deckName,
                new Map((groups || []).map(({ name: groupName, order }) => [groupName, order])),
            ]),
        );
        return [name, deckMap];
    }),
);

const sortByOrder = (items, getOrder) =>
    [...items].sort((a, b) => {
        const aOrder = getOrder(a);
        const bOrder = getOrder(b);
        const aKnown = Number.isFinite(aOrder);
        const bKnown = Number.isFinite(bOrder);

        if (aKnown && bKnown) return aOrder - bOrder;
        if (aKnown) return -1;
        if (bKnown) return 1;
        return 0;
    });

const partitionCompletedGroups = (groups, completedGroups = []) => {
    const completedSet = new Set((Array.isArray(completedGroups) ? completedGroups : []).filter(Boolean));
    const incomplete = [];
    const completed = [];

    (Array.isArray(groups) ? groups : []).forEach((group) => {
        if (completedSet.has(group)) {
            completed.push(group);
        } else {
            incomplete.push(group);
        }
    });

    return [...incomplete, ...completed];
};

export const FALLBACK_CATEGORIES = sortByOrder(
    categoryEntries.map(({ name }) => name),
    (name) => categoryOrderMap.get(name),
);

/**
 * Hunde las categorías recién estudiadas (`recentCategory`, una o varias — acepta string o
 * array) hacia el final del listado, dejando arriba las que el usuario todavía no toca (fácil
 * elegir la siguiente al terminar un mazo) y reservando el fondo para categorías ya completas
 * (`completedCategories`, cuando se conozca ese dato). Si se pasan varias, se conserva el orden
 * en que llegaron (la más reciente queda más abajo, justo antes de las completas) — así una
 * segunda o tercera categoría estudiada en la misma sesión no "sube" de vuelta solo porque ya
 * no es la última. No reordena nada más.
 */
export const sinkRecentCategory = (categories, recentCategory = null, completedCategories = []) => {
    const completedSet = new Set((Array.isArray(completedCategories) ? completedCategories : []).filter(Boolean));
    const recentList = Array.isArray(recentCategory) ? recentCategory : (recentCategory ? [recentCategory] : []);
    const recentSet = new Set(recentList.filter(Boolean));
    const incomplete = [];
    const completed = [];

    (Array.isArray(categories) ? categories : []).forEach((category) => {
        if (completedSet.has(category)) {
            completed.push(category);
            return;
        }
        if (recentSet.has(category)) {
            return;
        }
        incomplete.push(category);
    });

    const recentEntries = [];
    const seenRecent = new Set();
    recentList.forEach((category) => {
        if (!category || completedSet.has(category) || !categories.includes(category)) return;
        if (seenRecent.has(category)) return;
        seenRecent.add(category);
        recentEntries.push(category);
    });

    return [...incomplete, ...recentEntries, ...completed];
};

// La categoría de nivel superior NO se hunde por haberla estudiado (a diferencia de los mazos,
// ver `sinkRecentCategory` más abajo): el usuario pidió explícitamente que se quede donde la
// ordena el catálogo o donde él mismo la arrastró (`preferredOrder`), sin moverse sola.
export const sortCategories = (categories, preferredOrder = []) =>
    applyPreferenceOrder(
        sortByOrder(categories, (name) => categoryOrderMap.get(name)),
        preferredOrder,
    );

export const sortGroups = (categoryName, deckName, groups, preferredOrder = [], completedGroups = []) => {
    const deckMap = groupOrderMap.get(categoryName);
    const orderMap = deckMap?.get(deckName);

    const baseGroups = orderMap
        ? sortByOrder(groups, (groupName) => orderMap.get(groupName))
        : [...groups];

    return partitionCompletedGroups(applyPreferenceOrder(baseGroups, preferredOrder), completedGroups);
};

export const getNextStudyStep = (
    categoryName,
    deckName,
    groupName,
    { categoryOrder = [], groupOrder = [], completedGroups = [] } = {},
) => {
    const completedSet = new Set((Array.isArray(completedGroups) ? completedGroups : []).filter(Boolean));
    const orderedCategories = applyPreferenceOrder(
        FALLBACK_CATEGORIES,
        categoryOrder,
    );
    const categoryIndex = orderedCategories.indexOf(categoryName);
    if (categoryIndex === -1) return null;

    const categoryEntry = categoryEntries.find(({ name }) => name === categoryName);
    if (!categoryEntry) return null;
    const deckNames = Object.keys(categoryEntry.decks || {});
    const deckIndex = deckNames.indexOf(deckName);

    if (deckIndex !== -1 && groupName) {
        const groups = (categoryEntry.decks?.[deckName] || []).map((group) => group.name);
        const orderedGroups = sortGroups(categoryName, deckName, groups, groupOrder, completedGroups);
        if (completedSet.has(groupName)) {
            const nextActiveGroup = orderedGroups.find((group) => !completedSet.has(group));
            if (nextActiveGroup) {
                return {
                    type: 'group',
                    category: categoryName,
                    deck: deckName,
                    group: nextActiveGroup,
                };
            }
        }
        const groupIndex = orderedGroups.indexOf(groupName);
        if (groupIndex !== -1 && groupIndex + 1 < orderedGroups.length) {
            return {
                type: 'group',
                category: categoryName,
                deck: deckName,
                group: orderedGroups[groupIndex + 1],
            };
        }
    }

    if (deckIndex !== -1 && deckIndex + 1 < deckNames.length) {
        return {
            type: 'deck',
            category: categoryName,
            deck: deckNames[deckIndex + 1],
            group: null,
        };
    }

    if (categoryIndex + 1 < orderedCategories.length) {
        const nextCategory = categoryEntries.find(({ name }) => name === orderedCategories[categoryIndex + 1]);
        if (!nextCategory) return null;
        const nextDeck = Object.keys(nextCategory.decks || {})[0] || null;
        return {
            type: 'category',
            category: nextCategory.name,
            deck: nextDeck,
            group: null,
        };
    }

    return null;
};
