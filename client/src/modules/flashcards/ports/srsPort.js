/**
 * @typedef {object} SrsPort
 * @property {(courseDirection?: string) => Promise<{success: boolean, cards: Array<object>}>} fetchDueCards
 */

/** @param {SrsPort} adapter */
export function createSrsPort(adapter) {
    return Object.freeze({ ...adapter });
}
