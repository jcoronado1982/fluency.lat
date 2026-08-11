import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLearningStats } from './useLearningStats';
import { learningStatsPort } from '../composition';

vi.mock('../composition', () => ({
    learningStatsPort: { fetchLearningStats: vi.fn(), touchStudyDay: vi.fn() },
}));

// Cubre el invariante "NO ROMPER" documentado en useLearningStats.js: un refetch fallido
// (timeout, red, backend ocupado) NUNCA debe borrar el último stats bueno ya mostrado.
describe('useLearningStats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads stats successfully when authenticated', async () => {
        learningStatsPort.fetchLearningStats.mockResolvedValue({
            success: true,
            stats: { mastered_count: 10 },
        });

        const { result } = renderHook(() => useLearningStats(true, 'es_en'));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.stats).toEqual({ mastered_count: 10 });
        expect(result.current.error).toBe(null);
    });

    it('keeps the last good stats when a refresh fails instead of nulling them', async () => {
        learningStatsPort.fetchLearningStats.mockResolvedValueOnce({
            success: true,
            stats: { mastered_count: 5 },
        });

        const { result, rerender } = renderHook(
            ({ courseDirection }) => useLearningStats(true, courseDirection),
            { initialProps: { courseDirection: 'es_en' } },
        );

        await waitFor(() => expect(result.current.stats).toEqual({ mastered_count: 5 }));

        learningStatsPort.fetchLearningStats.mockRejectedValueOnce(new Error('network down'));
        rerender({ courseDirection: 'es_en' });
        await result.current.refresh();

        await waitFor(() => expect(result.current.error).not.toBe(null));
        expect(result.current.stats).toEqual({ mastered_count: 5 });
    });

    it('clears stats and skips fetching when not authenticated', async () => {
        const { result } = renderHook(() => useLearningStats(false, 'es_en'));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.stats).toBe(null);
        expect(learningStatsPort.fetchLearningStats).not.toHaveBeenCalled();
    });
});
