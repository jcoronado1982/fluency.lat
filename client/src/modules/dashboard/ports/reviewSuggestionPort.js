/**
 * Puerto de lectura del dashboard. Solo comprueba si existe trabajo SRS;
 * el armado y la priorización del mazo siguen perteneciendo a flashcards.
 *
 * @typedef {object} ReviewSuggestionPort
 * @property {(courseDirection: string, limit?: number) => Promise<{cards?: Array<object>}>} fetchDueCards
 */

/** @param {ReviewSuggestionPort} adapter */
export function createReviewSuggestionPort(adapter) {
    return Object.freeze({ ...adapter });
}
