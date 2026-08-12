/**
 * Puerto "Crear palabra" (mazo personal por usuario).
 * Equivalente frontend de `mod_flashcards::card_creation_use_cases::CardCreationUseCases`.
 *
 * El mazo devuelto (`category` + `level` → `` `${level}/my_words` ``) se abre igual que cualquier
 * mazo del catálogo (`changeCategory`/`changeDeck`) — el namespace interno de storage nunca cruza
 * la API (ver docs/modules/flashcards.md §Personal Words).
 *
 * `categoryOverride`/`levelOverride` (ambos juntos o ninguno) fuerzan la clasificación a una
 * categoría/nivel específicos en vez de dejar que Gemini elija libremente — usados cuando el
 * usuario edita una fila del preview, o siempre al confirmar la creación de cualquier fila (ver
 * `CreateWordModal.jsx`).
 *
 * `existingTopics` (solo en `previewWord`, ignorado si además van `categoryOverride`/
 * `levelOverride`): lista COMPLETA de los mazos personales que el usuario ya tiene, en todas las
 * categorías — Gemini la ve entera desde esta MISMA llamada y RECOMIENDA el mejor encaje si lo
 * hay, sin forzar nada y sin perder la detección de ambigüedad. Resuelve "¿a cuál de mis mazos la
 * agrego, o creo uno nuevo?" en UNA sola llamada — pedido explícito del usuario ("vos debés
 * recomendarlo y colocar esa recomendación como primera opción").
 *
 * @typedef {object} PreviewWordCandidate
 * @property {boolean} duplicate
 * @property {string} category
 * @property {string} level
 * @property {string} name
 * @property {boolean} is_new_deck
 * @property {string} [existing_topic_name]
 *
 * @typedef {object} ExistingTopic
 * @property {string} category
 * @property {string} level
 * @property {string} [topicName]
 *
 * @typedef {object} PersonalWordPort
 * @property {(params: {word: string, courseDirection?: string, categoryOverride?: string, levelOverride?: string, existingTopics?: ExistingTopic[]}) => Promise<{candidates: PreviewWordCandidate[]}>} previewWord
 * @property {(params: {word: string, courseDirection?: string, categoryOverride?: string, levelOverride?: string}) => Promise<{duplicate: boolean, category: string, level: string, is_new_deck: boolean, card?: unknown}>} createWord
 * @property {(params: {category: string, courseDirection?: string}) => Promise<{decks: Array<{deck: string, total: number, learned: number, topic_name?: string}>}>} getPersonalWordsSummary
 * @property {(params: {category: string, level: string, topicName: string, courseDirection?: string}) => Promise<{success: boolean}>} renamePersonalDeck
 */

/** @param {PersonalWordPort} adapter */
export function createPersonalWordPort(adapter) {
    return Object.freeze({ ...adapter });
}
