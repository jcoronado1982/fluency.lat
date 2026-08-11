/** @typedef {object} CheckoutPort
 * @property {(plan: 'monthly'|'annual') => Promise<{checkout_url: string}>} createCheckoutSession */
export function createCheckoutPort(adapter) {
    return Object.freeze({
        createCheckoutSession: (plan) => adapter.createCheckoutSession(plan),
    });
}
