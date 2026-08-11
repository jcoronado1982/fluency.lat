/**
 * Registro del service worker online-first (public/sw.js).
 * Única responsabilidad: registrar en producción; en dev no hay SW.
 */
export function registerPwaServiceWorker() {
    if (!('serviceWorker' in window.navigator) || !import.meta.env.PROD) return;
    window.navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch((error) => console.warn('[pwa] No se pudo registrar el service worker:', error));
}
