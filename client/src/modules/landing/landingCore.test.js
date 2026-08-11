import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoFeedbackPort } from './ports/demoFeedbackPort';
import { createDemoFeedbackHttpAdapter } from './adapters/demoFeedbackHttpAdapter';
import {
    createDemoSessionCards,
    patchDefinitionImage,
    prepareDemoCards,
} from './features/demo/demoSessionUtils';
import {
    clearDemoFeedbackReturn,
    consumeDemoFeedbackDraft,
    hasDemoFeedbackReturn,
    saveDemoFeedbackDraft,
} from '../../utils/demoFeedbackStorage';
import {
    isLandingSectionHash,
    landingSectionLink,
    scrollToLandingSection,
} from './landingSections';
import {
    LANDING_DEMO_CARD_LIMIT,
    buildLandingDemoImagePath,
} from '../../contracts/landingDemoNamespace';

beforeEach(() => {
    sessionStorage.clear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('landing feedback port', () => {
    it('uses the public GET and authenticated POST contracts exactly', async () => {
        const http = {
            get: vi.fn().mockResolvedValue({ reviews: [] }),
            post: vi.fn().mockResolvedValue({ success: true }),
        };
        const port = createDemoFeedbackPort(createDemoFeedbackHttpAdapter(http));

        expect(Object.isFrozen(port)).toBe(true);
        await port.fetchRecent();
        await port.fetchRecent(50);
        await port.submit({ comment: 'Excelente', rating: 5, language: 'es' });

        expect(http.get).toHaveBeenNthCalledWith(1, '/api/demo-feedback?limit=20');
        expect(http.get).toHaveBeenNthCalledWith(2, '/api/demo-feedback?limit=50');
        expect(http.post).toHaveBeenCalledWith('/api/demo-feedback', {
            comment: 'Excelente',
            rating: 5,
            language: 'es',
            source: 'landing-demo',
        });
    });
});

describe('landing demo session data', () => {
    it('normalizes ids, learning state and missing image paths', () => {
        const cards = prepareDemoCards([{
            word: 'go',
            definitions: [{ meaning: 'ir' }],
            irregular: {
                past: { definitions: [{ meaning: 'fue' }] },
                participle: { definitions: [{ meaning: 'ido' }] },
            },
            learned: true,
        }]);

        expect(cards[0]).toMatchObject({ id: 1, demoIndex: 1, learned: false, learned_at: null });
        expect(cards[0].definitions[0].imagePath).toBe(buildLandingDemoImagePath(1, 0, 'v1'));
        expect(cards[0].irregular.past.definitions[0].imagePath)
            .toBe(buildLandingDemoImagePath(1, 0, 'v2'));
        expect(cards[0].irregular.participle.definitions[0].imagePath)
            .toBe(buildLandingDemoImagePath(1, 0, 'v3'));
    });

    it('creates a fresh bounded deck on every call', () => {
        const first = createDemoSessionCards();
        const second = createDemoSessionCards();

        expect(first).toHaveLength(LANDING_DEMO_CARD_LIMIT);
        expect(second).toHaveLength(LANDING_DEMO_CARD_LIMIT);
        expect(first).not.toBe(second);
        first[0].learned = true;
        expect(second[0].learned).toBe(false);
    });

    it.each([
        ['v1', (card) => card.definitions[0].imagePath],
        ['v2', (card) => card.irregular.past.definitions[0].imagePath],
        ['v3', (card) => card.irregular.participle.definitions[0].imagePath],
    ])('patches %s without mutating the original card', (form, readPath) => {
        const cards = prepareDemoCards([{
            demoIndex: 7,
            definitions: [{ meaning: 'base' }],
            irregular: {
                past: { definitions: [{ meaning: 'past' }] },
                participle: { definitions: [{ meaning: 'participle' }] },
            },
        }]);
        const original = readPath(cards[0]);
        const patched = patchDefinitionImage(cards, 7, '/new.avif', 0, form);

        expect(readPath(patched[0])).toBe('/new.avif');
        expect(readPath(cards[0])).toBe(original);
        expect(patched[0]).not.toBe(cards[0]);
    });

    it('leaves the deck unchanged for unknown cards or definition indexes', () => {
        const cards = prepareDemoCards([{ demoIndex: 1, definitions: [{ meaning: 'base' }] }]);
        expect(patchDefinitionImage(cards, 999, '/x.avif', 0, 'v1')).toEqual(cards);
        expect(patchDefinitionImage(cards, 1, '/x.avif', 99, 'v1')).toEqual(cards);
    });
});

describe('feedback return storage', () => {
    it('round-trips a draft once and keeps the return marker until cleared', () => {
        saveDemoFeedbackDraft({ comment: '  comentario  ', rating: 4 });
        expect(hasDemoFeedbackReturn()).toBe(true);
        expect(consumeDemoFeedbackDraft()).toEqual({ comment: '  comentario  ', rating: 4 });
        expect(consumeDemoFeedbackDraft()).toEqual({ comment: '', rating: 0 });
        expect(hasDemoFeedbackReturn()).toBe(true);
        clearDemoFeedbackReturn();
        expect(hasDemoFeedbackReturn()).toBe(false);
    });

    it('degrades malformed and partially typed storage safely', () => {
        sessionStorage.setItem('lp-demo-feedback-draft', '{bad-json');
        expect(consumeDemoFeedbackDraft()).toEqual({ comment: '{bad-json', rating: 0 });

        sessionStorage.setItem('lp-demo-feedback-draft', JSON.stringify({ comment: 123, rating: '5' }));
        const raw = JSON.stringify({ comment: 123, rating: '5' });
        expect(consumeDemoFeedbackDraft()).toEqual({ comment: raw, rating: 5 });
    });
});

describe('landing section navigation', () => {
    it('recognizes only canonical hashes and constructs a root link', () => {
        expect(isLandingSectionHash('#demo')).toBe(true);
        expect(isLandingSectionHash('reviews')).toBe(true);
        expect(isLandingSectionHash('#unknown')).toBe(false);
        expect(isLandingSectionHash('')).toBe(false);
        expect(landingSectionLink('reviews')).toEqual({ pathname: '/', hash: 'reviews' });
    });

    it('scrolls immediately when the target exists', () => {
        const target = document.createElement('div');
        target.id = 'reviews';
        target.scrollIntoView = vi.fn();
        document.body.appendChild(target);

        const cancel = scrollToLandingSection('#reviews', { behavior: 'auto' });
        expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
        cancel();
        target.remove();
    });

    it('retries a missing target and cancellation clears the pending timer', () => {
        vi.useFakeTimers();
        const clearSpy = vi.spyOn(window, 'clearTimeout');
        const cancel = scrollToLandingSection('later', { maxAttempts: 3, intervalMs: 10 });
        expect(vi.getTimerCount()).toBe(1);

        const target = document.createElement('div');
        target.id = 'later';
        target.scrollIntoView = vi.fn();
        document.body.appendChild(target);
        vi.advanceTimersByTime(10);
        expect(target.scrollIntoView).toHaveBeenCalledOnce();

        cancel();
        expect(clearSpy).toHaveBeenCalled();
        target.remove();
    });
});
