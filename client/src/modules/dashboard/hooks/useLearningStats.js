import { useCallback, useEffect, useState } from 'react';
import { learningStatsPort } from '../composition';

const LEARNING_STATS_TIMEOUT_MS = 20000;

/**
 * ─── NO ROMPER (fix Jul 2026) ──────────────────────────────────────────────
 * Última respuesta buena por dirección de curso. Sobrevive remounts y evita
 * que un re-fetch fallido (timeout, backend ocupado, StrictMode montando
 * doble) borre datos ya cargados.
 *
 * Síntoma si esto se quita: el dashboard carga bien y "después de un rato"
 * las recomendaciones vuelven a nombres inventados del catálogo y a las
 * imágenes predeterminadas — porque un segundo fetch que falla hacía
 * `setStats(null)` y pisaba los datos buenos.
 *
 * Reglas: (1) en error/timeout se CONSERVA lo último bueno, nunca se anula;
 * (2) si hay caché se muestra de inmediato y se refresca en background.
 * ───────────────────────────────────────────────────────────────────────────
 */
const statsCache = new Map(); // courseDirection -> stats

export function useLearningStats(isAuthenticated, courseDirection = 'es_en') {
    const [stats, setStats] = useState(() => statsCache.get(courseDirection) ?? null);
    const [loading, setLoading] = useState(() => !statsCache.has(courseDirection));
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        if (!isAuthenticated) {
            statsCache.clear();
            setStats(null);
            setLoading(false);
            return;
        }

        const cached = statsCache.get(courseDirection);
        if (cached) {
            // Muestra lo último conocido de inmediato y refresca en background.
            setStats(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            const result = await Promise.race([
                learningStatsPort.fetchLearningStats(courseDirection),
                new Promise((_, reject) => {
                    window.setTimeout(() => {
                        reject(new Error('learning_stats_timeout'));
                    }, LEARNING_STATS_TIMEOUT_MS);
                }),
            ]);
            if (result?.success && result.stats) {
                statsCache.set(courseDirection, result.stats);
                setStats(result.stats);
            }
            // Respuesta sin datos: conserva lo último bueno en vez de anular.
        } catch (err) {
            // Timeout o error de red: conserva lo último bueno.
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [courseDirection, isAuthenticated]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { stats, loading, error, refresh };
}
