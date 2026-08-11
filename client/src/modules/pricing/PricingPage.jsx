import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    FiCheck, FiX, FiZap, FiGlobe, FiImage, FiVolume2,
    FiBook, FiLock, FiStar, FiArrowRight
} from 'react-icons/fi';
import { useUIContext } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import config from '../../config';
import { getAuthenticatedHomePath } from '../index';
import { pricingLandingSectionLink } from './config/publicNavigation';
import { getPricingPlanCards } from './config/planCatalog';
import { getPricingTranslations } from './translations';
import ShellFooter from '../../components/shell/ShellFooter';
import './PricingPage.css';

const FEATURE_ICONS = [FiBook, FiZap, FiVolume2, FiGlobe, FiImage, FiImage, FiVolume2, FiStar];

function FeatureRow({ icon, text, included, highlight, comingSoon }) {
    return (
        <li className={`pricing-feature ${included ? 'pricing-feature--included' : 'pricing-feature--excluded'} ${highlight ? 'pricing-feature--highlight' : ''} ${comingSoon ? 'pricing-feature--coming-soon' : ''}`}>
            <span className="pricing-feature-icon">
                {included ? <FiCheck /> : <FiX />}
            </span>
            <span className="pricing-feature-icon-item">{icon}</span>
            <span>{text}</span>
        </li>
    );
}

function LangToggle({ language, setLanguage }) {
    return (
        <div className="pricing-lang" role="group" aria-label="Language">
            <button
                type="button"
                className={language === 'es' ? 'is-active' : ''}
                onClick={() => setLanguage('es')}
            >ES</button>
            <span className="pricing-lang-sep" aria-hidden="true">/</span>
            <button
                type="button"
                className={language === 'en' ? 'is-active' : ''}
                onClick={() => setLanguage('en')}
            >EN</button>
        </div>
    );
}

