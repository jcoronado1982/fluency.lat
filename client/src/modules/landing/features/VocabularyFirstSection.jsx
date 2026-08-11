import React from 'react';
import { FiBookOpen, FiLayers, FiTarget } from 'react-icons/fi';

/**
 * VocabularyFirstSection — sección "¿Por qué aprender vocabulario?" con la
 * grilla de tarjetas argumentales.
 */
const VOCAB_FIRST_CARD_ICONS = [FiLayers, FiBookOpen, FiTarget];
const VOCAB_FIRST_CARD_ICON_TONES = ['rose', 'violet', 'rose'];

export default function VocabularyFirstSection({ t }) {
    return (
        <section className="lp-why-vocabulary-first" id="vocabulary-first">
            <div className="lp-section-inner lp-why-vocabulary-first-inner">
                <span className="lp-why-vocabulary-first-eyebrow">
                    {t.vocabularyFirstEyebrow}
                </span>
                <h2 className="lp-why-vocabulary-first-title">{t.vocabularyFirstTitle}</h2>
                <p className="lp-why-vocabulary-first-subtitle">{t.vocabularyFirstSubtitle}</p>
                <div className="lp-vocab-first-grid">
                    {t.vocabularyFirstCards.map((card, index) => {
                        const Icon = VOCAB_FIRST_CARD_ICONS[index];
                        const tone = VOCAB_FIRST_CARD_ICON_TONES[index];
                        return (
                            <article key={card.title} className="lp-vocab-first-card">
                                <div className="lp-vocab-first-card-heading">
                                    <div className={`lp-vocab-first-card-icon lp-vocab-first-card-icon--${tone}`}>
                                        <Icon aria-hidden />
                                    </div>
                                    <h3 className="lp-vocab-first-card-title">{card.title}</h3>
                                </div>
                                <p className="lp-vocab-first-card-body">{card.body}</p>
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
