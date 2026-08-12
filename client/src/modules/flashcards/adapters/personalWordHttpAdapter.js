/**
 * Adaptador HTTP de "Crear palabra" (infraestructura).
 * Implementa el puerto `PersonalWordPort` vía `httpClient`.
 */
export function createPersonalWordHttpAdapter(httpClient) {
    const normalizeCourseDirection = (courseDirection) => {
        if (courseDirection === 'en_es') return 'en_es';
        if (courseDirection === 'es_de') return 'es_de';
        return 'es_en';
    };

    return {
        previewWord: ({ word, courseDirection, categoryOverride, levelOverride, existingTopics }) =>
            httpClient.post('/api/personal-words/preview', {
                word,
                course_direction: normalizeCourseDirection(courseDirection),
                category_override: categoryOverride,
                level_override: levelOverride,
                existing_topics: (existingTopics || []).map((t) => ({
                    category: t.category,
                    level: t.level,
                    topic_name: t.topicName,
                })),
            }),

        createWord: ({ word, courseDirection, categoryOverride, levelOverride }) =>
            httpClient.post('/api/personal-words/create', {
                word,
                course_direction: normalizeCourseDirection(courseDirection),
                category_override: categoryOverride,
                level_override: levelOverride,
            }),

        getPersonalWordsSummary: ({ category, courseDirection }) =>
            httpClient.get(
                `/api/personal-words?category=${encodeURIComponent(category)}&course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}`,
            ),

        renamePersonalDeck: ({ category, level, topicName, courseDirection }) =>
            httpClient.post('/api/personal-words/rename', {
                category,
                level,
                topic_name: topicName,
                course_direction: normalizeCourseDirection(courseDirection),
            }),
    };
}
