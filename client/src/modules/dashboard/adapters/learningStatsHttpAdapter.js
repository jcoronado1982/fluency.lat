export function createLearningStatsHttpAdapter(httpClient) {
    const normalizeCourseDirection = (courseDirection) => {
        if (courseDirection === 'en_es') return 'en_es';
        if (courseDirection === 'es_de') return 'es_de';
        return 'es_en';
    };

    return {
        fetchLearningStats: (courseDirection = 'es_en') =>
            httpClient.get(`/api/learning-stats?course_direction=${encodeURIComponent(normalizeCourseDirection(courseDirection))}`),
        touchStudyDay: () => httpClient.post('/api/study/touch'),
    };
}
