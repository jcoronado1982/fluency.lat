import { useCallback, useEffect, useState } from 'react';

const INSTALL_DISMISS_KEY = 'fluency_pwa_install_dismissed_at';
const INSTALL_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const isStandalone = () => (
    window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true
);

const isIos = () => (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
);

const wasInstallRecentlyDismissed = () => {
    const dismissedAt = Number(window.localStorage.getItem(INSTALL_DISMISS_KEY));
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < INSTALL_DISMISS_TTL_MS;
};

/**
 * Ciclo de instalación de la PWA: captura `beforeinstallprompt`, detecta el
 * caso iOS (sin prompt nativo) y recuerda el descarte durante 7 días.
 * Devuelve el modo de aviso a mostrar ('native' | 'ios' | null) y las
 * acciones de instalar/descartar.
 */
export function useInstallPrompt() {
    const [installPrompt, setInstallPrompt] = useState(null);
    const [showIosInstall, setShowIosInstall] = useState(() => (
        isIos() && !isStandalone() && !wasInstallRecentlyDismissed()
    ));

    useEffect(() => {
        const handleInstallPrompt = (event) => {
            event.preventDefault();
            if (!isStandalone() && !wasInstallRecentlyDismissed()) {
                setInstallPrompt(event);
            }
        };
        const handleInstalled = () => {
            setInstallPrompt(null);
            setShowIosInstall(false);
            window.localStorage.removeItem(INSTALL_DISMISS_KEY);
        };

        window.addEventListener('beforeinstallprompt', handleInstallPrompt);
        window.addEventListener('appinstalled', handleInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
            window.removeEventListener('appinstalled', handleInstalled);
        };
    }, []);

    const dismissInstall = useCallback(() => {
        window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
        setInstallPrompt(null);
        setShowIosInstall(false);
    }, []);

    const requestInstall = useCallback(async () => {
        if (!installPrompt) return;
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice.catch(() => null);
        if (choice?.outcome !== 'accepted') dismissInstall();
        setInstallPrompt(null);
    }, [dismissInstall, installPrompt]);

    const promptMode = installPrompt ? 'native' : (showIosInstall ? 'ios' : null);

    return { promptMode, requestInstall, dismissInstall };
}
