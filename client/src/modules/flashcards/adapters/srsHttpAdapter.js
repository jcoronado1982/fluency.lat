export function createSrsHttpAdapter(httpClient) {
    const normalizeCourseDirection = (value) => {
        if (value === 'en_es') return 'en_es';
        if (value === 'es_de') return 'es_de';
        return 'es_en';
    };
    return {
        fetchDueCards: (courseDirection = 'es_en') => httpClient.get(
            `/api/srs/due?course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}`,
        ),
    };
}
