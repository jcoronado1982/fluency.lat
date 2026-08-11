export function buildGlobalImageStoragePath({
    category,
    deck,
    index,
    defIndex,
    form,
}) {
    const cleanDeck = String(deck || '').replace(/\.json$/, '');
    const segments = cleanDeck.split('/').filter(Boolean);
    const mediaDir = segments.join('/') || cleanDeck;
    const filePrefix = segments.join('_') || cleanDeck;
    const formSuffix = form && form !== 'v1' ? `_${form}` : '';
    return `/card_images/${category}/${mediaDir}/${filePrefix}_card_${index}_def${defIndex}${formSuffix}.avif`;
}

/**
 * Convierte una ruta persistida en las coordenadas que entienden los endpoints
 * de imagen. Permite que los catálogos inversos compartan el mismo asset aunque
 * la tarjeta equivalente tenga otro índice o provenga de un deck legacy.
 */
export function parseCardImageStorageIdentity(path) {
    if (!path) return null;
    const cleanPath = String(path).split('?')[0];
    const marker = '/card_images/';
    const markerIndex = cleanPath.indexOf(marker);
    if (markerIndex < 0) return null;

    const segments = cleanPath.slice(markerIndex + marker.length).split('/').filter(Boolean);
    if (segments.length < 3) return null;
    const isPersonalPath = segments[0] === 'users' && segments.length >= 5;
    const directionIndex = isPersonalPath ? 2 : 0;
    const hasCourseDirection = /^(?:es_en|en_es)$/.test(segments[directionIndex] || '');
    const categoryIndex = directionIndex + (hasCourseDirection ? 1 : 0);
    const category = segments[categoryIndex];
    const fileName = segments.at(-1);
    const deck = segments.slice(categoryIndex + 1, -1).join('/');
    const match = fileName.match(/_card_(\d+)_def(\d+)(?:_(v2|v3))?\.(?:avif|jpe?g|png|webp)$/i);
    if (!match || !category || !deck) return null;

    return {
        category,
        deck,
        ...(hasCourseDirection ? { courseDirection: segments[directionIndex] } : {}),
        index: Number(match[1]),
        defIndex: Number(match[2]),
        form: match[3] || 'v1',
    };
}
