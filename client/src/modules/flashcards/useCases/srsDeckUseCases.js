import { normalizeDeckResponse } from './deckUseCases.js';

const coordinateKey = ({ category, deck, card_index: cardIndex }) => `${category}::${deck}::${cardIndex}`;

/** Carga cada JSON una sola vez y conserva el orden producido por el triaje. */
export async function assembleSrsDeck(queue, loadDeck) {
    const candidates = Array.isArray(queue) ? queue : [];
    const deckKeys = new Map();
    candidates.forEach((candidate) => {
        const key = `${candidate.category}::${candidate.deck}`;
        if (!deckKeys.has(key)) deckKeys.set(key, candidate);
    });

    const loaded = new Map(await Promise.all(
        Array.from(deckKeys.entries()).map(async ([key, coordinate]) => {
            const raw = await loadDeck(coordinate);
            return [key, normalizeDeckResponse(raw)];
        }),
    ));

    return candidates.flatMap((candidate) => {
        const cards = loaded.get(`${candidate.category}::${candidate.deck}`) || [];
        const card = cards[candidate.card_index];
        if (!card) return [];
        return [{
            ...card,
            learned: Boolean(candidate.learned),
            srs_key: coordinateKey(candidate),
            srs_coordinate: {
                category: candidate.category,
                deck: candidate.deck,
                card_index: candidate.card_index,
            },
            srs_progress: {
                box_level: candidate.box_level,
                ease_factor: candidate.ease_factor,
                interval_days: candidate.interval_days,
                next_review_at: candidate.next_review_at,
            },
            urgency: candidate.urgency,
        }];
    });
}
