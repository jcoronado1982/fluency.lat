/**
 * Casos de uso de flashcards (capa de aplicación, lógica pura).
 * Equivalente frontend de `backend/mod_flashcards`.
 * 
 * ============================================================================
 * 📝 GUÍA PARA CAMBIAR O AGREGAR EL ORDENAMIENTO DE CATEGORÍAS Y TEMAS (DECKS)
 * ============================================================================
 * 
 * Para que un tema/módulo mantenga un orden personalizado en la interfaz, debes:
 * 
 * 1️⃣ ACTUALIZAR EL ORDEN EN EL FRONTEND (`contracts/deckOrder.js`):
 *    - Ese archivo (no este) es el dueño de `sortDeckNames`, `getLevelFromDeckName`,
 *      `getDeckCategoryName` y las tablas `XXX_DECK_ORDER` — es lógica pura sin i18n,
 *      compartida con `dashboard` (recomendaciones del home), re-exportada aquí para
 *      los consumidores internos de flashcards.
 *    - Define una constante de ordenamiento al estilo de `XXX_DECK_ORDER` en ese archivo
 *      usando los nombres de archivo en minúsculas (ej: 'place_and_time').
 *    - En la función `sortDeckNames()` (al final de `contracts/deckOrder.js`), agrega un bloque
 *      `if (_category === 'tu_categoria')` que mapee el orden con tu constante.
 * 
 * 2️⃣ ACTUALIZAR EL ORDEN EN LOS ARCHIVOS DE CONFIGURACIÓN JSON DEL CLIENTE:
 *    - Modifica los nombres reales formateados con sus `"order"` numéricos en:
 *      - `client/src/contracts/catalogOrder.json`
 *      - `client/src/modules/flashcards/config/catalogOrder.json`
 * 
 * 3️⃣ ACTUALIZAR EL ORDEN EN LA BASE DE DATOS Y EN EL PROCESO ETL:
 *    - Agrega los correspondientes bloques `WHEN` en las consultas `ORDER BY` con `CASE` en:
 *      - `exportar_fase3.py` (ETL)
 *      - `etl_ui.py` (Panel de administración Flask)
 * ============================================================================
 */

import { LANDING_DEMO_CATEGORY } from '../../../contracts/landingDemoNamespace.js';
import { getFlashcardTranslations } from '../config/translations.js';
import {
    getLevelFromDeckName,
    getDeckCategoryName,
    sortDeckNames,
    formatDeckCategoryName as formatDeckCategoryNamePure,
} from '../../../contracts/deckOrder.js';

export { getLevelFromDeckName, getDeckCategoryName, sortDeckNames } from '../../../contracts/deckOrder.js';

export const NESTED_LEVEL_CATEGORIES = [
    'verbs',
    'nouns',
    'adjectives',
    'adverbs',
    'connectors',
    'determinant',
    'phrasal_verbs',
    'preposition',
    'pronouns',
];

const isAppStudyCategory = (name) => name && name !== LANDING_DEMO_CATEGORY;
export const usesNestedLevelDecks = (category) => NESTED_LEVEL_CATEGORIES.includes(category);
export { getCourseDirectionFromStudyLanguage } from '../../../contracts/courseDirection.js';

const normalizeDefinitions = (defs) =>
    (defs || []).map((def) => ({ ...def, imagePath: def.imagePath ?? null }));

export const normalizeCard = (card, index) => {
    const base = { ...card, ...(card.extra || {}) };

    const normalized = {
        ...base,
        id: index,
        definitions: normalizeDefinitions(base.definitions),
        learned: base.learned || false,
    };

    if (normalized.irregular) {
        const irregular = { ...normalized.irregular };
        ['past', 'participle'].forEach((form) => {
            if (irregular[form]) {
                const defs = irregular[form].definitions || (irregular[form].usage_example ? [{
                    usage_example: irregular[form].usage_example,
                    usage_example_es: irregular[form].usage_example_es,
                    pronunciation_guide_es: irregular[form].pronunciation_guide_es,
                    meaning: irregular[form].meaning,
                }] : []);
                irregular[form] = { ...irregular[form], definitions: normalizeDefinitions(defs) };
            }
        });
        normalized.irregular = irregular;
    }

    return normalized;
};

export const normalizeDeckResponse = (data) => {
    const rawCards = Array.isArray(data) ? data : (data.flashcards || [data]);
    return rawCards.map(normalizeCard);
};

/** Wrapper con i18n de flashcards sobre la versión pura de `contracts/deckOrder.js`. */
export const formatDeckCategoryName = (deckName, language = 'en') =>
    formatDeckCategoryNamePure(deckName, getFlashcardTranslations(language)?.categorySelector?.groups);

export const filterUnlearned = (cards, selectedGroup = null) => {
    let scoped = cards;
    if (selectedGroup) {
        scoped = scoped.filter((c) => c.group_name === selectedGroup);
    }
    return scoped.filter((c) => !c.learned);
};

export const parseCategoriesResponse = (result) => {
    const items = Array.isArray(result)
        ? result
        : (result?.success && Array.isArray(result.categories) ? result.categories : []);

    const names = items
        .map((c) => (typeof c === 'object' ? c?.name : c))
        .filter((name) => isAppStudyCategory(name));
    const totals = {};
    items.forEach((c) => {
        if (c && typeof c === 'object' && c.name && isAppStudyCategory(c.name)) {
            totals[c.name] = c.total;
        }
    });

    return { names, totals };
};

export const resolvePersistedChoice = (storageKey, options, fallback) => {
    const saved = localStorage.getItem(storageKey);
    if (saved && options.includes(saved)) return saved;
    return fallback;
};
