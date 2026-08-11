import { describe, expect, it } from 'vitest';
import { sinkRecentCategory, sortCategories } from './catalogOrder';

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
