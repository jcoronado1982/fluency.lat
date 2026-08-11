export const LAST_CATEGORY_KEY = 'flashcards_last_category';
export const LAST_DECK_KEY_PREFIX = 'flashcards_last_deck_';
export const RESUME_SESSION_KEY = 'flashcards_resume_session';
export const RECENTLY_FINISHED_DECK_KEY = 'flashcards_recently_finished_deck';

export function readResumeSession() {
    try {
        const raw = localStorage.getItem(RESUME_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.category || !parsed?.deck) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function writeResumeSession(session) {
    if (!session?.category || !session?.deck) return;
    localStorage.setItem(RESUME_SESSION_KEY, JSON.stringify({
        ...session,
        updatedAt: Date.now(),
    }));
}

export function clearResumeSession() {
    localStorage.removeItem(RESUME_SESSION_KEY);
}
