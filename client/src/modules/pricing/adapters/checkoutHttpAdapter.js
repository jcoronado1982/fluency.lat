export function createCheckoutHttpAdapter(httpClient) {
    return {
        createCheckoutSession: (plan) => httpClient.post('/api/checkout/session', { plan }),
    };
}
