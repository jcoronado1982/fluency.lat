import { describe, expect, it, vi } from 'vitest';

// `imageCompressionService` importa `heic2any`, que accede a `Worker` al cargar el módulo
// (no disponible en jsdom). No es parte del wiring de ports/adapters que este test verifica,
// así que se mockea solo para poder importar `composition.js` en el entorno de test.
vi.mock('./services/imageCompressionService', () => ({ imageCompressionService: {} }));

const { flashcardPort, srsPort, staticDeckPort, audioPort, imagePort } = await import('./composition');

// Fija el wiring del composition root de flashcards: cada puerto expuesto a
// useCases/hooks debe ser el contrato congelado, no un adapter mutable.
describe('flashcards composition root', () => {
    it('exposes a frozen flashcardPort with the expected contract', () => {
        expect(Object.isFrozen(flashcardPort)).toBe(true);
        for (const method of [
            'fetchCategories',
            'fetchDecksForCategory',
            'fetchDeckSummaries',
            'fetchDeckData',
            'updateCardStatus',
            'updateCardsBatch',
            'resetDeckStatus',
            'resetCategoryStatus',
            'fetchLearningStats',
            'fetchPhonicsData',
        ]) {
            expect(typeof flashcardPort[method]).toBe('function');
        }
    });

    it('exposes a frozen srsPort', () => {
        expect(Object.isFrozen(srsPort)).toBe(true);
        expect(typeof srsPort.fetchDueCards).toBe('function');
    });

    it('exposes frozen shared media ports (audio/image) and the static deck port', () => {
        expect(Object.isFrozen(staticDeckPort)).toBe(true);
        expect(Object.isFrozen(audioPort)).toBe(true);
        expect(Object.isFrozen(imagePort)).toBe(true);
    });
});
