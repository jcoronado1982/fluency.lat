import React from 'react';
import { isLearningEnglish } from './cardLanguageUtils';
import styles from './PwaConjugationNav.module.css';

/** Navegación v1/v2/v3 exclusiva de la tarjeta instalada como PWA. */
export default function PwaConjugationNav({
    cardData,
    activeForm,
    onConjugationSelect,
    currentLanguage,
    isLandingDemo = false,
}) {
    if (!cardData.irregular || isLandingDemo || !isLearningEnglish(currentLanguage)) return null;

    const forms = [
        { key: 'v1', form: cardData.name, phonetic: cardData.phonetic },
        { key: 'v2', form: cardData.irregular.past?.form, phonetic: cardData.irregular.past?.phonetic },
        { key: 'v3', form: cardData.irregular.participle?.form, phonetic: cardData.irregular.participle?.phonetic },
    ];

    return (
        <div className={styles.pwaNav} role="tablist" aria-label="Verb forms">
            {forms.map(({ key, form, phonetic }) => (
                <button
                    key={key}
                    type="button"
                    className={styles.formTab}
                    data-state={activeForm === key ? 'active' : 'idle'}
                    role="tab"
                    aria-selected={activeForm === key}
                    onClick={(event) => {
                        event.stopPropagation();
                        onConjugationSelect?.(key, form);
                    }}
                >
                    <span className={styles.form}>{form}</span>
                    <span className={styles.phonetic}>{phonetic}</span>
                </button>
            ))}
        </div>
    );
}
