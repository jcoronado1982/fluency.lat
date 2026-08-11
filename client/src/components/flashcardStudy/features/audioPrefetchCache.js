// Caché JS mínima para compartir entre la precarga de la siguiente tarjeta
// y useAudioPlayback. Solo conserva metadatos; los bytes permanecen en la caché
// HTTP del navegador y nunca se duplican en blobs mantenidos por JavaScript.

const MAX_ENTRIES = 24;
const TTL_MS = 5 * 60 * 1000;

const entries = new Map();

export function makeAudioPrefetchKey({
    category,
    deck,
    text,
    lang = 'en',
    verbName = '',
    courseDirection = 'es_en',
}) {
    return `${courseDirection}::${category}::${deck}::${lang}::${verbName || ''}::${text}`;
}

export function hasAudioPrefetchEntry(key) {
    const entry = entries.get(key);
    if (!entry) return false;
    if (Date.now() - entry.at > TTL_MS) {
        entries.delete(key);
        return false;
    }
    return true;
}

export function setPrefetchedAudio(key, value) {
    if (entries.size >= MAX_ENTRIES && !entries.has(key)) {
        entries.delete(entries.keys().next().value);
    }
    entries.set(key, { value: value ?? null, at: Date.now() });
}

/** null significa ausente, expirado o 404; la reproducción conserva su flujo normal. */
export function getPrefetchedAudio(key) {
    if (!hasAudioPrefetchEntry(key)) return null;
    return entries.get(key).value;
}

export function deletePrefetchedAudio(key) {
    entries.delete(key);
}

export function clearPrefetchedAudio() {
    entries.clear();
}
