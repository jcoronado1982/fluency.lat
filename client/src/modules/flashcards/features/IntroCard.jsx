import React from 'react';
import styles from './IntroCard.module.css';

/**
 * Carta introductoria opcional de un mazo (imagen sola, sin chrome de estudio).
 * Se muestra en vez de <Flashcard/> hasta que el usuario la descarta — no toca
 * Flashcard.jsx/CardFront.jsx/Controls.jsx (ver docs/modules/flashcards.md §Intro Card).
 */
export default function IntroCard({ imagePath, language = 'en', onContinue }) {
    const label = language === 'es' ? 'Continuar' : 'Continue';

    return (
        <div
            className={styles.container}
            role="button"
            tabIndex={0}
            onClick={onContinue}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onContinue();
            }}
            style={{ '--intro-bg-image': `url(${imagePath})` }}
        >
            <div className={styles.backdrop} aria-hidden="true" />
            <img className={styles.image} src={imagePath} alt="" />
            <button type="button" className={styles.continueButton} onClick={onContinue} aria-label={label}>
                {label}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
    );
}
