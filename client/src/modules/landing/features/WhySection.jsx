import React from 'react';
import { Link } from 'react-router-dom';
import { FiBookOpen, FiImage, FiTrendingUp, FiZap } from 'react-icons/fi';

/**
 * WhySection — sección "por qué Fluency" (grilla de highlights) + CTA final
 * de registro con sus sellos de confianza.
 */
export default function WhySection({ t }) {
    return (
        <section className="lp-why" id="why">
            <div className="lp-section-inner lp-why-inner">
                <span className="lp-why-eyebrow">{t.whyEyebrow}</span>
                <h2 className="lp-why-title">{t.whyTitle}</h2>
                <p className="lp-why-subtitle">{t.whySubtitle}</p>
                <div className="lp-why-grid-wrap">
                    <div className="lp-why-grid">
                        <article className="lp-why-card">
                            <div className="lp-why-card-icon lp-why-card-icon--rose">
                                <FiBookOpen aria-hidden />
                            </div>
                            <div className="lp-why-card-body">
                                <h3>{t.highlightWords}</h3>
                                <p>{t.highlightWordsDesc}</p>
                            </div>
                        </article>
                        <article className="lp-why-card">
                            <div className="lp-why-card-icon lp-why-card-icon--violet">
                                <FiZap aria-hidden />
                            </div>
                            <div className="lp-why-card-body">
                                <h3>{t.highlightStreak}</h3>
                                <p>{t.highlightStreakDesc}</p>
                            </div>
                        </article>
                        <article className="lp-why-card">
                            <div className="lp-why-card-icon lp-why-card-icon--rose">
                                <FiTrendingUp aria-hidden />
                            </div>
                            <div className="lp-why-card-body">
                                <h3>{t.highlightCefr}</h3>
                                <p>{t.highlightCefrDesc}</p>
                            </div>
                        </article>
                        <article className="lp-why-card">
                            <div className="lp-why-card-icon lp-why-card-icon--rose">
                                <FiImage aria-hidden />
                            </div>
                            <div className="lp-why-card-body">
                                <h3>{t.highlightAi}</h3>
                                <p>{t.highlightAiDesc}</p>
                            </div>
                        </article>
                    </div>
                </div>

                <div className="lp-why-cta-tail">
                    <span className="lp-why-cta-eyebrow">{t.ctaBottomEyebrow}</span>
                    <h2 className="lp-why-cta-title">{t.ctaBottomTitle}</h2>
                    <p className="lp-why-cta-sub">{t.ctaBottomSub}</p>
                    <Link to="/login" className="lp-btn lp-btn--cta">{t.ctaSignup}</Link>
                    <div className="lp-why-cta-trust">
                        <span>{t.trustFree}</span>
                        <span className="lp-why-cta-trust-sep" aria-hidden>·</span>
                        <span>{t.trustNoCard}</span>
                        <span className="lp-why-cta-trust-sep" aria-hidden>·</span>
                        <span>{t.trustCancel}</span>
                    </div>
                </div>
            </div>
        </section>
    );
}
