import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import {
    getAudioLang,
    getAudioLangForConjugation,
    getCardTitle,
    getCleanSpanishTerm,
    getDefinitionStudyTerm,
    getMeaningConnector,
    getReferenceExampleText,
    getReferenceMeaning,
    getStudyExampleText,
    isLearningEnglish,
} from './cardLanguageUtils';
import { buildGlobalImageStoragePath, parseCardImageStorageIdentity } from './imageStorageIdentity';
import { clearUiBridgeHandlers, invokeUiBridge, registerUiBridgeHandler, unregisterUiBridgeHandler } from '../uiBridge';

beforeEach(clearUiBridgeHandlers);

describe('card language contract', () => {
    it('keeps study and reference languages consistent', () => {
        const definition = {
            usage_example: 'I sleep here',
            usage_example_es: 'Yo duermo aquí',
            meaning: 'dormir',
            target_meaning_es: 'alojar (a alguien)',
        };
        expect(isLearningEnglish('en')).toBe(true);
        expect(isLearningEnglish('es')).toBe(false);
        expect(getCleanSpanishTerm(' alojar (a alguien) , hospedar  ')).toBe('alojar, hospedar');
        expect(getCardTitle({ name: 'alojar (a alguien)' }, 'es')).toBe('alojar');
        expect(getStudyExampleText(definition, 'en')).toBe('I sleep here');
        expect(getReferenceExampleText(definition, 'en')).toBe('Yo duermo aquí');
        expect(getReferenceMeaning(definition)).toBe('dormir');
        expect(getDefinitionStudyTerm(definition, 'sleep', 'es')).toBe('alojar');
        expect(getDefinitionStudyTerm(definition, 'sleep', 'en')).toBe('sleep');
        expect(getMeaningConnector('en')).toBe('means');
        expect(getMeaningConnector('es')).toBe('significa');
        expect(getAudioLang('en')).toBe('en');
        expect(getAudioLang('es')).toBe('es');
        expect(getAudioLangForConjugation()).toBe('en');
    });

    it('handles absent optional content without throwing', () => {
        expect(getCleanSpanishTerm()).toBe('');
        expect(getCardTitle({}, 'en')).toBe('');
        expect(getStudyExampleText()).toBe('');
        expect(getReferenceExampleText()).toBe('');
        expect(getReferenceMeaning()).toBe('');
    });
});

describe('image storage identity', () => {
    it('round-trips global nested paths and forms', () => {
        const path = buildGlobalImageStoragePath({ category: 'verbs', deck: 'level/a.json', index: 12, defIndex: 2, form: 'v3' });
        expect(path).toBe('/card_images/verbs/level/a/level_a_card_12_def2_v3.avif');
        expect(parseCardImageStorageIdentity(path)).toEqual({ category: 'verbs', deck: 'level/a', index: 12, defIndex: 2, form: 'v3' });
    });

    it('parses personal and direction-aware legacy paths', () => {
        expect(parseCardImageStorageIdentity('/card_images/users/u-1/en_es/verbs/basic/basic_card_3_def0.jpg?v=8')).toEqual({
            category: 'verbs', deck: 'basic', courseDirection: 'en_es', index: 3, defIndex: 0, form: 'v1',
        });
        expect(parseCardImageStorageIdentity('/invalid/path.png')).toBeNull();
        expect(parseCardImageStorageIdentity('')).toBeNull();
    });

    it('round-trips every safe generated storage coordinate', () => {
        fc.assert(fc.property(
            fc.constantFrom('verbs', 'nouns', 'phrasal_verbs'),
            fc.constantFrom('basic', '1-basic/action', 'level/sub_deck'),
            fc.integer({ min: 0, max: 100_000 }),
            fc.integer({ min: 0, max: 100 }),
            fc.constantFrom('v1', 'v2', 'v3'),
            (category, deck, index, defIndex, form) => {
                const path = buildGlobalImageStoragePath({ category, deck, index, defIndex, form });
                expect(parseCardImageStorageIdentity(path)).toEqual({ category, deck, index, defIndex, form });
            },
        ), { numRuns: 1_000 });
    });
});

describe('UI bridge', () => {
    it('registers, invokes, replaces and removes handlers', () => {
        const first = vi.fn();
        const second = vi.fn();
        registerUiBridgeHandler('flip', first);
        expect(invokeUiBridge('flip', { id: 1 })).toBe(true);
        expect(first).toHaveBeenCalledWith({ id: 1 });
        registerUiBridgeHandler('flip', second);
        invokeUiBridge('flip');
        expect(second).toHaveBeenCalledOnce();
        unregisterUiBridgeHandler('flip');
        expect(invokeUiBridge('flip')).toBe(false);
    });
});
