import React, { useMemo } from 'react';
import { getInitialInterfaceLanguage } from '../../utils/browserLanguage';
import PwaNotice from './PwaNotice';
import styles from './InstallPrompt.module.css';

const COPY = {
    es: {
        install: 'Instala Fluency para abrirla como una app.',
        installAction: 'Instalar',
        iosInstall: 'En iPhone: pulsa Compartir y luego “Añadir a pantalla de inicio”.',
        close: 'Cerrar',
    },
    en: {
        install: 'Install Fluency to open it like an app.',
        installAction: 'Install',
        iosInstall: 'On iPhone: tap Share, then “Add to Home Screen”.',
        close: 'Close',
    },
};

/**
 * Aviso de instalación de la PWA. `mode` viene de useInstallPrompt:
 * 'native' muestra el botón de instalar; 'ios' solo la instrucción manual.
 */
export default function InstallPrompt({ mode, onInstall, onDismiss }) {
    const copy = useMemo(() => COPY[getInitialInterfaceLanguage()] ?? COPY.en, []);
    return (
        <PwaNotice>
            <p>{mode === 'ios' ? copy.iosInstall : copy.install}</p>
            <div className={styles.actions}>
                {mode === 'native' && (
                    <button type="button" className={styles.primaryAction} onClick={onInstall}>
                        {copy.installAction}
                    </button>
                )}
                <button type="button" className={styles.secondaryAction} onClick={onDismiss}>
                    {copy.close}
                </button>
            </div>
        </PwaNotice>
    );
}
