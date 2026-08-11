import { useEffect, useState } from 'react';
import { reviewSuggestionPort } from '../composition';
import { SrsEngine } from '../../../contracts/srsEngine.js';

/** Consulta una proyección mínima; no descarga tarjetas ni construye el mazo. */
export function useDailyReviewSuggestion(enabled, courseDirection) {
    const [suggestion, setSuggestion] = useState({ pendingCount: 0, previewCard: null });

    useEffect(() => {
        if (!enabled) {
            setSuggestion({ pendingCount: 0, previewCard: null });
            return undefined;
        }

        let cancelled = false;
        const load = async () => {
            try {
                const response = await reviewSuggestionPort.fetchDueCards(courseDirection, 5_000);
                if (!cancelled) {
                    const cards = Array.isArray(response?.cards) ? response.cards : [];
                    const dailyQueue = SrsEngine.buildDailyQueue(cards, new Date(), 10);
                    setSuggestion({
                        pendingCount: dailyQueue.length,
                        // La portada coincide con la primera tarjeta que verá el usuario.
                        previewCard: dailyQueue[0] || null,
                    });
                }
            } catch {
                // Una recomendación auxiliar no debe bloquear el dashboard.
                if (!cancelled) setSuggestion({ pendingCount: 0, previewCard: null });
            }
        };

        void load();
        return () => { cancelled = true; };
    }, [courseDirection, enabled]);

    return suggestion;
}
