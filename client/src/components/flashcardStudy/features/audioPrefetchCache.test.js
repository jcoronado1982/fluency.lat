import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearPrefetchedAudio,
    deletePrefetchedAudio,
    getPrefetchedAudio,
    hasAudioPrefetchEntry,
    makeAudioPrefetchKey,
    setPrefetchedAudio,
} from './audioPrefetchCache';

beforeEach(() => {
    clearPrefetchedAudio();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('audio prefetch cache', () => {
    it('keys every storage coordinate and expires entries after five minutes', () => {
        const key = makeAudioPrefetchKey({
            category: 'verbs', deck: 'basic', text: 'go home', lang: 'en', verbName: 'go', courseDirection: 'en_es',
        });
        expect(key).toBe('en_es::verbs::basic::en::go::go home');
        setPrefetchedAudio(key, { resolvedUrl: '/a.ogg?v=1', voiceName: 'A' });
        expect(getPrefetchedAudio(key)).toEqual({ resolvedUrl: '/a.ogg?v=1', voiceName: 'A' });
        vi.advanceTimersByTime(5 * 60 * 1000 + 1);
        expect(hasAudioPrefetchEntry(key)).toBe(false);
        expect(getPrefetchedAudio(key)).toBeNull();
    });

    it('evicts oldest entries, supports misses and explicit deletion', () => {
        for (let index = 0; index < 25; index += 1) {
            setPrefetchedAudio(`key-${index}`, { index });
        }
        expect(getPrefetchedAudio('key-0')).toBeNull();
        expect(getPrefetchedAudio('key-24')).toEqual({ index: 24 });
        deletePrefetchedAudio('key-24');
        expect(getPrefetchedAudio('key-24')).toBeNull();
        expect(getPrefetchedAudio('never-created')).toBeNull();
    });
});
