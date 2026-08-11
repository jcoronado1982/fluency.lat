import catalogOrder from '../../../contracts/catalogOrder.json' with { type: 'json' };
import { sortDeckNames, formatDeckCategoryName as formatDeckCategoryNamePure } from '../../../contracts/deckOrder.js';
import { DECK_GROUP_TRANSLATIONS_ES } from '../../../contracts/deckGroupTranslations.js';

/**
 * Etiqueta traducida de categoría/grupo de un deck (contrato puro + traducciones ES
 * compartidas, ver client/CLAUDE.md §9 deuda #6 — ya no importa nada de `flashcards`).
 */
const formatDeckCategoryName = (deckName, language = 'en') =>
    formatDeckCategoryNamePure(deckName, language === 'es' ? DECK_GROUP_TRANSLATIONS_ES : null);

export const LEVELS = [
    { id: 'A1', min: 0, max: 700, wordsMin: 500, wordsMax: 700, premium: false },
    { id: 'A2', min: 700, max: 1200, wordsMin: 1000, wordsMax: 1200, premium: false },
    { id: 'B1', min: 1200, max: 2500, wordsMin: 2000, wordsMax: 2500, premium: false },
    { id: 'B2', min: 2500, max: 5000, wordsMin: 4000, wordsMax: 5000, premium: true },
];

/** Free learning path ends at B1. */
export const FREE_PATH_TARGET = 2500;
export const B2_TARGET = 5000;
export const XP_PER_WORD = 8;
export const STREAK_XP_REWARD = 10;
export const SECONDS_PER_CARD = 30;
const CATALOG_CATEGORIES = Array.isArray(catalogOrder.categories) ? catalogOrder.categories : [];
const LEVEL_TO_DECK_KEY = {
    A1: '1-basic',
    A2: '2-intermediate',
    B1: '3-advanced',
    B2: '3-advanced',
};
const QUICK_ACCESS_ACCENTS = ['#f472b6', '#fb923c', '#be185d'];
const DECK_LABEL_TRANSLATIONS_ES = {
    General: 'General',
    'Being & State': 'Ser y Estado',
    'Action & Movement': 'Accion y Movimiento',
    'Daily Life': 'Vida Diaria',
    Communication: 'Comunicacion',
    'Change & Result': 'Cambio y Resultado',
    'Mind & Senses': 'Mente y Sentidos',
    'Social & Exchange': 'Social e Intercambio',
    'Handling & Creating': 'Manejo y Creacion',
    'Daily Routine': 'Rutina Diaria',
    'Building & Creating': 'Construccion y Creacion',
    'Managing & Control': 'Gestion y Control',
    'Thinking & Deciding': 'Pensamiento y Decision',
    'Daily Tasks': 'Tareas Diarias',
    'Feelings & Reactions': 'Sentimientos y Reacciones',
    'Body & Movement': 'Cuerpo y Movimiento',
    'Social & Daily Life': 'Vida Social y Diaria',
    'Academic Communication': 'Comunicacion Academica',
    'Age & Novelty': 'Edad y Novedad',
    Animals: 'Animales',
    'Arts & Media': 'Arte y Medios',
    'Body Parts': 'Partes del Cuerpo',
    Clothing: 'Ropa',
    Colors: 'Colores',
    'Critical Thinking': 'Pensamiento Critico',
    Directions: 'Direcciones',
    Family: 'Familia',
    Feelings: 'Sentimientos',
    'Feelings & Emotions': 'Sentimientos y Emociones',
    Food: 'Comida',
    'General Concepts': 'Conceptos Generales',
    'Goals & Results': 'Metas y Resultados',
    'Government & Society': 'Gobierno y Sociedad',
    'Health & Medicine': 'Salud y Medicina',
    'Health & Well-being': 'Salud y Bienestar',
    Household: 'Hogar',
    'Interrogative/Relative': 'Interrogativos / Relativos',
    'Mind & Attitude': 'Mente y Actitud',
    Months: 'Meses',
    Nature: 'Naturaleza',
    'Nature & Environment': 'Naturaleza y Medio Ambiente',
    Numbers: 'Numeros',
    Object: 'Objetos',
    People: 'Personas',
    'Personality & Social': 'Personalidad y Social',
    'Personality Traits': 'Rasgos de Personalidad',
    'Physical & Sensory': 'Fisico y Sensorial',
    'Physical State': 'Estado Fisico',
    Places: 'Lugares',
    'Places & Locations': 'Lugares y Ubicaciones',
    'Professional Action': 'Accion Profesional',
    'Professional & Business': 'Profesional y Negocios',
    'Quality & Value': 'Calidad y Valor',
    'School & Work': 'Escuela y Trabajo',
    'Science & Biology': 'Ciencia y Biologia',
    Seasons: 'Estaciones',
    'Size & Dimension': 'Tamano y Dimension',
    'Social Dynamics': 'Dinamicas Sociales',
    'Social & Status': 'Social y Estatus',
    Society: 'Sociedad',
    'Speed & Time': 'Velocidad y Tiempo',
    'State & Fortune': 'Estado y Fortuna',
    Subject: 'Sujeto',
    'Technology & Internet': 'Tecnologia e Internet',
    Time: 'Tiempo',
    Transportation: 'Transporte',
    'Transportation & Travel': 'Transporte y Viajes',
    'Value & Wealth': 'Valor y Riqueza',
};

