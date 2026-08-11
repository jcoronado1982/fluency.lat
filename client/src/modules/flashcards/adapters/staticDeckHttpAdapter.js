const encodeDeckPath = (deck) => String(deck || '')
    .replace(/\.json$/i, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

/** Lee el catálogo estático. El navegador conserva/revalida el JSON mediante HTTP cache. */
export function createStaticDeckHttpAdapter({ fallbackPort } = {}) {
    return {
        async fetchDeck({ userId, courseDirection, category, deck }) {
            const path = `/json/${encodeURIComponent(courseDirection)}/${encodeURIComponent(category)}/${encodeDeckPath(deck)}.json`;
            try {
                const response = await fetch(path, { cache: 'default', credentials: 'same-origin' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('json')) throw new Error('Respuesta de catálogo no JSON');
                return await response.json();
            } catch (error) {
                if (!fallbackPort) throw error;
                return fallbackPort.fetchDeckData(userId, category, deck, courseDirection);
            }
        },
    };
}
