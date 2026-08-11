const CATALOG_ORDER_STORAGE_PREFIX = 'flashcards_catalog_order_v2_';
const CATALOG_ORDER_SCHEMA_VERSION = 2;

const buildStorageKey = (userEmail) => `${CATALOG_ORDER_STORAGE_PREFIX}${userEmail || 'guest'}`;
const buildGroupKey = (categoryName, deckName) => `${categoryName || ''}::${deckName || ''}`;

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const normalizeOrderedItems = (items, preferredOrder = []) => {
    const available = Array.isArray(items) ? items.filter(Boolean) : [];
    const preferred = Array.isArray(preferredOrder) ? preferredOrder.filter(Boolean) : [];
    const availableSet = new Set(available);
    const seen = new Set();
    const ordered = [];

    preferred.forEach((item) => {
        if (!availableSet.has(item) || seen.has(item)) return;
        seen.add(item);
        ordered.push(item);
    });

    available.forEach((item) => {
        if (seen.has(item)) return;
        seen.add(item);
        ordered.push(item);
    });

    return ordered;
};

export const normalizeCatalogPreferences = (preferences) => ({
    categories: Array.isArray(preferences?.categories) ? preferences.categories.filter(Boolean) : [],
    groups: isObject(preferences?.groups) ? preferences.groups : {},
    version: Number.isInteger(preferences?.version) ? preferences.version : null,
    updated_at: preferences?.updated_at ?? null,
});

export const isCatalogPreferencesCurrent = (preferences) => {
    const version = normalizeCatalogPreferences(preferences).version;
    return version === CATALOG_ORDER_SCHEMA_VERSION || version === null;
};

export const isCatalogPreferencesEmpty = (preferences) => {
    const normalized = normalizeCatalogPreferences(preferences);
    return normalized.categories.length === 0 && Object.keys(normalized.groups).length === 0;
};

export const readCatalogPreferencesCache = (userEmail) => {
    try {
        const raw = localStorage.getItem(buildStorageKey(userEmail));
        if (!raw) return null;
        return normalizeCatalogPreferences(JSON.parse(raw));
    } catch {
        return null;
    }
};

export const writeCatalogPreferencesCache = (userEmail, preferences) => {
    const normalized = normalizeCatalogPreferences(preferences);
    if (isCatalogPreferencesEmpty(normalized)) {
        localStorage.removeItem(buildStorageKey(userEmail));
        return;
    }
    localStorage.setItem(buildStorageKey(userEmail), JSON.stringify({
        ...normalized,
        version: CATALOG_ORDER_SCHEMA_VERSION,
    }));
};

export const getEffectiveCatalogPreferences = (userEmail, serverPreferences = null) =>
    isCatalogPreferencesCurrent(serverPreferences)
        ? normalizeCatalogPreferences(serverPreferences)
        : normalizeCatalogPreferences(null);

export const hasLegacyAlphabeticalCategoryOrder = (preferences, categories) => {
    const normalized = normalizeCatalogPreferences(preferences);
    if (normalized.categories.length < 2 || !Array.isArray(categories) || categories.length < 2) {
        return false;
    }

    const available = categories.filter(Boolean);
    const alphabetical = [...available].sort((a, b) => a.localeCompare(b));
    const normalizedOrder = normalizeOrderedItems(available, normalized.categories);
    return normalizedOrder.length === alphabetical.length
        && normalizedOrder.every((category, index) => category === alphabetical[index]);
};

export const moveOrderedItem = (items, fromIndex, toIndex) => {
    if (!Array.isArray(items)) return [];
    if (fromIndex === toIndex) return [...items];
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
        return [...items];
    }

    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
};

export const getCategoryOrderPreference = (userEmail, categories, serverPreferences = null) => {
    const preferences = getEffectiveCatalogPreferences(userEmail, serverPreferences);
    const available = new Set((Array.isArray(categories) ? categories : []).filter(Boolean));
    return preferences.categories.filter((category) => available.has(category));
};

export const saveCategoryOrderPreference = (userEmail, categories, serverPreferences = null) => {
    const preferences = getEffectiveCatalogPreferences(userEmail, serverPreferences);
    const nextPreferences = {
        ...preferences,
        categories: normalizeOrderedItems(categories, categories),
        version: CATALOG_ORDER_SCHEMA_VERSION,
    };
    writeCatalogPreferencesCache(userEmail, nextPreferences);
    return nextPreferences;
};

export const getGroupOrderPreference = (
    userEmail,
    categoryName,
    deckName,
    groups,
    serverPreferences = null,
) => {
    const preferences = getEffectiveCatalogPreferences(userEmail, serverPreferences);
    const groupKey = buildGroupKey(categoryName, deckName);
    const available = new Set((Array.isArray(groups) ? groups : []).filter(Boolean));
    return (preferences.groups[groupKey] || []).filter((group) => available.has(group));
};

export const saveGroupOrderPreference = (
    userEmail,
    categoryName,
    deckName,
    groups,
    serverPreferences = null,
) => {
    const preferences = getEffectiveCatalogPreferences(userEmail, serverPreferences);
    const groupKey = buildGroupKey(categoryName, deckName);
    const nextPreferences = {
        ...preferences,
        groups: {
            ...preferences.groups,
            [groupKey]: normalizeOrderedItems(groups, groups),
        },
        version: CATALOG_ORDER_SCHEMA_VERSION,
    };
    writeCatalogPreferencesCache(userEmail, nextPreferences);
    return nextPreferences;
};

export const applyPreferenceOrder = normalizeOrderedItems;
