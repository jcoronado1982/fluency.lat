/**
 * Puerto de vista previa de mazos (contrato de aplicación del dashboard).
 * Equivalente frontend de un trait en `fluency_core::ports`.
 *
 * El dashboard NO importa el puerto del módulo flashcards: cada módulo se
 * conecta a sus propios puertos vía su `composition.js` (el backend expone
 * `/api/flashcards-data` como API pública; consumirla no acopla módulos).
 *
 * @typedef {object} DeckPreviewPort
 * @property {(userId: string, category: string, deck: string, courseDirection?: string) => Promise<unknown>} fetchDeckData
 */

/** @param {DeckPreviewPort} adapter */
export function createDeckPreviewPort(adapter) {
    return Object.freeze({ ...adapter });
}
