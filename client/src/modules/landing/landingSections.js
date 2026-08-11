export const LANDING_SECTION_IDS = ['how-it-works', 'demo', 'vocabulary-first', 'reviews'];

export function isLandingSectionHash(hash) {
    const id = (hash || '').replace(/^#/, '');
    return LANDING_SECTION_IDS.includes(id);
}

export function landingSectionLink(sectionId) {
    return { pathname: '/', hash: sectionId };
}

export function scrollToLandingSection(sectionId, { behavior = 'smooth', maxAttempts = 24, intervalMs = 80 } = {}) {
    const id = (sectionId || '').replace(/^#/, '');
    if (!id) return () => {};

    let attempts = 0;
    let timerId = null;

    const tryScroll = () => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior, block: 'start' });
            return;
        }

        attempts += 1;
        if (attempts < maxAttempts) {
            timerId = window.setTimeout(tryScroll, intervalMs);
        }
    };

    tryScroll();

    return () => {
        if (timerId != null) window.clearTimeout(timerId);
    };
}
