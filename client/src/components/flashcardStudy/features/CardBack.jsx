// src/features/flashcards/CardBack.jsx
import React from 'react';
import styles from './CardBack.module.css';
import PwaCardHeader from './PwaCardHeader';
import {
    getCardTitle,
    getDefinitionStudyTerm,
    getMeaningConnector,
    getReferenceExampleText,
    getReferenceMeaning,
    getStudyExampleText,
    isLearningEnglish,
} from './cardLanguageUtils';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function HighlightedExample({ text, term }) {
    const content = text || '';
    const highlight = term?.split(' / ')[0]?.trim();
    if (!highlight) return <>"{content}" </>;

    const pattern = new RegExp(`\\b(${escapeRegExp(highlight)})\\b`, 'gi');
    const parts = content.split(pattern);

    return (
        <>
            "
            {parts.map((part, index) => (
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <strong key={`${part}-${index}`}>{part}</strong>
                ) : (
                    <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
                )
            ))}
            "{' '}
        </>
    );
}

function CardBack({ cardData, activeForm, currentLanguage, imageUrl, onConjugationSelect }) {
    const getDisplayDefinitions = () => {
        if (activeForm === 'v1' || !cardData.irregular) {
            return {
                name: cardData.name,
                definitions: cardData.definitions || []
            };
        }
        if (activeForm === 'v2' && cardData.irregular?.past) {
            const past = cardData.irregular.past;
            const defs = Array.isArray(past.definitions) ? past.definitions : (past.usage_example ? [{
                usage_example: past.usage_example,
                usage_example_es: past.usage_example_es,
                meaning: past.meaning || `Pasado de ${cardData.name}`
            }] : []);
            return {
                name: past.form || cardData.name,
                definitions: defs
            };
        }
        if (activeForm === 'v3' && cardData.irregular?.participle) {
            const part = cardData.irregular.participle;
            const defs = Array.isArray(part.definitions) ? part.definitions : (part.usage_example ? [{
                usage_example: part.usage_example,
                usage_example_es: part.usage_example_es,
                meaning: part.meaning || `Participio de ${cardData.name}`
            }] : []);
            return {
                name: part.form || cardData.name,
                definitions: defs
            };
        }
        return { name: cardData.name, definitions: [] };
    };

    const displayData = getDisplayDefinitions();
    const title = getCardTitle(displayData, currentLanguage);

    return (
        <div className={styles.cardBack}>
            {imageUrl && (
                <img
                    className={styles.pwaBackImage}
                    src={imageUrl}
                    alt=""
                    aria-hidden="true"
                />
            )}
            <PwaCardHeader
                cardData={cardData}
                activeForm={activeForm}
                onConjugationSelect={onConjugationSelect}
                currentLanguage={currentLanguage}
                showConjugation={false}
            />
            {displayData.definitions?.map((def, i) => {
                const definitionTerm = getDefinitionStudyTerm(def, title, currentLanguage);

                return (
                    <div key={i} className={styles.definitionBlockBack}>
                        <p className={styles.meaningSentence}>
                            <span className={styles.phrasalVerbBack}>
                                {definitionTerm}
                            </span>{' '}
                            {getMeaningConnector(currentLanguage)}{' '}
                            <strong className={styles.meaningBack}>
                                {getReferenceMeaning(def)}
                            </strong>
                        </p>
                        <p className={styles.usageExampleEn}>
                            <HighlightedExample
                                text={getStudyExampleText(def, currentLanguage)}
                                term={definitionTerm}
                            />
                        </p>
                        {def.alternative_example && isLearningEnglish(currentLanguage) && (
                            <p className={styles.alternativeExample}>
                                <em>Alternativa:</em> "{def.alternative_example}"
                            </p>
                        )}

                        {getReferenceExampleText(def, currentLanguage) && (
                            <p className={styles.usageExampleEs}>
                                {getReferenceExampleText(def, currentLanguage)}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default CardBack;
