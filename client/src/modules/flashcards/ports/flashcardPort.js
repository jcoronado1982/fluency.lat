/**
 * Puerto de flashcards (contrato de aplicación).
 * Equivalente frontend de los traits en `fluency_core::ports`.
 *
 * @typedef {object} FlashcardPort
 * @property {(courseDirection?: string) => Promise<unknown>} fetchCategories
 * @property {(category: string, courseDirection?: string) => Promise<unknown>} fetchDecksForCategory
 * @property {(category: string, courseDirection?: string) => Promise<unknown>} fetchDeckSummaries
 * @property {(userId: string, category: string, deck: string, courseDirection?: string) => Promise<unknown>} fetchDeckData
 * @property {(userId: string, category: string, deck: string, index: number, learned: boolean, courseDirection?: string) => Promise<unknown>} updateCardStatus
 * @property {(userId: string, category: string, deck: string, cards: Array<{index: number, learned: boolean}>, courseDirection?: string) => Promise<unknown>} updateCardsBatch
 * @property {(userId: string, category: string, deck: string, courseDirection?: string) => Promise<unknown>} resetDeckStatus
 * @property {(userId: string, category: string, deck?: string, courseDirection?: string) => Promise<unknown>} resetCategoryStatus
 * @property {(courseDirection?: string) => Promise<unknown>} fetchLearningStats
 * @property {() => Promise<unknown>} fetchPhonicsData
 * @property {(params: {category: string, deck: string, index: number, defIndex: number, form?: string, courseDirection?: string}) => Promise<unknown>} deleteDefinition
 */

/** @param {FlashcardPort} adapter */
export function createFlashcardPort(adapter) {
    return Object.freeze({ ...adapter });
}
