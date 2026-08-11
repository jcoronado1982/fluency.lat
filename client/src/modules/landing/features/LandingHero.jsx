import React, { useEffect, useRef, useState } from 'react';
import DemoFlashcardSession from './DemoFlashcardSession';
import DemoImagePromptPanel from './DemoImagePromptPanel';
import DemoImageCarousel from './DemoImageCarousel';
import { StarRatingDisplay } from './StarRating';
import { demoFeedbackPort } from '../composition';

const STATIC_REVIEWS_SUMMARY = { average: 5, count: null };

/**
 * LandingHero — sección hero: titular, CTA de registro y el widget demo
 * interactivo (tarjeta + panel de prompt de imagen).
 * SRP: es dueña del estado del prompt del demo; la página no lo conoce.
 */
export default function LandingHero({ t, language, pricingEnabled }) {
    const demoPromptExtraRef = useRef('');
    const [demoImagePromptApply, setDemoImagePromptApply] = useState(0);
    const [demoSelection, setDemoSelection] = useState(null);
    const [reviewsSummary, setReviewsSummary] = useState(STATIC_REVIEWS_SUMMARY);

    useEffect(() => {
        let cancelled = false;
        demoFeedbackPort.fetchRecent(1)
            .then((data) => {
                if (cancelled) return;
                const summary = data?.summary;
                if (summary && summary.count > 0) {
                    setReviewsSummary({ average: summary.average, count: summary.count });
                }
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const handleCarouselImageSelect = (image) => {
        setDemoSelection({
            cardId: image.cardId,
            defIndex: image.defIndex,
            form: image.form,
            requestId: Date.now(),
        });
        document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    return (
        <section className="lp-hero" id="how-it-works">
            <div className="lp-section-inner lp-hero-inner">
                <div className="lp-hero-copy">
                    <h1 className="lp-hero-title">
                        <span className="lp-hero-title-line1">{t.heroTitleLine1}</span>
                        <span className="lp-hero-title-line2">
                            {t.heroTitleFrom}{' '}{t.heroTitleAccent}
                        </span>
                    </h1>
                    <p className="lp-hero-sub">
                        <span>{t.heroSubtitleLine1}</span>
                        <span className="lp-hero-sub-closing">{t.heroSubtitleLine2}</span>
                    </p>
                    <div className="lp-hero-cta">
                        <a href="#demo" className="lp-btn lp-hero-demo-link">{t.ctaTryDemo}</a>
                        <span className="lp-hero-cta-note">{t.heroCtaNote}</span>
                    </div>

                    <a href="#reviews" className="lp-hero-social-proof">
                        <StarRatingDisplay
                            value={reviewsSummary.average}
                            size="sm"
                            label={`${reviewsSummary.average.toFixed(1)}/5`}
                        />
                        <span className="lp-hero-social-proof-text">
                            {reviewsSummary.average.toFixed(1)} — {t.heroReviewsLinkText}
                        </span>
                    </a>
                </div>

                <div className="lp-hero-demo lp-demo-widget" id="demo">
                    <DemoImagePromptPanel
                        promptRef={demoPromptExtraRef}
                        onApply={() => setDemoImagePromptApply((n) => n + 1)}
                        t={t}
                        collapsible
                    />
                    <DemoFlashcardSession
                        language={language}
                        badgeLabel={t.demoInteractiveBadge}
                        promptExtraRef={demoPromptExtraRef}
                        imagePromptApplySignal={demoImagePromptApply}
                        demoSelection={demoSelection}
                    />
                </div>
            </div>

            <DemoImageCarousel
                t={t}
                pricingEnabled={pricingEnabled}
                onSelectImage={handleCarouselImageSelect}
            />
        </section>
    );
}
