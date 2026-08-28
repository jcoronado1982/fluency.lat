import { describe, expect, it } from 'vitest';
import { FALLBACK_CATEGORIES, getNextStudyStep, sinkRecentCategory, sortCategories } from './catalogOrder';

describe('sinkRecentCategory', () => {
    it('moves the recently finished category to the end, keeping the rest in order', () => {
        const result = sinkRecentCategory(['verbs', 'nouns', 'adjectives', 'adverbs'], 'verbs');
        expect(result).toEqual(['nouns', 'adjectives', 'adverbs', 'verbs']);
    });

    it('keeps already-completed categories after the recently finished one', () => {
        const result = sinkRecentCategory(
            ['verbs', 'nouns', 'adjectives', 'adverbs'],
            'verbs',
            ['adjectives'],
        );
        expect(result).toEqual(['nouns', 'adverbs', 'verbs', 'adjectives']);
    });

    it('is a no-op when there is no recently finished category', () => {
        const result = sinkRecentCategory(['verbs', 'nouns', 'adjectives'], null);
        expect(result).toEqual(['verbs', 'nouns', 'adjectives']);
    });

    it('leaves the list untouched when the recent category is not in the list', () => {
        const result = sinkRecentCategory(['verbs', 'nouns'], 'pronouns');
        expect(result).toEqual(['verbs', 'nouns']);
    });

    it('sinks several recently studied categories, keeping the studied order (newest last)', () => {
        const result = sinkRecentCategory(
            ['verbs', 'nouns', 'adjectives', 'adverbs'],
            ['verbs', 'nouns'],
        );
        expect(result).toEqual(['adjectives', 'adverbs', 'verbs', 'nouns']);
    });

    it('does not let an earlier-studied category float back up once a newer one is studied', () => {
        // Regression: studying verbs, then nouns, then adjectives used to only keep the LAST
        // one (adjectives) sunk — verbs and nouns would "come back up" to their normal spot.
        const result = sinkRecentCategory(
            ['verbs', 'nouns', 'adjectives', 'adverbs'],
            ['verbs', 'nouns', 'adjectives'],
        );
        expect(result).toEqual(['adverbs', 'verbs', 'nouns', 'adjectives']);
    });

    it('ignores duplicate entries in the recent list without breaking order', () => {
        const result = sinkRecentCategory(
            ['verbs', 'nouns', 'adjectives'],
            ['verbs', 'nouns', 'verbs'],
        );
        expect(result).toEqual(['adjectives', 'verbs', 'nouns']);
    });
});

describe('sortCategories', () => {
    // El usuario pidió explícitamente que la categoría de nivel superior NO se hunda al
    // estudiarla (a diferencia de los mazos dentro de ella, ver sinkRecentCategory arriba):
    // debe quedarse donde la ordena el catálogo o donde el usuario la arrastró.
    it('keeps the catalog/preference order regardless of what was recently studied', () => {
        const sorted = sortCategories(['nouns', 'verbs', 'adjectives'], []);
        expect(sorted).toEqual(['verbs', 'nouns', 'adjectives']);
    });

    it('respects a user-dragged preferred order', () => {
        const sorted = sortCategories(['verbs', 'nouns', 'adjectives'], ['adjectives', 'verbs', 'nouns']);
        expect(sorted).toEqual(['adjectives', 'verbs', 'nouns']);
    });
});

describe('getNextStudyStep — nested-level categories (nouns/verbs/adjectives/…)', () => {
    // Regresión (reporte real de usuario, ago 2026): `catalogOrder.json` modela los "decks" de
    // una categoría anidada como sus 3 niveles, no como los mazos reales `<nivel>/<tema>` que
    // usa la app — sin `nestedDeckNames`, `deckIndex` siempre daba -1 y la función saltaba
    // directo a OTRA categoría al terminar cualquier mazo anidado (nivel intermedio o avanzado
    // incluido), aterrizando en básico si esa categoría nunca se había estudiado. Con
    // `nestedDeckNames` (la lista real, ya ordenada nivel→tema) debe avanzar primero DENTRO de
    // la misma categoría.
    const nestedDeckNames = [
        '1-basic/time', '1-basic/people', '1-basic/family',
        '2-intermediate/classification', '2-intermediate/location',
        '3-advanced/calendar', '3-advanced/economy',
    ];

    it('advances to the next topic within the SAME level, not to another category', () => {
        const result = getNextStudyStep('nouns', '1-basic/time', null, { nestedDeckNames });
        expect(result).toEqual({ type: 'deck', category: 'nouns', deck: '1-basic/people', group: null });
    });

    it('advances from the last topic of a level into the next level, same category', () => {
        const result = getNextStudyStep('nouns', '1-basic/family', null, { nestedDeckNames });
        expect(result).toEqual({ type: 'deck', category: 'nouns', deck: '2-intermediate/classification', group: null });
    });

    it('advances from intermediate into advanced, same category (the reported bug: this used to jump categories and could land on basic)', () => {
        const result = getNextStudyStep('nouns', '2-intermediate/location', null, { nestedDeckNames });
        expect(result).toEqual({ type: 'deck', category: 'nouns', deck: '3-advanced/calendar', group: null });
    });

    it('only jumps to another category after the LAST deck of the LAST level', () => {
        const result = getNextStudyStep('nouns', '3-advanced/economy', null, { nestedDeckNames });
        expect(result?.type).toBe('category');
        expect(result?.category).not.toBe('nouns');
        expect(FALLBACK_CATEGORIES).toContain(result?.category);
    });

    it('without nestedDeckNames (caller not updated), falls back to the previous category-jump behavior', () => {
        const result = getNextStudyStep('nouns', '1-basic/time', null, {});
        expect(result?.type).toBe('category');
    });
});