export function formatWordsRange(level, language = 'en') {
    const locale = language === 'es' ? 'es' : 'en';
    const fmt = (n) => n.toLocaleString(locale);
    return `${fmt(level.wordsMin)} – ${fmt(level.wordsMax)}`;
}

export function computeXp(masteredCount = 0) {
    return masteredCount * XP_PER_WORD;
}

export function computeLevelProgress(masteredCount = 0, language = 'en') {
    const count = Math.max(0, masteredCount);
    const current = LEVELS.find((level) => count < level.max) || LEVELS[LEVELS.length - 1];
    const currentIndex = LEVELS.indexOf(current);
    const span = current.max - current.min;
    const inLevel = count - current.min;
    const levelPercent = span > 0 ? Math.min(100, Math.round((inLevel / span) * 100)) : 100;
    const next = LEVELS[currentIndex + 1] || null;

    const wordsToNext = next && !next.premium
        ? Math.max(0, next.wordsMin - count)
        : next?.premium
            ? Math.max(0, next.wordsMin - count)
            : 0;

    return {
        levels: LEVELS,
        current,
        currentLevel: current.id,
        nextLevel: next?.id || null,
        next,
        levelPercent,
        wordsInLevel: inLevel,
        wordsToNext,
        wordsRequiredRange: formatWordsRange(current, language),
        nextWordsRequiredRange: next ? formatWordsRange(next, language) : null,
        isNextPremium: Boolean(next?.premium),
        isMaxFreeLevel: current.id === 'B1' && count >= current.max,
        isMaxLevel: count >= LEVELS[LEVELS.length - 1].max,
        targetForLevel: current.max,
    };
}

/**
 * Calcula el progreso del nivel actual. Usa dos fuentes de verdad:
 * - `stats.levels[]`: progreso acumulado de palabras/XP (backend).
 * - `stats.decks_progress`: tarjetas reales totales por nivel (suma por prefix).
 *
 * En el dashboard el mini-stat muestra: "tarjetas aprendidas / tarjetas totales
 * del nivel" (ej. "450 / 2300"), NO "palabras hasta el siguiente nivel".
 */
