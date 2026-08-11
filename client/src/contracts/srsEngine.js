/**
 * Motor SRS (SM-2 modificado). Lógica de dominio pura, sin dependencias.
 *
 * Vive en contracts/ porque lo consumen tanto flashcards (sesión de estudio,
 * SrsControls) como dashboard (sugerencia de repaso diario); ningún módulo
 * debe importarlo del otro.
 */
export const SRS_ACTIONS = Object.freeze({
    CORRECT: 'correct',
    FAIL: 'fail',
    EXPEL: 'expel',
});

export const SRS_DEFAULTS = Object.freeze({
    boxLevel: 0,
    easeFactor: 2.5,
    intervalDays: 1,
});

const DAY_MS = 86_400_000;
const MIN_EASE = 1.3;
const MAX_EASE = 5;

const asDate = (value, fallback = new Date()) => {
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date(fallback.getTime());
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundInterval = (value) => Math.max(1, Math.round(value * 100) / 100);

export function normalizeSrsState(progress = {}) {
    return {
        boxLevel: Number.isInteger(progress.box_level) ? progress.box_level : SRS_DEFAULTS.boxLevel,
        easeFactor: Number.isFinite(progress.ease_factor) ? progress.ease_factor : SRS_DEFAULTS.easeFactor,
        intervalDays: Number.isFinite(progress.interval_days) && progress.interval_days >= 1
            ? progress.interval_days
            : SRS_DEFAULTS.intervalDays,
        nextReviewAt: progress.next_review_at || null,
    };
}

/** Agenda una tarjeta elegida manualmente para que entre al próximo repaso diario. */
export function scheduleForReview(scheduledAt = new Date()) {
    return {
        box_level: SRS_DEFAULTS.boxLevel,
        ease_factor: SRS_DEFAULTS.easeFactor,
        interval_days: SRS_DEFAULTS.intervalDays,
        next_review_at: asDate(scheduledAt).toISOString(),
    };
}

/**
 * SM-2 modificado. Función pura: no consulta reloj, red ni almacenamiento.
 * El retraso concede un bono acotado al siguiente intervalo, nunca superior al 20%.
 */
export function calculateReview(previousProgress, action, reviewedAt = new Date()) {
    const previous = normalizeSrsState(previousProgress);
    const now = asDate(reviewedAt);

    if (action === SRS_ACTIONS.EXPEL) {
        return {
            box_level: 99,
            ease_factor: previous.easeFactor,
            interval_days: previous.intervalDays,
            next_review_at: null,
        };
    }

    if (action === SRS_ACTIONS.FAIL) {
        const intervalDays = 1;
        return {
            box_level: Math.max(0, previous.boxLevel - 1),
            ease_factor: clamp(previous.easeFactor - 0.2, MIN_EASE, MAX_EASE),
            interval_days: intervalDays,
            next_review_at: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
        };
    }

    if (action !== SRS_ACTIONS.CORRECT) {
        throw new TypeError(`Acción SRS desconocida: ${action}`);
    }

    const nextBox = Math.min(98, previous.boxLevel + 1);
    const dueAt = previous.nextReviewAt ? asDate(previous.nextReviewAt, now) : now;
    const overdueDays = Math.max(0, (now.getTime() - dueAt.getTime()) / DAY_MS);
    const delayRatio = overdueDays / Math.max(1, previous.intervalDays);
    const delayBonus = 1 + Math.min(0.2, delayRatio * 0.1);
    const easeFactor = clamp(previous.easeFactor + 0.05, MIN_EASE, MAX_EASE);

    let intervalDays;
    if (previous.boxLevel <= 0) intervalDays = 3;
    else if (previous.boxLevel === 1) intervalDays = 7;
    else intervalDays = previous.intervalDays * easeFactor * delayBonus;
    intervalDays = roundInterval(intervalDays);

    return {
        box_level: nextBox,
        ease_factor: Math.round(easeFactor * 100) / 100,
        interval_days: intervalDays,
        next_review_at: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
    };
}

export function calculateUrgency(candidate, now = new Date()) {
    // Registros legacy sin agenda rellenan cupos, pero nunca desplazan un repaso vencido.
    if (!candidate?.next_review_at) return Number.NEGATIVE_INFINITY;
    const current = asDate(now);
    const dueAt = asDate(candidate.next_review_at, current);
    const overdueDays = Math.max(0, (current.getTime() - dueAt.getTime()) / DAY_MS);
    const intervalDays = Number.isFinite(candidate.interval_days) && candidate.interval_days >= 1
        ? candidate.interval_days
        : SRS_DEFAULTS.intervalDays;
    return overdueDays / intervalDays;
}

/** Orden estable por urgencia descendente y limita el mazo diario. */
export function buildDailyQueue(candidates, now = new Date(), limit = 10) {
    const safeLimit = Math.min(10, Math.max(0, Math.trunc(limit)));
    return (Array.isArray(candidates) ? candidates : [])
        .map((candidate, position) => ({
            ...candidate,
            urgency: calculateUrgency(candidate, now),
            _queuePosition: position,
        }))
        .sort((a, b) => (b.urgency - a.urgency) || (a._queuePosition - b._queuePosition))
        .slice(0, safeLimit)
        .map(({ _queuePosition, ...candidate }) => candidate);
}

export const SrsEngine = Object.freeze({
    calculateReview,
    scheduleForReview,
    buildDailyQueue,
    calculateUrgency,
});
