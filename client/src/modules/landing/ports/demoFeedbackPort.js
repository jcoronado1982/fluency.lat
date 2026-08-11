/**
 * @typedef {Object} DemoFeedbackPort
 * @property {(limit?: number) => Promise<any>} fetchRecent
 * @property {(payload: {comment: string, rating: number, language: string}) => Promise<any>} submit
 */

/**
 * Contrato congelado del feedback del demo público. La UI (`features/DemoFeedback.jsx`,
 * `features/LandingHero.jsx`) consume este puerto, nunca el adapter ni `httpClient` directo.
 * @param {DemoFeedbackPort} adapter
 * @returns {DemoFeedbackPort}
 */
export function createDemoFeedbackPort(adapter) {
    return Object.freeze({ ...adapter });
}
