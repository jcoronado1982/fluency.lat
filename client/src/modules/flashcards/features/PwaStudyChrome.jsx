import React from 'react';
import nounsImage from '../../../assets/Nouns.png';
import verbsImage from '../../../assets/Verbs.png';
import adjectivesImage from '../../../assets/Adjectives.png';
import adverbsImage from '../../../assets/Adverb.png';
import prepositionsImage from '../../../assets/Preposition.png';
import pronounsImage from '../../../assets/Pronouns.png';
import connectorsImage from '../../../assets/Connectors.png';
import determinantImage from '../../../assets/Determinant.png';
import phrasalVerbsImage from '../../../assets/Phrasal Verbs.png';
import styles from './PwaStudyChrome.module.css';

const CATEGORY_IMAGES = {
    nouns: nounsImage,
    verbs: verbsImage,
    adjectives: adjectivesImage,
    adverbs: adverbsImage,
    preposition: prepositionsImage,
    pronouns: pronounsImage,
    connectors: connectorsImage,
    determinant: determinantImage,
    phrasal_verbs: phrasalVerbsImage,
};

const COPY = {
    es: {
        suggestedDecks: 'Otros mazos para ti',
        open: 'ABRIR',
    },
    en: {
        suggestedDecks: 'More decks for you',
        open: 'OPEN',
    },
};

/**
 * Estante de acceso rápido a otros mazos exclusivo de la sesión instalada como PWA.
 * La barra de navegación inferior vive en el shell (PwaShellNavigation).
 * CSS mantiene este bloque fuera del layout en navegador normal.
 */
export default function PwaStudyChrome({
    language = 'en',
    recommendations = [],
    onOpenRecommendation,
    hideShelf = false,
}) {
    const t = COPY[language] ?? COPY.en;
    return (
        <div className={styles.pwaOnly}>
            <section
                className={styles.continueSection}
                aria-labelledby="pwa-suggested-decks-title"
                hidden={hideShelf}
            >
                <h2 id="pwa-suggested-decks-title">{t.suggestedDecks}</h2>
                <div className={styles.recommendationRail}>
                    {recommendations.map((item) => (
                        <button
                            key={`${item.category}-${item.deckName}`}
                            type="button"
                            className={styles.recommendationCard}
                            onClick={() => onOpenRecommendation?.(item)}
                        >
                            <span className={styles.recommendationCategory}>{item.categoryLabel}</span>
                            <span className={styles.recommendationImageWrap}>
                                <img
                                    src={item.firstImagePath || CATEGORY_IMAGES[item.category] || nounsImage}
                                    alt=""
                                    aria-hidden="true"
                                />
                                <span>{item.levelId}</span>
                            </span>
                            <strong>{item.deckLabel || item.deckName}</strong>
                            <span className={styles.recommendationAction}>{t.open}</span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}