export function computeDashboardLevelProgress(stats, language = 'en') {
    const backendLevels = Array.isArray(stats?.levels) ? stats.levels : [];
    if (backendLevels.length === 0) {
        return computeLevelProgress(stats?.mastered_count ?? 0, language);
    }

    const levels = backendLevels.map((level, index) => {
        const targetCount = Math.max(0, level.target_count ?? 0);
        const cumulativeTarget = Math.max(0, level.cumulative_target ?? 0);
        const min = Math.max(0, cumulativeTarget - targetCount);
        return {
            id: level.level,
            min,
            max: cumulativeTarget,
            wordsMin: index === 0 ? 0 : min,
            wordsMax: cumulativeTarget,
            masteredCount: Math.max(0, level.mastered_count ?? 0),
            targetCount,
            cumulativeMastered: Math.max(0, level.cumulative_mastered ?? 0),
            cumulativeTarget,
            completed: Boolean(level.completed),
            premium: Boolean(level.premium),
        };
    });

    const current = levels.find((level) => level.id === stats?.current_level)
        || levels.find((level) => !level.completed)
        || levels[levels.length - 1];
    const currentIndex = levels.indexOf(current);
    const next = levels[currentIndex + 1] || null;
    const levelPercent = Number.isFinite(stats?.level_percent)
        ? Math.max(0, Math.min(100, Math.round(stats.level_percent)))
        : current.targetCount > 0
            ? Math.max(0, Math.min(100, Math.round((current.masteredCount / current.targetCount) * 100)))
            : current.completed
                ? 100
                : 0;

    // Total de tarjetas REALES en el nivel actual (suma de decks_progress
    // que pertenecen a este nivel). Ej. A1 = suma de "1-basic/*".
    const levelPrefix = getLevelDeckPrefix(current.id);
    const decksList = Array.isArray(stats?.decks_progress) ? stats.decks_progress : [];
    const matchedDecks = decksList.filter((dp) => {
        // Matchear tanto "1-basic/..." como "1-basic.json"
        const normalized = (dp.deck || '').toLowerCase();
        return normalized.startsWith(levelPrefix.toLowerCase());
    });
    const totalCardsInLevel = matchedDecks.length > 0
        ? matchedDecks.reduce((sum, dp) => sum + (dp.total_count ?? 0), 0)
        : current.targetCount; // Fallback si no hay decks_progress o no matcheó

    // DEBUG: si el número es sospechosamente bajo (el fallback 1237), loguear.
    if (totalCardsInLevel === current.targetCount && matchedDecks.length === 0) {
        console.warn(
            `[dashboardProgress] level ${current.id}: decks_progress vacío o no matcheó prefix "${levelPrefix}".`,
            'matchedDecks:', matchedDecks.length, 'fallback:', current.targetCount,
        );
    }

    return {
        levels,
        current,
        currentLevel: current.id,
        nextLevel: next?.id || null,
        next,
        levelPercent,
        wordsInLevel: current.masteredCount,
        wordsToNext: Math.max(0, current.targetCount - current.masteredCount),
        wordsRequiredRange: formatWordsRange(current, language),
        nextWordsRequiredRange: next ? formatWordsRange(next, language) : null,
        isNextPremium: Boolean(next?.premium),
        isMaxFreeLevel: current.id === 'B1' && current.completed,
        isMaxLevel: Boolean(current.completed && !next),
        // Número TOTAL de tarjetas en el nivel, no target de palabras.
        targetForLevel: totalCardsInLevel,
    };
}

function getLevelDeckPrefix(levelId) {
    switch (levelId) {
        case 'A1':
            return '1-basic/';
        case 'A2':
            return '2-intermediate/';
        case 'B1':
        case 'B2':
            return '3-advanced/';
        default:
            return '1-basic/';
    }
}

export function estimateMinutesRemaining(cardsRemaining = 0) {
    if (cardsRemaining <= 0) return 0;
    return Math.max(1, Math.ceil((cardsRemaining * SECONDS_PER_CARD) / 60));
}

