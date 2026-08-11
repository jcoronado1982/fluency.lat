import { useEffect } from 'react';
import { registerPwaServiceWorker } from './registerServiceWorker';
import { useOnlineStatus } from './useOnlineStatus';
import { useInstallPrompt } from './useInstallPrompt';
import OfflineNotice from './OfflineNotice';
import InstallPrompt from './InstallPrompt';

/**
 * Orquestador de la experiencia PWA online-first: registra el service
 * worker y decide qué aviso mostrar (offline tiene prioridad sobre la
 * invitación a instalar). Cada pieza vive en su propio archivo:
 * registerServiceWorker, useOnlineStatus, useInstallPrompt y los avisos.
 */
export default function PwaExperience() {
    const isOnline = useOnlineStatus();
    const { promptMode, requestInstall, dismissInstall } = useInstallPrompt();

    useEffect(() => {
        registerPwaServiceWorker();
    }, []);

    if (!isOnline) return <OfflineNotice />;

    if (promptMode) {
        return (
            <InstallPrompt
                mode={promptMode}
                onInstall={requestInstall}
                onDismiss={dismissInstall}
            />
        );
    }

    return null;
}
