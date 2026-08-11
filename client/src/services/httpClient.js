/**
 * Unified HTTP client.
 *
 * Single point that:
 *  - Reads the JWT from localStorage (set by AuthRepository on login).
 *  - Attaches `Authorization: Bearer <token>` to every request automatically.
 *  - Throws on non-2xx responses with a descriptive message.
 *
 * Usage:
 *   import { httpClient } from '../services/httpClient';
 *   const data = await httpClient.get('/api/categories');
 *   const data = await httpClient.post('/api/update-status', { user_id, … });
 */

import { API_URL } from '../config/api';
import { AUTH_TOKEN_KEY, clearSessionScopedStorage } from '../utils/sessionStorage';

function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

function buildHeaders(extra = {}) {
    const headers = { 'Content-Type': 'application/json', ...extra };
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

function buildUrl(path) {
    return path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : '/' + path}`;
}

async function parseResponse(res) {
    if (!res.ok) {
        if (res.status === 401 && getToken()) {
            // El token guardado ya no es válido (vencido o de una sesión previa) — sin esto,
            // toda la app queda fallando en silencio (categorías, mazos, progreso...) hasta que
            // el usuario adivine que debe cerrar sesión y volver a entrar.
            // Sesión cerrada de facto: se borra TODO lo de ámbito de sesión (ver
            // utils/sessionStorage.js), no solo el token — lo que sobreviva aquí lo heredaría
            // la próxima cuenta que inicie sesión en este navegador.
            clearSessionScopedStorage();
            if (typeof window !== 'undefined') {
                window.location.reload();
            }
        }
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
}

async function request(method, path, body, { signal } = {}) {
    const url = buildUrl(path);
    const options = {
        method,
        headers: buildHeaders(),
        signal,
    };
    if (body !== undefined) {
        options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    return parseResponse(res);
}

async function upload(path, formData, extraHeaders = {}) {
    const url = buildUrl(path);
    const headers = buildHeaders(extraHeaders);
    delete headers['Content-Type'];

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
    });

    return parseResponse(res);
}

export const httpClient = {
    get: (path, options) => request('GET', path, undefined, options),
    post: (path, body, options) => request('POST', path, body, options),
    delete: (path, body, options) => request('DELETE', path, body, options),
    upload,
};
