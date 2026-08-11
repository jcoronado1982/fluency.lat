/**
 * Contrato compartido shell: namespace aislado del demo en landing.
 * Usado por landing (UI) y flashcards (detección landing-demo en media).
 */
export const LANDING_DEMO_CATEGORY = 'landing-demo';
export const LANDING_DEMO_DECK = 'verbs-essentials';
export const LANDING_DEMO_CARD_LIMIT = 10;

export function buildLandingDemoImagePath(demoIndex, defIndex, form = 'v1') {
    const formSuffix = form && form !== 'v1' ? `_${form}` : '';
    return `/card_images/${LANDING_DEMO_CATEGORY}/${LANDING_DEMO_DECK}/${LANDING_DEMO_DECK}_card_${demoIndex}_def${defIndex}${formSuffix}.avif`;
}

export function isLandingDemoCategory(category) {
    return category === LANDING_DEMO_CATEGORY;
}
