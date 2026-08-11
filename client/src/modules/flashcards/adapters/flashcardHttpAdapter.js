/**
 * Adaptador HTTP de flashcards (infraestructura).
 * Implementa el puerto `FlashcardPort` vía `httpClient`.
 */
export function createFlashcardHttpAdapter(httpClient) {
    const normalizeCourseDirection = (courseDirection) => {
        if (courseDirection === 'en_es') return 'en_es';
        if (courseDirection === 'es_de') return 'es_de';
        return 'es_en';
    };

    return {
        fetchCategories: (courseDirection = 'es_en') =>
            httpClient.get(`/api/categories?course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}&include_counts=true`),

        fetchDecksForCategory: (category, courseDirection = 'es_en') =>
            httpClient.get(
                `/api/available-flashcards-files?category=${encodeURIComponent(category)}&course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}`,
            ),

        fetchDeckSummaries: (category, courseDirection = 'es_en') =>
            httpClient.get(
                `/api/deck-summaries?category=${encodeURIComponent(category)}&course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}`,
            ),

        fetchDeckData: (userId, category, deck, courseDirection = 'es_en') =>
            httpClient.get(
                `/api/flashcards-data?user_id=${encodeURIComponent(userId)}&category=${encodeURIComponent(category)}&deck=${encodeURIComponent(deck)}&course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}`,
            ),

        updateCardStatus: (userId, category, deck, index, learned, courseDirection = 'es_en') =>
            httpClient.post('/api/update-status', {
                user_id: userId,
                category,
                deck,
                index,
                learned,
                course_direction: normalizeCourseDirection(courseDirection),
            }),

        /**
         * Envía un lote de actualizaciones en una sola petición HTTP.
         * @param {string} userId
         * @param {string} category
         * @param {string} deck
         * @param {Array<{index: number, learned: boolean}>} cards
         */
        updateCardsBatch: (userId, category, deck, cards, courseDirection = 'es_en') =>
            httpClient.post('/api/update-batch', {
                user_id: userId,
                category,
                deck,
                cards,
                course_direction: normalizeCourseDirection(courseDirection),
            }),

        resetDeckStatus: (userId, category, deck, courseDirection = 'es_en') =>
            httpClient.post('/api/reset-all', {
                user_id: userId,
                category,
                deck,
                confirm: true,
                course_direction: normalizeCourseDirection(courseDirection),
            }),

        resetCategoryStatus: (userId, category, deck = '*', courseDirection = 'es_en') =>
            httpClient.post('/api/reset-all', {
                user_id: userId,
                category,
                deck,
                scope: 'category',
                confirm: true,
                course_direction: normalizeCourseDirection(courseDirection),
            }),

        fetchLearningStats: (courseDirection = 'es_en') =>
            httpClient.get(`/api/learning-stats?course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}`),

        touchStudyDay: () => httpClient.post('/api/study/touch'),

        fetchPhonicsData: () => httpClient.get('/api/phonics-data'),

        // DELETE /api/delete-definition — borra permanentemente una acepción/frase del deck
        deleteDefinition: ({ category, deck, index, defIndex, form, courseDirection }) =>
            httpClient.delete('/api/delete-definition', {
                category,
                deck,
                index,
                def_index: defIndex,
                form,
                course_direction: normalizeCourseDirection(courseDirection),
            }),
    };
}
