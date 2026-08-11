export function createReviewSuggestionHttpAdapter(httpClient) {
    const normalizeCourseDirection = (value) => {
        if (value === 'en_es') return 'en_es';
        if (value === 'es_de') return 'es_de';
        return 'es_en';
    };

    return {
        fetchDueCards: (courseDirection = 'es_en', limit = 5_000) => httpClient.get(
            `/api/srs/due?course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}&limit=${Math.min(5_000, Math.max(1, Math.trunc(limit)))}`,
        ),
    };
}
