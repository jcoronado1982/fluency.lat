import React from 'react';
import styles from './PwaNotice.module.css';

/**
 * Contenedor visual común de los avisos PWA (offline e instalación):
 * aside fijo, no modal, que no bloquea los controles de la app.
 */
export default function PwaNotice({ variant, children }) {
    const className = variant === 'offline'
        ? `${styles.notice} ${styles.offline}`
        : styles.notice;
    return (
        <aside className={className} role="status" aria-live="polite">
            {children}
        </aside>
    );
}
