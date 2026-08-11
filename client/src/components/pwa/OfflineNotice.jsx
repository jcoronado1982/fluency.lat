import React, { useMemo } from 'react';
import { getInitialInterfaceLanguage } from '../../utils/browserLanguage';
import PwaNotice from './PwaNotice';
import styles from './OfflineNotice.module.css';

const COPY = {
    es: { offline: 'Sin conexión. Conéctate para cargar otro mazo o contenido nuevo.' },
    en: { offline: 'You are offline. Connect to load another deck or new content.' },
};

/** Aviso de pérdida de conectividad (la app es online-first). */
export default function OfflineNotice() {
    const copy = useMemo(() => COPY[getInitialInterfaceLanguage()] ?? COPY.en, []);
    return (
        <PwaNotice variant="offline">
            <span className={styles.statusDot} aria-hidden="true" />
            <p>{copy.offline}</p>
        </PwaNotice>
    );
}
