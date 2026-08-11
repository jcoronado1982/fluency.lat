/**
 * Respaldo de la intención de navegación previa al login vía sessionStorage.
 *
 * El `state` de React Router (`<Navigate state={{from}}>`) puede perderse durante el flujo
 * externo de Google/Apple (mismo problema ya resuelto para el retorno de feedback del demo,
 * ver `demoFeedbackStorage.js`) — este util es el equivalente genérico para cualquier ruta
 * protegida que necesite volver a su destino original tras loguearse.
 */
const POST_LOGIN_REDIRECT_KEY = 'fluency-post-login-redirect';

export function markPostLoginRedirect(path) {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, path);
}

export function consumePostLoginRedirect() {
    const path = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return path;
}
