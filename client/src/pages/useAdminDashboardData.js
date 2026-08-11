import { useCallback, useEffect, useState } from 'react';
import { adminRepository } from '../repositories/adminRepository';

const ACTIVITY_POLL_MS = 30_000;
const COUNTRIES_POLL_MS = 30_000;
// La serie diaria solo cambia una vez al día (snapshot del backend); refrescar
// cada 30s como el resto del panel sería trabajo desperdiciado.
const DAILY_STATS_POLL_MS = 10 * 60_000;

/** Actividad/presencia paginada de usuarios (tabla principal del panel admin). */
export function useAdminUsersActivity(page, limit = 25) {
    const [data, setData] = useState({ users: [], total: 0, page: 1, total_pages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async (currentPage) => {
        try {
            const result = await adminRepository.getUsersActivity(currentPage, limit);
            setData(result);
            setError(null);
        } catch (err) {
            setError(err.message || 'Could not load user activity');
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        load(page);
        const interval = setInterval(() => load(page), ACTIVITY_POLL_MS);
        return () => clearInterval(interval);
    }, [load, page]);

    return { data, loading, error, setLoading };
}

/** Distribución de usuarios por país (estadística no crítica del panel admin). */
export function useAdminCountriesStats() {
    const [countries, setCountries] = useState([]);

    const loadCountries = useCallback(async () => {
        try {
            const result = await adminRepository.getUsersByCountry();
            setCountries(result);
        } catch {
            // Non-critical stat; the main table already reports the load error.
        }
    }, []);

    useEffect(() => {
        loadCountries();
        const interval = setInterval(loadCountries, COUNTRIES_POLL_MS);
        return () => clearInterval(interval);
    }, [loadCountries]);

    return countries;
}

/** Serie diaria (DAU, altas, retención) para los gráficos del panel admin. */
export function useAdminDailyStats(days = 30) {
    const [dailyStats, setDailyStats] = useState([]);

    const loadDailyStats = useCallback(async () => {
        try {
            const result = await adminRepository.getDailyStats(days);
            setDailyStats(result);
        } catch {
            // Non-critical stat; the main table already reports the load error.
        }
    }, [days]);

    useEffect(() => {
        loadDailyStats();
        const interval = setInterval(loadDailyStats, DAILY_STATS_POLL_MS);
        return () => clearInterval(interval);
    }, [loadDailyStats]);

    return dailyStats;
}
