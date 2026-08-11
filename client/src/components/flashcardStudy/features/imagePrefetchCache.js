// Caché mínima de rutas de imagen resueltas por el prefetch de la siguiente
// tarjeta (useNextImagePrefetch) y consumidas una sola vez por
// useImageGeneration antes de llamar a /api/resolve-image.
//
// Presupuesto deliberadamente pequeño: solo guarda strings de ruta (los bytes
// de la imagen viven en la caché HTTP del navegador, nunca en JS), con tope de
// entradas para que una sesión larga no acumule memoria. Las entradas
// negativas (path=null) existen solo para que el prefetch no reintente una
// imagen que ya respondió 404 — la resolución on-view sigue su flujo normal.

const MAX_ENTRIES = 24;
// La app hace pasadas duplicadas de ensureImage sobre la misma tarjeta
// (StrictMode en dev y dobles llamadas reales observadas en prod), así que la
// lectura NO consume la entrada: expira por TTL. Las mutaciones de imagen
// (generar/subir/borrar) invalidan todo vía clearPrefetchedImages().
const TTL_MS = 5 * 60 * 1000;

const entries = new Map();

export function makePrefetchKey({ category, deck, cardId, defIndex = 0, form, studyLanguage = 'en' }) {
    const normalizedForm = form && form !== 'v1' ? form : 'v1';
    const direction = studyLanguage === 'es' ? 'en_es' : 'es_en';
    return `${direction}::${category}::${deck}::${cardId}::${defIndex}::${normalizedForm}`;
}

export function hasPrefetchEntry(key) {
    const entry = entries.get(key);
    if (!entry) return false;
    if (Date.now() - entry.at > TTL_MS) {
        entries.delete(key);
        return false;
    }
    return true;
}

export function setPrefetchedImagePath(key, path) {
    if (entries.size >= MAX_ENTRIES && !entries.has(key)) {
        const oldest = entries.keys().next().value;
        entries.delete(oldest);
    }
    entries.set(key, { path: path ?? null, at: Date.now() });
}

/** Ruta prefeteada vigente; null/ausente ⇒ seguir el flujo normal de resolve. */
export function getPrefetchedImagePath(key) {
    if (!hasPrefetchEntry(key)) return null;
    return entries.get(key).path;
}

/** Invalidación total: cualquier mutación de imágenes (generar/subir/borrar). */
export function clearPrefetchedImages() {
    entries.clear();
}