export function formatCategoryLabel(category, language = 'en') {
    if (!category) return '';
    const lower = category.toLowerCase();
    const es = {
        verbs: 'Verbos',
        nouns: 'Sustantivos',
        pronouns: 'Pronombres',
        adjectives: 'Adjetivos',
        adverbs: 'Adverbios',
        preposition: 'Preposiciones',
        connectors: 'Conectores',
        determinant: 'Determinantes',
        phrasal_verbs: 'Verbos frasales',
    };
    if (language === 'es' && es[lower]) return es[lower];
    return lower.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDeckLabel(deckName, language = 'en') {
  if (!deckName) return '';
  if (language !== 'es') return deckName;
  const phrasalPrefix = 'Phrasal Verbs: ';
  if (deckName.startsWith(phrasalPrefix)) {
        return `Verbos frasales: ${deckName.slice(phrasalPrefix.length)}`;
  }
    return DECK_LABEL_TRANSLATIONS_ES[deckName] || deckName;
}

export function getTimeGreeting(language, name) {
    const hour = new Date().getHours();
    const copy = {
        en: {
            morning: 'Good morning',
            afternoon: 'Good afternoon',
            evening: 'Good evening',
        },
        es: {
            morning: 'Buenos días',
            afternoon: 'Buenas tardes',
            evening: 'Buenas noches',
        },
    };
    const t = copy[language === 'es' ? 'es' : 'en'];
    const slot = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const greeting = t[slot];
    return name ? `${greeting}, ${name}` : greeting;
}

export function getStreakMessage(stats, labels) {
    const streak = stats?.streak_days ?? 0;
    const daysSinceLastStudy = stats?.days_since_last_study;

    if (stats?.studied_today && streak > 0) {
        if (streak === 1) return labels.streakConsecutiveDay || labels.streakStudiedToday;
        return (labels.streakConsecutiveDays || labels.streakKeepLearning).replace('{n}', streak.toLocaleString());
    }

    if (stats?.streak_at_risk && streak > 0) {
        if (streak === 1) return labels.streakConsecutiveDay || labels.streakAtRisk;
        return (labels.streakConsecutiveDays || labels.streakAtRisk).replace('{n}', streak.toLocaleString());
    }

    if (Number.isFinite(daysSinceLastStudy) && daysSinceLastStudy > 0) {
        if (daysSinceLastStudy === 1) return labels.streakMissedDay || labels.streakComeBack;
        return (labels.streakMissedDays || labels.streakComeBack).replace('{n}', daysSinceLastStudy.toLocaleString());
    }

    if (streak > 0) return labels.streakComeBack;
    return labels.streakStartShort;
}

function getDeckKeyForLevel(levelId) {
    return LEVEL_TO_DECK_KEY[levelId] || LEVEL_TO_DECK_KEY.A1;
}

function getFirstDeckName(categoryEntry, deckKey) {
    const deckEntries = Array.isArray(categoryEntry?.decks?.[deckKey]) ? categoryEntry.decks[deckKey] : [];
    if (deckEntries[0]?.name) return deckEntries[0].name;
    const fallbackDeckKey = Object.keys(categoryEntry?.decks || {})[0];
    const fallbackDeckEntries = fallbackDeckKey ? categoryEntry.decks?.[fallbackDeckKey] : [];
    return fallbackDeckEntries?.[0]?.name || fallbackDeckKey || null;
}

/**
 * Convierte `stats.decks_progress` (backend) al formato interno de deck
 * usado por las reglas de selección del dashboard.
 */
function mapDecksProgress(decksProgress) {
    return decksProgress.map((dp) => {
        const progressPercent = dp.total_count > 0
            ? (dp.learned_count / dp.total_count) * 100
            : 0;

        let deckLevelId = 'A1';
        if (dp.deck.startsWith('2-intermediate')) {
            deckLevelId = 'A2';
        } else if (dp.deck.startsWith('3-advanced')) {
            deckLevelId = 'B1';
        }

        return {
            category: dp.category,
            deckName: dp.deck,
            learnedCount: dp.learned_count,
            totalCount: dp.total_count,
            progressPercent,
            lastTouched: dp.last_touched ? new Date(dp.last_touched).getTime() : 0,
            firstImagePath: dp.first_image_path || null,
            levelId: deckLevelId,
            normalizedName: dp.deck.replace('.json', '').toLowerCase(),
            normalizedCategory: dp.category.toLowerCase(),
        };
    });
}

/**
 * Devuelve el siguiente mazo pendiente de una categoría a partir de los decks
 * reales del usuario, usando el orden curado de `sortDeckNames` (nivel +
 * orden por categoría). Con `levelPrefix` (ej. '1-basic') restringe al nivel
 * del usuario si esa categoría tiene decks en ese nivel.
 *
 * ─── TRAMPA CONOCIDA (fix Jul 2026) ────────────────────────────────────────
 * NO matchear decks contra `catalogOrder.json`: ese catálogo guarda nombres
 * display ("Subject", "Being & State", "Poss. Adjective") que NUNCA coinciden
 * con los nombres de archivo del backend ("subject_pronouns", "being_state").
 * La versión anterior hacía ese match y las recomendaciones quedaban vacías o
 * sin imagen. La secuencia se deriva SIEMPRE de los decks reales
 * (`stats.decks_progress`, nombres de archivo) ordenados con `sortDeckNames`.
 * Las imágenes de las tarjetas las resuelve `useDeckFirstImages` leyendo el
 * JSON del propio deck (ver ese hook para el detalle completo).
 * ───────────────────────────────────────────────────────────────────────────
 */
function getNextDeckOfCategory(userDecks, categoryName, levelPrefix = null) {
    const normalizedCat = categoryName.toLowerCase();
    let decks = userDecks.filter((d) => d.normalizedCategory === normalizedCat);
    if (decks.length === 0) return null;

    if (levelPrefix) {
        const withLevel = decks.filter((d) => d.normalizedName.startsWith(levelPrefix));
        if (withLevel.length > 0) decks = withLevel;
    }

    const sorted = sortDeckNames(decks.map((d) => d.deckName), normalizedCat);
    const orderedDecks = sorted
        .map((name) => decks.find((deck) => deck.normalizedName === name.toLowerCase()))
        .filter(Boolean);
    return orderedDecks.find((deck) => deck.progressPercent < 100)
        || orderedDecks[0]
        || decks[0];
}

function getDynamicCategoryEntries(userDecks = []) {
    const entries = [...CATALOG_CATEGORIES];
    const known = new Set(entries.map((entry) => entry.name.toLowerCase()));
    for (const deck of userDecks) {
        const name = deck.category;
        if (!name || known.has(name.toLowerCase())) continue;
        known.add(name.toLowerCase());
        entries.push({ name, decks: {} });
    }
    return entries;
}

export function getDashboardQuickAccessItems({
    levelId,
    currentCategory = null,
    currentDeck = null,
    language = 'en',
    limit = 3,
    stats = null,
} = {}) {
    // 1. Gather all candidate decks for the user
    let userDecks = [];
    if (stats && Array.isArray(stats.decks_progress) && stats.decks_progress.length > 0) {
        userDecks = mapDecksProgress(stats.decks_progress);
    } else {
        // Fallback/new user: construct mock deck progress for all decks in the catalog
        for (const catEntry of CATALOG_CATEGORIES) {
            const levelsList = ['1-basic', '2-intermediate', '3-advanced'];
            for (const lvl of levelsList) {
                const levelDecks = catEntry.decks?.[lvl] || [];
                for (const dk of levelDecks) {
                    userDecks.push({
                        category: catEntry.name,
                        deckName: `${lvl}/${dk.name}.json`,
                        learnedCount: 0,
                        totalCount: 10,
                        progressPercent: 0,
                        lastTouched: 0,
                        firstImagePath: null,
                        levelId: lvl === '1-basic' ? 'A1' : lvl === '2-intermediate' ? 'A2' : 'B1',
                        normalizedName: `${lvl}/${dk.name}`.toLowerCase(),
                        normalizedCategory: catEntry.name.toLowerCase()
                    });
                }
            }
        }
    }

    // 2. Identifica el primer mazo todavía incompleto de cada categoría.
    const rule2Candidates = [];
    for (const catEntry of getDynamicCategoryEntries(userDecks)) {
        const match = getNextDeckOfCategory(userDecks, catEntry.name);
        if (match) {
            rule2Candidates.push(match);
        }
    }

    const selected = [];
    const excludeCat = currentCategory ? currentCategory.toLowerCase() : null;
    const excludeDk = currentDeck ? currentDeck.replace('.json', '').toLowerCase() : null;

    const isCurrentActive = (deck) => {
        const normName = deck.normalizedName;
        const normCat = deck.normalizedCategory;
        const isSameDeck = excludeDk && (normName === excludeDk || deck.deckName.toLowerCase().replace('.json', '') === excludeDk);
        const isSameCat = excludeCat && normCat === excludeCat;
        return { isSameDeck, isSameCat };
    };

    const tryAdd = (deck, skipCategoryCheck = false) => {
        if (selected.some(s => s.category === deck.category && s.deckName === deck.deckName)) {
            return false;
        }
        const { isSameDeck, isSameCat } = isCurrentActive(deck);
        if (isSameDeck) return false;
        if (isSameCat && !skipCategoryCheck) return false;
        selected.push(deck);
        return true;
    };

    // Rule 1: Select decks in progress (progress > 0% and < 100%), sorted by last_touched descending (most recent first)
    const inProgress = userDecks.filter(d => d.progressPercent > 0 && d.progressPercent < 100);
    inProgress.sort((a, b) => b.lastTouched - a.lastTouched);

    // --- PASS 1: Exclude both the current deck and the current category ---
    for (const deck of inProgress) {
        if (selected.length >= limit) break;
        tryAdd(deck, false);
    }

    // Rule 2: Complete the remaining slots using Rule 2 Candidates that are NOT completed (progress < 100%)
    if (selected.length < limit) {
        for (const deck of rule2Candidates) {
            if (selected.length >= limit) break;
            if (deck.progressPercent < 100) {
                tryAdd(deck, false);
            }
        }
    }

    // Rule 3: Complete remaining slots using completed Rule 2 Candidates (progress === 100%), in category order
    if (selected.length < limit) {
        for (const deck of rule2Candidates) {
            if (selected.length >= limit) break;
            tryAdd(deck, false);
        }
    }

    // --- PASS 2: Fallback (if we still need items, relax category filter but keep deck filter) ---
    if (selected.length < limit) {
        for (const deck of inProgress) {
            if (selected.length >= limit) break;
            tryAdd(deck, true);
        }
    }

    if (selected.length < limit) {
        for (const deck of rule2Candidates) {
            if (selected.length >= limit) break;
            if (deck.progressPercent < 100) {
                tryAdd(deck, true);
            }
        }
    }

    if (selected.length < limit) {
        for (const deck of rule2Candidates) {
            if (selected.length >= limit) break;
            tryAdd(deck, true);
        }
    }

    // 3. Format final response
    return selected.slice(0, limit).map((item, index) => ({
        category: item.category,
        categoryLabel: formatCategoryLabel(item.category, language),
        deckName: item.deckName,
        // Use the full DECK_LABELS + i18n pipeline so the label shows the
        // clean translated name (e.g. "Sujeto" / "Subject") instead of the
        // raw file path like "1-basic/Subject.json".
        deckLabel: formatDeckCategoryName(item.deckName, language),
        levelId: item.levelId,
        firstImagePath: item.firstImagePath,
        first_image_path: item.firstImagePath,
        accent: QUICK_ACCESS_ACCENTS[index % QUICK_ACCESS_ACCENTS.length],
    }));
}

export function getDashboardCarouselItems({
    levelId,
    currentCategory = null,
    currentSession = null,
    language = 'en',
    stats = null,
} = {}) {
    const deckKey = getDeckKeyForLevel(levelId);
    const statsDecks = Array.isArray(stats?.decks_progress) && stats.decks_progress.length > 0
        ? mapDecksProgress(stats.decks_progress)
        : null;
    const entries = getDynamicCategoryEntries(statsDecks || []);
    const currentIndex = currentCategory ? entries.findIndex((entry) => entry.name === currentCategory) : -1;
    const rotated = currentIndex >= 0
        ? [
            ...entries.slice(currentIndex),
            ...entries.slice(0, currentIndex),
        ]
        : entries;

    const categoryItems = rotated
        .filter((entry) => entry.name !== currentSession?.category)
        .map((entry) => {
            // Con stats reales resolvemos el siguiente mazo pendiente del nivel para
            // obtener su nombre de archivo abrible y la primera imagen pendiente.
            const realDeck = statsDecks
                ? getNextDeckOfCategory(statsDecks, entry.name, deckKey)
                : null;
            const deckName = realDeck?.deckName || getFirstDeckName(entry, deckKey) || '';
            const deckLabel = realDeck
                ? formatDeckCategoryName(realDeck.deckName, language)
                : formatDeckLabel(getFirstDeckName(entry, deckKey), language);

            return {
                key: `category-${entry.name}`,
                category: entry.name,
                categoryLabel: formatCategoryLabel(entry.name, language),
                deckName,
                deckLabel,
                firstImagePath: realDeck?.firstImagePath || null,
                resumeSession: {
                    category: entry.name,
                    deck: deckName,
                },
                cardsRemaining: 0,
                isCurrentGoal: false,
            };
        });

    if (currentSession?.category && currentSession?.deck) {
        const sessionDeck = statsDecks
            ? statsDecks.find((d) => d.normalizedCategory === currentSession.category.toLowerCase()
                && d.normalizedName === String(currentSession.deck).replace('.json', '').toLowerCase())
            : null;
        categoryItems.unshift({
            key: `session-${currentSession.category}-${currentSession.deck}`,
            category: currentSession.category,
            categoryLabel: formatCategoryLabel(currentSession.category, language),
            deckName: currentSession.deck,
            deckLabel: formatDeckLabel(currentSession.deck, language),
            firstImagePath: sessionDeck?.firstImagePath || null,
            resumeSession: currentSession,
            cardsRemaining: currentSession.cardsRemaining ?? 0,
            isCurrentGoal: true,
        });
    }

    return categoryItems;
}

export function isLevelReached(masteredCount, level) {
    return masteredCount >= level.max;
}

export function isLevelActive(masteredCount, level, currentLevelId) {
    return currentLevelId === level.id;
}
