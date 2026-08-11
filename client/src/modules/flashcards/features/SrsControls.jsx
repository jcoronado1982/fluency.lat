import React from 'react';
import { useUIContext } from '../../../context/UIContext';
import { useFlashcardContext } from '../context/FlashcardContext';
import { SRS_ACTIONS } from '../domain/SrsEngine';
import { LuCheck, LuCircleX, LuRotateCcw } from 'react-icons/lu';
import styles from './SrsControls.module.css';

export default function SrsControls() {
    const { language = 'en' } = useUIContext();
    const { reviewCard, filteredData, currentIndex } = useFlashcardContext();
    const disabled = filteredData.length === 0;
    const es = language === 'es';

    const labels = es
        ? {
            fail: 'No la sé',
            correct: 'La sé',
            remove: 'Ya la domino',
        }
        : {
            fail: "Don't know",
            correct: 'Know it',
            remove: 'Mastered',
        };

    return (
        <div className={styles.wrapper} aria-label={es ? 'Acciones de repaso' : 'Review actions'}>
            <button
                type="button"
                className={styles.fail}
                disabled={disabled}
                onClick={() => reviewCard(SRS_ACTIONS.FAIL)}
                title={es ? 'No la recuerdo; volver a programarla pronto' : 'I do not remember it; schedule it again soon'}
            >
                <LuRotateCcw aria-hidden="true" />
                <span>{labels.fail}</span>
            </button>
            <div className={styles.counter} aria-live="polite">
                {disabled ? '0 / 0' : `${currentIndex + 1} / ${filteredData.length}`}
            </div>
            <button
                type="button"
                className={styles.correct}
                disabled={disabled}
                onClick={() => reviewCard(SRS_ACTIONS.CORRECT)}
                title={es ? 'La recuerdo; aumentar el intervalo' : 'I remember it; increase the interval'}
            >
                <LuCheck aria-hidden="true" />
                <span>{labels.correct}</span>
            </button>
            <button
                type="button"
                className={styles.expel}
                disabled={disabled}
                onClick={() => reviewCard(SRS_ACTIONS.EXPEL)}
                title={es ? 'Ya la domino; quitarla de futuros repasos' : 'I have mastered it; remove it from future reviews'}
            >
                <LuCircleX aria-hidden="true" />
                <span>{labels.remove}</span>
            </button>
        </div>
    );
}
