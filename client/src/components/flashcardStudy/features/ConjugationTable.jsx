import React from 'react';
import styles from './ConjugationTable.module.css';
import { LuLoaderCircle } from 'react-icons/lu';
import { FiPlay } from 'react-icons/fi';

import { isLearningEnglish } from './cardLanguageUtils';

/**
 * ConjugationTable — responsable ÚNICAMENTE de renderizar la tabla v1/v2/v3.
 * SRP: no maneja estado de imagen ni audio global.
 */
function ConjugationTable({ cardData, activeForm, onConjugationSelect, activeAudioText, isGeneratingAudio, currentLanguage, isLandingDemo = false }) {
    if (!cardData.irregular) return null;

    const forms = [
        { key: 'v1', form: cardData.name, phonetic: cardData.phonetic },
        { key: 'v2', form: cardData.irregular.past?.form, phonetic: cardData.irregular.past?.phonetic },
        { key: 'v3', form: cardData.irregular.participle?.form, phonetic: cardData.irregular.participle?.phonetic },
    ];

    if (!isLearningEnglish(currentLanguage) && !isLandingDemo) return null;

    const handleFormSelect = (key, form) => {
        onConjugationSelect?.(key, form);
    };

    return (
        <div className={styles.conjugationTable} data-fc="conjugation">
            {forms.map(({ key, form, phonetic }) => (
                <div
                    key={key}
                    className={styles.conjugationItem}
                    data-state={activeForm === key ? 'active' : 'idle'}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleFormSelect(key, form);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleFormSelect(key, form);
                        }
                    }}
                >
                    <div className={styles.conjugationHeader}>
                        <span className={styles.conjugationForm}>{form}</span>
                        <span
                            className={`${styles.conjugationAudioBtn} ${isGeneratingAudio && activeAudioText === form ? styles.loadingAudioBtn : ''}`}
                            aria-hidden="true"
                        >
                            {isGeneratingAudio && activeAudioText === form
                                ? <LuLoaderCircle className={styles.spinner} />
                                : <FiPlay size={15} />}
                        </span>
                    </div>
                    <span className={styles.conjugationPhonetic}>{phonetic}</span>
                </div>
            ))}
        </div>
    );
}

export default ConjugationTable;
