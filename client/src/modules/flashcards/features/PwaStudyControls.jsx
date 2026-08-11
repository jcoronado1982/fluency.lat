import React from 'react';
import { LuCheck, LuRotateCcw } from 'react-icons/lu';
import { useUIContext } from '../../../context/UIContext';
import { useFlashcardContext } from '../../../components/flashcardStudy/context/flashcardStudyContext';
import styles from './PwaStudyControls.module.css';

/** Acciones táctiles exclusivas de PWA; el cambio de tarjeta se hace por swipe. */
export default function PwaStudyControls() {
    const { language = 'en', studyLanguage = 'en' } = useUIContext();
    const {
        currentIndex,
        currentCard,
        filteredData,
        currentDeckName,
        resetDeck,
        markAsLearned,
    } = useFlashcardContext();

    const totalCards = filteredData.length;
    const isBusy = totalCards === 0;
    const visualLayout = currentCard?.irregular && studyLanguage === 'en'
        ? 'conjugation'
        : 'standard';

    return (
        <div
            className={styles.pwaControls}
            data-layout={visualLayout}
            data-tour="panel-controles-pwa"
            onTouchStart={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
        >
            <button
                type="button"
                className={styles.secondaryAction}
                onClick={resetDeck}
                disabled={!currentDeckName}
                aria-label={language === 'es' ? 'Reiniciar bloque' : 'Reset deck'}
            >
                <LuRotateCcw aria-hidden="true" />
            </button>

            <span className={styles.progress} aria-live="polite">
                {totalCards > 0 ? `${currentIndex + 1} / ${totalCards}` : '0 / 0'}
            </span>

            <button
                type="button"
                className={styles.primaryAction}
                onClick={markAsLearned}
                disabled={isBusy}
                aria-label={language === 'es' ? 'Marcar como aprendida' : 'Mark as learned'}
            >
                <LuCheck aria-hidden="true" />
            </button>
        </div>
    );
}
