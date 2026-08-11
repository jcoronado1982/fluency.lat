/**
 * Casos de uso de vista previa de mazos (lógica pura, sin React ni HTTP).
 *
 * REGLA (fix Jul 2026): la fuente de verdad de la imagen de un mazo es el
 * JSON del propio deck (`definitions[0].imagePath` de la primera tarjeta
 * pendiente del usuario) — igual que la página de estudio. Ver el detalle
 * completo del bug en `hooks/useDeckFirstImages.js`.
 */

/**
 * Extrae la imagen de la primera tarjeta pendiente (o la primera del mazo si
 * todas están aprendidas o el usuario nunca lo abrió).
 * @param {unknown} deckResponse respuesta de `/api/flashcards-data` (array u objeto `{flashcards}`)
 * @returns {string|null} path crudo de imagen (sin normalizar)
 */
export function extractFirstPendingImage(deckResponse) {
    const cards = Array.isArray(deckResponse)
        ? deckResponse
        : (deckResponse?.flashcards || []);
    if (!Array.isArray(cards) || cards.length === 0) return null;

    const card = cards.find((c) => !c.learned) || cards[0];
    const def = Array.isArray(card?.definitions) ? card.definitions[0] : null;
    return def?.imagePath || def?.image_path || null;
}

/** Extrae la imagen de una tarjeta concreta usando el índice persistido por SRS. */
export function extractCardImage(deckResponse, cardIndex) {
    const cards = Array.isArray(deckResponse)
        ? deckResponse
        : (deckResponse?.flashcards || []);
    if (!Array.isArray(cards) || !Number.isInteger(cardIndex)) return null;

    const card = cards[cardIndex];
    const def = Array.isArray(card?.definitions) ? card.definitions[0] : null;
    return def?.imagePath || def?.image_path || null;
}
