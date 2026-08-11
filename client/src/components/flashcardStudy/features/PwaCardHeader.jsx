import React from 'react';
import PwaConjugationNav from './PwaConjugationNav';
import { isLearningEnglish } from './cardLanguageUtils';
import styles from './PwaCardHeader.module.css';

/** Header visual exclusivo de PWA: cristal uniforme, logo y formas verbales. */
export default function PwaCardHeader({
    cardData,
    activeForm,
    onConjugationSelect,
    currentLanguage,
    isLandingDemo = false,
    showConjugation = true,
}) {
    if (isLandingDemo) return null;

    const visualLayout = showConjugation && cardData?.irregular && isLearningEnglish(currentLanguage)
        ? 'conjugation'
        : 'standard';

    return (
        <header className={styles.pwaCardHeader} data-layout={visualLayout} aria-label="Fluency">
            <div className={styles.headerGlass} aria-hidden="true" />
            <img src="/logo.avif" alt="Fluency" className={styles.logo} />
            {showConjugation && (
                <PwaConjugationNav
                    cardData={cardData}
                    activeForm={activeForm}
                    onConjugationSelect={onConjugationSelect}
                    currentLanguage={currentLanguage}
                    isLandingDemo={isLandingDemo}
                />
            )}
        </header>
    );
}
