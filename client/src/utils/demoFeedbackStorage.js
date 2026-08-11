/** Contrato shell: persistencia de borrador de feedback del demo (login → landing). */
export const DEMO_FEEDBACK_DRAFT_KEY = 'lp-demo-feedback-draft';
export const DEMO_FEEDBACK_RETURN_KEY = 'lp-demo-feedback-return';

export function markDemoFeedbackReturn() {
    sessionStorage.setItem(DEMO_FEEDBACK_RETURN_KEY, '1');
}

export function hasDemoFeedbackReturn() {
    return sessionStorage.getItem(DEMO_FEEDBACK_RETURN_KEY) === '1';
}

export function clearDemoFeedbackReturn() {
    sessionStorage.removeItem(DEMO_FEEDBACK_RETURN_KEY);
}

export function saveDemoFeedbackDraft({ comment = '', rating = 0 } = {}) {
    sessionStorage.setItem(DEMO_FEEDBACK_DRAFT_KEY, JSON.stringify({ comment, rating }));
    markDemoFeedbackReturn();
}

export function consumeDemoFeedbackDraft() {
    const raw = sessionStorage.getItem(DEMO_FEEDBACK_DRAFT_KEY);
    sessionStorage.removeItem(DEMO_FEEDBACK_DRAFT_KEY);
    if (!raw) return { comment: '', rating: 0 };
    try {
        const parsed = JSON.parse(raw);
        return {
            comment: typeof parsed.comment === 'string' ? parsed.comment : raw,
            rating: Number(parsed.rating) || 0,
        };
    } catch {
        return { comment: raw, rating: 0 };
    }
}
