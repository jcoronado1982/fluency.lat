import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
    useAdminUsersActivity,
    useAdminCountriesStats,
    useAdminDailyStats,
} from './useAdminDashboardData';
import { adminRepository } from '../repositories/adminRepository';

vi.mock('../repositories/adminRepository', () => ({
    adminRepository: {
        getUsersActivity: vi.fn(),
        getUsersByCountry: vi.fn(),
        getDailyStats: vi.fn(),
    },
}));

// El panel admin (`AdminPage.jsx`) delega en estos hooks en vez de llamar al
// repositorio directamente (regla de dependencias de client/CLAUDE.md §2:
// presentación → useCases/hooks → adapters/repositorio, nunca al revés).
describe('useAdminDashboardData hooks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('useAdminUsersActivity loads a page and surfaces repository errors as a message', async () => {
        adminRepository.getUsersActivity.mockResolvedValueOnce({
            users: [{ email: 'a@b.com' }], total: 1, page: 1, total_pages: 1,
        });
        const { result } = renderHook(() => useAdminUsersActivity(1));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data.total).toBe(1);
        expect(result.current.error).toBe(null);
        expect(adminRepository.getUsersActivity).toHaveBeenCalledWith(1, 25);
    });

    it('useAdminUsersActivity keeps the previous page data out of the error state', async () => {
        adminRepository.getUsersActivity.mockRejectedValueOnce(new Error('boom'));
        const { result } = renderHook(() => useAdminUsersActivity(2));

        await waitFor(() => expect(result.current.error).toBe('boom'));
        expect(result.current.data.users).toEqual([]);
    });

    it('useAdminCountriesStats degrades to an empty list on failure without throwing', async () => {
        adminRepository.getUsersByCountry.mockRejectedValueOnce(new Error('nope'));
        const { result } = renderHook(() => useAdminCountriesStats());

        await waitFor(() => expect(adminRepository.getUsersByCountry).toHaveBeenCalled());
        expect(result.current).toEqual([]);
    });

    it('useAdminDailyStats fetches the requested window of days', async () => {
        adminRepository.getDailyStats.mockResolvedValueOnce([{ date: '2026-07-26', dau: 10 }]);
        const { result } = renderHook(() => useAdminDailyStats(30));

        await waitFor(() => expect(result.current).toHaveLength(1));
        expect(adminRepository.getDailyStats).toHaveBeenCalledWith(30);
    });
});
