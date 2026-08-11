/**
 * Marca de "pago recién hecho, confirmación en camino".
 *
 * LemonSqueezy confirma el cobro por webhook, o sea de forma asíncrona: al volver del checkout
 * el rol del servidor todavía puede ser `viewer`. En vez de dejar al usuario esperando en una
 * pantalla, se le deja entrar YA como premium y la confirmación sigue en segundo plano:
 * - si el webhook confirma, manda el rol real del servidor y esta marca se borra;
 * - si la ventana expira sin confirmación (el pago no prosperó), la marca caduca sola y los
 *   permisos vuelven a lo que diga el servidor.
 *
 * Es solo optimismo de UI: el backend sigue siendo la autoridad (`require_premium_role` corta
 * cualquier operación premium real), así que esta marca nunca concede acceso de verdad.
 *
 * Debe ser MOMENTÁNEA y de UNA sola cuenta (bug real, ago 2026): la marca vivía en
 * `localStorage` sin dueño y `logout()` no la borraba, así que sobrevivía a cerrar sesión y la
 * heredaba la SIGUIENTE cuenta que iniciara sesión en ese navegador (incluido dev-guest) —
 * cualquiera veía "premium" sin haber pagado. Por eso la marca va atada al email de la cuenta
 * (`isPendingPremiumActive` exige que coincida) y `AuthContext` la borra en todo cierre de
 * sesión, explícito o forzado (401). Nunca debe sobrevivir a un logout.
 */
const PENDING_PREMIUM_KEY = 'fluency-pending-premium';

/** Momentánea a propósito: un webhook normal llega en segundos, no minutos. */
export const PENDING_PREMIUM_WINDOW_MS = 2 * 60 * 1000;

export function markPendingPremium(email, now = Date.now()) {
    if (!email) return;
    try {
        localStorage.setItem(
            PENDING_PREMIUM_KEY,
            JSON.stringify({ email, until: now + PENDING_PREMIUM_WINDOW_MS }),
        );
    } catch {
        /* almacenamiento no disponible: el flujo sigue, solo se pierde el optimismo */
    }
}

export function clearPendingPremium() {
    try {
        localStorage.removeItem(PENDING_PREMIUM_KEY);
    } catch {
        /* idem */
    }
}

/** Solo es válida para el MISMO email que la marcó y dentro de su ventana. */
export function isPendingPremiumActive(email, now = Date.now()) {
    if (!email) return false;
    try {
        const raw = localStorage.getItem(PENDING_PREMIUM_KEY);
        if (!raw) return false;
        const { email: storedEmail, until } = JSON.parse(raw);
        if (storedEmail !== email || !Number.isFinite(until) || until <= now) {
            clearPendingPremium();
            return false;
        }
        return true;
    } catch {
        clearPendingPremium();
        return false;
    }
}
