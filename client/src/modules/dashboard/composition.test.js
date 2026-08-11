import { describe, expect, it } from 'vitest';
import { learningStatsPort, deckPreviewPort, reviewSuggestionPort } from './composition';

// Fija el wiring del composition root del dashboard: cada puerto propio del módulo
// debe quedar congelado y con el contrato esperado, cableado a su propio adapter
// (no al de flashcards — ver deuda #6 de client/CLAUDE.md).
describe('dashboard composition root', () => {
    it('exposes a frozen learningStatsPort', () => {
        expect(Object.isFrozen(learningStatsPort)).toBe(true);
        expect(typeof learningStatsPort.fetchLearningStats).toBe('function');
        expect(typeof learningStatsPort.touchStudyDay).toBe('function');
    });

    it('exposes a frozen deckPreviewPort', () => {
        expect(Object.isFrozen(deckPreviewPort)).toBe(true);
        expect(typeof deckPreviewPort.fetchDeckData).toBe('function');
    });

    it('exposes a frozen reviewSuggestionPort', () => {
        expect(Object.isFrozen(reviewSuggestionPort)).toBe(true);
        expect(typeof reviewSuggestionPort.fetchDueCards).toBe('function');
    });
});
