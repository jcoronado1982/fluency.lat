import React, { useEffect } from 'react';
import styles from './Controls.module.css';
import { getStudyCardControlLabels } from '../studyCardTranslations';
import { useUIContext } from '../../../context/UIContext';
import { useFlashcardContext } from '../context/flashcardStudyContext';

function Controls() {
    const { language = 'en' } = useUIContext();
    const {
        prevCard, nextCard, markAsLearned, resetDeck,
        currentIndex, filteredData, currentDeckName, isLandingDemo,
    } = useFlashcardContext();

    const t = getStudyCardControlLabels(language);
    const totalCards = filteredData.length;
    // Imagen y audio se cancelan al abandonar la tarjeta; nunca deben bloquear
    // anterior/siguiente ni marcar aprendida.
    const isBusy = totalCards === 0;
    const isResetDisabled = !currentDeckName;

    useEffect(() => {
        const handleKeyDown = (e) => {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
            if (document.querySelector('[data-onboarding-tour="true"]')) return;
            if (isBusy) return;

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prevCard();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                nextCard();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [prevCard, nextCard, isBusy]);

    const formatName = (name) => {
        if (!name) return '';
        const cleanName = name.replace(/^\d+\s*/, '');
        const spacedName = cleanName.replace(/[_-]/g, ' ');
        return spacedName.charAt(0).toUpperCase() + spacedName.slice(1);
    };

    return (
        <div
            className={styles.controlsWrapper}
            data-variant={isLandingDemo ? 'demo' : 'app'}
            data-state={isBusy ? 'busy' : 'ready'}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            data-tour="panel-controles"
        >
            <div className={styles.controls}>
                <button className={styles.prevCardBtn} onClick={prevCard} disabled={isBusy} title={t.prev} data-tour="boton-anterior-tarjeta" aria-label={t.prev}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <button className={styles.resetButton} onClick={resetDeck} disabled={isResetDisabled} title={`${t.reset}: ${currentDeckName ? formatName(currentDeckName) : ''}`} data-tour="boton-reiniciar-bloque" aria-label={t.reset}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                </button>
                <div className={styles.cardCounter} data-tour="boton-contador-tarjetas" aria-live="polite">
                    {totalCards > 0 ? `${currentIndex + 1} / ${totalCards}` : '0 / 0'}
                </div>
                <button className={styles.correctButton} onClick={markAsLearned} disabled={isBusy} title={t.correct} data-tour="boton-marcar-aprendida" aria-label={t.correct}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
                <button className={styles.nextCardBtn} onClick={nextCard} disabled={isBusy} title={t.next} data-tour="boton-siguiente-tarjeta" aria-label={t.next}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
            </div>
        </div>
    );
}

export default Controls;
