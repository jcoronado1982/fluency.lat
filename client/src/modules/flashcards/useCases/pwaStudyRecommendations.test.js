import { describe, expect, it } from 'vitest';
import {
    buildPwaStudyRecommendations,
    extractPwaRecommendationImage,
} from './pwaStudyRecommendations';

describe('PWA study recommendations', () => {
    it('prioritizes in-progress decks and excludes the active deck', () => {
        const stats = {
            decks_progress: [
                { category: 'verbs', deck: '1-basic/current', learned_count: 2, total_count: 10 },
                { category: 'nouns', deck: '1-basic/animals', learned_count: 3, total_count: 10, last_touched: '2026-07-17T12:00:00Z' },
                { category: 'adjectives', deck: '1-basic/feelings', learned_count: 0, total_count: 10 },
                { category: 'adverbs', deck: '1-basic/time', learned_count: 10, total_count: 10 },
            ],
        };

        const recommendations = buildPwaStudyRecommendations({
            stats,
            currentCategory: 'verbs',
            currentDeck: '1-basic/current',
            language: 'en',
        });

        expect(recommendations.map((item) => item.category)).toEqual([
            'nouns',
            'adjectives',
            'adverbs',
        ]);
        expect(recommendations[0]).toMatchObject({
            categoryLabel: 'Nouns',
            deckLabel: 'Animals',
            levelId: 'A1',
        });
    });

    it('prioritizes other decks of the SAME active category before diversifying', () => {
        const stats = {
            decks_progress: [
                { category: 'verbs', deck: '1-basic/current', learned_count: 2, total_count: 10 },
                { category: 'verbs', deck: '2-intermediate/irregular', learned_count: 1, total_count: 10, last_touched: '2026-07-01T12:00:00Z' },
                { category: 'nouns', deck: '1-basic/animals', learned_count: 3, total_count: 10, last_touched: '2026-07-17T12:00:00Z' },
                { category: 'adjectives', deck: '1-basic/feelings', learned_count: 0, total_count: 10 },
            ],
        };

        const recommendations = buildPwaStudyRecommendations({
            stats,
            currentCategory: 'verbs',
            currentDeck: '1-basic/current',
            language: 'en',
        });

        expect(recommendations[0]).toMatchObject({ category: 'verbs', deckName: '2-intermediate/irregular' });
        expect(recommendations.map((item) => item.category)).toEqual(['verbs', 'nouns', 'adjectives']);
    });

    it('uses the first pending card image from the real deck response', () => {
        const image = extractPwaRecommendationImage({
            flashcards: [
                { learned: true, definitions: [{ imagePath: '/card_images/learned.avif' }] },
                { learned: false, definitions: [{ image_path: '/card_images/pending.avif' }] },
            ],
        });

        expect(image).toBe('/card_images/pending.avif');
    });
});
