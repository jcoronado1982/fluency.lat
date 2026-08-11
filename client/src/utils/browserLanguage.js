export const INTERFACE_LANGUAGE_KEY = 'interface_language';
export const STUDY_LANGUAGE_KEY = 'study_language';

export function normalizeAppLanguage(value) {
    return value === 'es' ? 'es' : 'en';
}

/** studyLanguage admite un tercer valor ('de') que la interfaz (es/en) no usa. */
export function normalizeStudyLanguage(value) {
    return value === 'es' || value === 'de' ? value : 'en';
}

export function detectBrowserLanguage() {
    if (typeof navigator === 'undefined') return 'en';

    const preferred = navigator.language || navigator.languages?.[0] || 'en';
    return preferred.toLowerCase().startsWith('es') ? 'es' : 'en';
}

function readStoredLanguage(key) {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(key);
    return saved === 'es' || saved === 'en' ? saved : null;
}

function readStoredStudyLanguage() {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(STUDY_LANGUAGE_KEY);
    return saved === 'es' || saved === 'en' || saved === 'de' ? saved : null;
}

export function getInitialInterfaceLanguage() {
    return readStoredLanguage(INTERFACE_LANGUAGE_KEY) ?? detectBrowserLanguage();
}

export function getInitialStudyLanguage() {
    return readStoredStudyLanguage() ?? 'en';
}

export function persistInterfaceLanguage(language) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(INTERFACE_LANGUAGE_KEY, normalizeAppLanguage(language));
}

export function persistStudyLanguage(language) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STUDY_LANGUAGE_KEY, normalizeStudyLanguage(language));
}
