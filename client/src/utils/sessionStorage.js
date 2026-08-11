/**
 * Ámbito de SESIÓN en `localStorage`: qué claves existen y qué muere junto con la sesión.
 *
 * Existe para que las capas bajas no tengan que conocer conceptos de negocio: `httpClient`
 * (transporte) solo sabe "cerrar la sesión" ante un 401, no que exista un premium optimista de
 * pagos; `AuthRepository` no duplica los nombres de las claves. Si mañana otro módulo guarda
 * algo con vida de sesión, se agrega AQUÍ y todos los caminos de cierre lo heredan solos.
 *
 * Es un módulo hoja a propósito (solo depende de otros storages hoja): `AuthRepository` importa
 * `httpClient`, así que cualquier import en sentido contrario crearía un ciclo.
 */
import { clearPendingPremium } from './pendingPremiumStorage';

export const AUTH_TOKEN_KEY = 'auth_token';
export const AUTH_USER_KEY = 'auth_user';

/** Borra TODO lo que no debe sobrevivir a un cierre de sesión (explícito o forzado por 401). */
export function clearSessionScopedStorage() {
    try {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
    } catch {
        /* almacenamiento no disponible: nada que limpiar */
    }
    clearPendingPremium();
}
