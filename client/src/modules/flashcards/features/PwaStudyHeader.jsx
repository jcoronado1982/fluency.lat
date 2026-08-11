import React from 'react';
import styles from './PwaStudyHeader.module.css';

/** Cabecera exclusiva de la sesión PWA: identidad mínima, sin navegación. */
export default function PwaStudyHeader() {
    return (
        <header className={styles.pwaHeader} aria-label="Fluency">
            <img src="/logo.avif" alt="Fluency" className={styles.logo} />
        </header>
    );
}
