import React from 'react';
import styles from './LanguageSelector.module.css';

const LanguageSelector = ({
    currentLanguage,
    onLanguageChange,
    variant = 'interface',
    ariaLabel,
}) => {
    const indicatorClass = variant === 'study' ? styles.indicatorStudy : styles.indicator;

    return (
        <div className={styles.container} role="group" aria-label={ariaLabel}>
            <button
                type="button"
                className={`${styles.option} ${currentLanguage === 'es' ? styles.active : ''}`}
                onClick={() => onLanguageChange('es')}
            >
                ES
            </button>
            <span className={styles.separator}>/</span>
            <button
                type="button"
                className={`${styles.option} ${currentLanguage === 'en' ? styles.active : ''}`}
                onClick={() => onLanguageChange('en')}
            >
                EN
            </button>
            <div
                className={indicatorClass}
                style={{
                    left: currentLanguage === 'es' ? '15%' : '65%',
                }}
            />
        </div>
    );
};

export default LanguageSelector;
