/** Contrato de estadísticas de aprendizaje expuesto al dashboard. */
export function createLearningStatsPort(adapter) {
    return Object.freeze({
        fetchLearningStats: (courseDirection) => adapter.fetchLearningStats(courseDirection),
        touchStudyDay: () => adapter.touchStudyDay(),
    });
}