export default function PricingPage() {
    const { language = 'en', setLanguage } = useUIContext();
    const { isAuthenticated } = useAuth();
    const location = useLocation();
    const t = getPricingTranslations(language);
    const [billing, setBilling] = useState('monthly');
    const premiumPlan = getPricingPlanCards()[billing];
    const annualBilling = billing === 'annual';

    return (
        <div className="pricing-page">
            {/* BG decoration */}
            <div className="pricing-bg-glow" aria-hidden />
            <div className="pricing-bg-blob pricing-bg-blob--1" aria-hidden />
            <div className="pricing-bg-blob pricing-bg-blob--2" aria-hidden />

            {/* NAV */}
            <header className="pricing-nav">
                <div className="pricing-nav-inner">
                    <Link to="/" className="pricing-brand">
                        <img src="/logo.avif" alt="Fluency" className="pricing-brand-logo" />
                        <span className="pricing-brand-name">Fluency</span>
                    </Link>

                    <nav className="pricing-nav-links" aria-label="Primary">
                        <Link to={pricingLandingSectionLink('demo')}>{t.nav.howItWorks}</Link>
                        <Link
                            to="/pricing"
                            className={location.pathname === '/pricing' ? 'is-active' : ''}
                        >
                            {t.nav.pricing}
                        </Link>
                        <Link to={pricingLandingSectionLink('vocabulary-first')}>{t.nav.whyVocabularyFirst}</Link>
                        <Link to={pricingLandingSectionLink('reviews')}>{t.nav.feedback}</Link>
                    </nav>

                    <div className="pricing-nav-end">
                        <LangToggle language={language} setLanguage={setLanguage} />
                        {isAuthenticated ? (
                            <Link
                                to={getAuthenticatedHomePath(config, [])}
                                className="pricing-btn--nav"
                            >
                                {t.nav.app}
                            </Link>
                        ) : (
                            <>
                                <Link to="/login" className="pricing-nav-login">
                                    {t.nav.login}
                                </Link>
                                <Link to="/login" className="pricing-btn--nav">
                                    {t.nav.signupShort}
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main>
                {/* HERO */}
                <section className="pricing-hero">
                    <h1 className="pricing-title">
                        <span className="pricing-title-line1">{t.hero.title1}</span>
                        <span className="pricing-title-line2">{t.hero.title2}</span>
                    </h1>
                    <p className="pricing-subtitle">{t.hero.subtitle}</p>

                    {/* Billing toggle */}
                    <div className="pricing-toggle" role="group" aria-label={t.hero.title1}>
                        <button
                            type="button"
                            className={billing === 'monthly' ? 'is-active' : ''}
                            onClick={() => setBilling('monthly')}
                        >
                            {t.hero.monthly}
                        </button>
                        <button
                            type="button"
                            className={billing === 'annual' ? 'is-active' : ''}
                            onClick={() => setBilling('annual')}
                        >
                            {t.hero.annual}
                            <span className="pricing-toggle-badge">{t.hero.save}</span>
                        </button>
                    </div>
                </section>

                {/* CARDS */}
                <section className="pricing-cards-section">
                    <div className="pricing-cards">

                        {/* FREE */}
                        <div className="pricing-card pricing-card--free">
                            <div className="pricing-card-header">
                                <p className="pricing-plan-name">{t.free.name}</p>
                                <p className="pricing-plan-tagline">{t.free.tagline}</p>
                                <div className="pricing-price">
                                    <span className="pricing-price-amount">$0</span>
                                </div>
                                <p className="pricing-price-label">{t.free.label}</p>
                            </div>
                            <Link to="/login" className="pricing-card-btn pricing-card-btn--free">
                                {t.free.btn}
                            </Link>
                            <ul className="pricing-features">
                                {t.features.free.map((f, i) => (
                                    <FeatureRow key={i} icon={React.createElement(FEATURE_ICONS[i] || FiStar)} {...f} />
                                ))}
                            </ul>
                        </div>

                        {/* PREMIUM */}
                        <div className="pricing-card pricing-card--premium">
                            <div className="pricing-card-badge">
                                <FiZap size={12} />
                                {t.premium.badge}
                            </div>
                            <div className="pricing-card-header">
                                <p className="pricing-plan-name">{t.premium.name}</p>
                                <p className="pricing-plan-tagline">{t.premium.tagline}</p>
                                <div className="pricing-price">
                                    <span className="pricing-price-currency">$</span>
                                    <span className="pricing-price-amount">
                                        {annualBilling ? premiumPlan.monthlyEquivalent : premiumPlan.premiumPrice}
                                    </span>
                                    <span className="pricing-price-period">{t.premium.monthlyPeriod}</span>
                                </div>
                                <p className="pricing-price-label">
                                    {annualBilling ? t.premium.labelAnnual : t.premium.labelMonth}
                                </p>
                            </div>
                            <Link to={`/checkout?billing=${billing}`} className="pricing-card-btn pricing-card-btn--premium">
                                {t.premium.btn} <FiArrowRight size={16} />
                            </Link>
                            <p className="pricing-card-cancel">{t.premium.cancelAnytime}</p>
                            <ul className="pricing-features">
                                {t.features.premium.map((f, i) => (
                                    <FeatureRow key={i} icon={React.createElement(FEATURE_ICONS[i] || FiStar)} {...f} />
                                ))}
                            </ul>
                        </div>
                    </div>

                    <p className="pricing-disclaimer">
                        {t.disclaimer}
                    </p>
                </section>

                {/* COMPARISON TABLE */}
                <section className="pricing-comparison">
                    <div className="pricing-comparison-inner">
                        <h2 className="pricing-comparison-title">{t.comparison.title}</h2>
                        <div className="pricing-table-wrap">
                        <div className="pricing-table-wrapper">
                            <table className="pricing-table">
                                <thead>
                                    <tr>
                                        <th>{t.comparison.feature}</th>
                                        <th>{t.comparison.free}</th>
                                        <th className="pricing-table-premium-col">
                                            <FiZap size={14} /> {t.comparison.premium}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {t.comparison.rows.map((row, i) => (
                                        <tr key={i}>
                                            <td>{row.feature}</td>
                                            <td>
                                                {typeof row.free === 'boolean'
                                                    ? (row.free
                                                        ? <FiCheck className="pricing-table-check" />
                                                        : <FiX className="pricing-table-x" />)
                                                    : row.free}
                                            </td>
                                            <td className="pricing-table-premium-col">
                                                {typeof row.premium === 'boolean'
                                                    ? (row.premium
                                                        ? <FiCheck className="pricing-table-check" />
                                                        : <FiX className="pricing-table-x" />)
                                                    : <strong>{row.premium}</strong>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </div>
                    </div>
                </section>

                {/* WHY PREMIUM */}
                <section className="pricing-why">
                    <div className="pricing-why-inner">
                        <h2>{t.why.title}</h2>
                        <div className="pricing-why-grid-wrap">
                        <div className="pricing-why-grid">
                            <div className="pricing-why-card">
                                <FiStar className="pricing-why-icon" />
                                <h3>{t.why.c1Title}</h3>
                                <p>{t.why.c1Desc}</p>
                            </div>
                            <div className="pricing-why-card">
                                <FiImage className="pricing-why-icon" />
                                <h3>{t.why.c2Title}</h3>
                                <p>{t.why.c2Desc}</p>
                            </div>
                            <div className="pricing-why-card">
                                <FiGlobe className="pricing-why-icon" />
                                <h3>{t.why.c3Title}</h3>
                                <p>{t.why.c3Desc}</p>
                            </div>
                            <div className="pricing-why-card">
                                <FiVolume2 className="pricing-why-icon" />
                                <h3>{t.why.c4Title}</h3>
                                <p>{t.why.c4Desc}</p>
                            </div>
                        </div>
                        </div>
                    </div>
                </section>

                {/* CTA BOTTOM */}
                <section className="pricing-cta-bottom">
                    <div className="pricing-cta-bottom-inner">
                        <FiLock size={32} className="pricing-cta-lock" />
                        <h2>{t.cta.title}</h2>
                        <p>{t.cta.subtitle}</p>
                        <div className="pricing-cta-actions">
                            <Link to="/login" className="pricing-btn pricing-btn--primary">
                                {t.cta.btnFree}
                            </Link>
                            <Link to={`/checkout?billing=${billing}`} className="pricing-btn pricing-btn--outline">
                                {t.cta.btnPremium} <FiArrowRight size={16} />
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <ShellFooter
                variant="landing"
                labels={{
                    documentation: t.footer.documentation,
                    portfolio: t.footer.portfolio,
                    github: t.footer.github,
                }}
            />
        </div>
    );
}
