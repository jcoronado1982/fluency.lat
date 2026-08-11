import React, { useState } from 'react';
import { LuBookOpen, LuCheck, LuLanguages, LuLayers, LuLayoutDashboard } from 'react-icons/lu';
import styles from './PwaBottomDock.module.css';

const COPY = {
    es: {
        dashboard: 'Inicio',
        study: 'Estudiar',
        categories: 'Categorías',
        language: 'Idioma',
        studyLanguage: 'Idioma de estudio',
        english: 'Inglés',
        spanish: 'Español',
        navigation: 'Navegación de la aplicación',
        close: 'Cerrar',
    },
    en: {
        dashboard: 'Home',
        study: 'Study',
        categories: 'Categories',
        language: 'Language',
        studyLanguage: 'Study language',
        english: 'English',
        spanish: 'Spanish',
        navigation: 'App navigation',
        close: 'Close',
    },
};

/**
 * Barra de navegación inferior de la PWA instalada (patrón app nativa:
 * pestañas fijas de ancho completo, superficie sólida, estado activo por
 * ruta). Presentacional: recibe destino activo y callbacks, sin conocer
 * rutas ni contextos.
 */
export default function PwaBottomDock({
    language = 'en',
    studyLanguage = 'en',
    activeTab = null,
    showDashboard = true,
    onDashboard,
    onStudy,
    onCatalog,
    onStudyLanguageChange,
}) {
    const t = COPY[language] ?? COPY.en;
    const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false);

    const selectStudyLanguage = (nextLanguage) => {
        onStudyLanguageChange?.(nextLanguage);
        setIsLanguageSheetOpen(false);
    };

    const languageOptions = [
        { id: 'en', label: t.english },
        { id: 'es', label: t.spanish },
    ];

    return (
        <div className={styles.navRoot}>
            {isLanguageSheetOpen && (
                <>
                    <button
                        type="button"
                        className={styles.sheetBackdrop}
                        aria-label={t.close}
                        onClick={() => setIsLanguageSheetOpen(false)}
                    />
                    <div className={styles.languageSheet} role="group" aria-label={t.studyLanguage}>
                        <p className={styles.sheetTitle}>{t.studyLanguage}</p>
                        {languageOptions.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                className={`${styles.sheetOption} ${studyLanguage === option.id ? styles.selectedOption : ''}`}
                                onClick={() => selectStudyLanguage(option.id)}
                                aria-pressed={studyLanguage === option.id}
                            >
                                <span>{option.label}</span>
                                {studyLanguage === option.id && <LuCheck aria-hidden="true" />}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <nav className={styles.navBar} aria-label={t.navigation}>
                {showDashboard && (
                    <button
                        type="button"
                        className={`${styles.navItem} ${activeTab === 'dashboard' ? styles.active : ''}`}
                        onClick={onDashboard}
                        aria-current={activeTab === 'dashboard' ? 'page' : undefined}
                    >
                        <span className={styles.navIconWrap}>
                            <LuLayoutDashboard aria-hidden="true" />
                        </span>
                        <span>{t.dashboard}</span>
                    </button>
                )}
                <button
                    type="button"
                    className={`${styles.navItem} ${activeTab === 'study' ? styles.active : ''}`}
                    onClick={onStudy}
                    aria-current={activeTab === 'study' ? 'page' : undefined}
                >
                    <span className={styles.navIconWrap}>
                        <LuBookOpen aria-hidden="true" />
                    </span>
                    <span>{t.study}</span>
                </button>
                <button type="button" className={styles.navItem} onClick={onCatalog}>
                    <span className={styles.navIconWrap}>
                        <LuLayers aria-hidden="true" />
                    </span>
                    <span>{t.categories}</span>
                </button>
                <button
                    type="button"
                    className={`${styles.navItem} ${isLanguageSheetOpen ? styles.active : ''}`}
                    onClick={() => setIsLanguageSheetOpen((isOpen) => !isOpen)}
                    aria-expanded={isLanguageSheetOpen}
                >
                    <span className={styles.navIconWrap}>
                        <LuLanguages aria-hidden="true" />
                    </span>
                    <span>{t.language}</span>
                </button>
            </nav>
        </div>
    );
}
