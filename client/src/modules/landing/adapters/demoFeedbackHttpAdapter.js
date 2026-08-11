/**
 * Único lugar que conoce las rutas HTTP del feedback del demo público.
 * @param {import('../../../services/httpClient').httpClient} http
 * @returns {import('../ports/demoFeedbackPort').DemoFeedbackPort}
 */
export function createDemoFeedbackHttpAdapter(http) {
    return {
        fetchRecent: (limit = 20) => http.get(`/api/demo-feedback?limit=${limit}`),
        submit: ({ comment, rating, language }) => http.post('/api/demo-feedback', {
            comment,
            rating,
            language,
            source: 'landing-demo',
        }),
    };
}
