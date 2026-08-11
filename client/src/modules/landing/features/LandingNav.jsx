import React from 'react';
import { Link } from 'react-router-dom';

/**
 * LandingNav — barra superior de la landing: marca, links de sección,
 * selector de idioma y accesos de login/registro.
 * SRP: solo navegación; el scroll/observer de secciones vive en la página.
 */
function LangToggle({ language, setLanguage }) {
    return (
        <div className="lp-lang" role="group" aria-label="Language">
            <button
                type="button"
                className={language === 'es' ? 'is-active' : ''}
                onClick={() => setLanguage('es')}
            >ES</button>
            <span className="lp-lang-sep" aria-hidden="true">/</span>
            <button
                type="button"
                className={language === 'en' ? 'is-active' : ''}
                onClick={() => setLanguage('en')}
            >EN</button>
        </div>
    );
}

export default function LandingNav({
    t,
    language,
    setLanguage,
    activeNav,
    setActiveSection,
    isAuthenticated,
    pricingEnabled,
    currentPathname,
    authenticatedHomePath,
}) {
    return (
        <header className="lp-nav">
            <div className="lp-nav-inner">
                <Link to="/" className="lp-brand">
                    <img src="/logo.avif" alt="" className="lp-brand-logo" />
                    <span className="lp-brand-name">{t.brand}</span>
                </Link>

                <nav className="lp-nav-links" aria-label="Primary">
                    <a
                        href="#how-it-works"
                        className={activeNav === 'how-it-works' ? 'is-active' : ''}
                        onClick={() => setActiveSection('how-it-works')}
                    >
                        {t.navHowItWorks}
                    </a>
                    {pricingEnabled && (
                        <Link
                            to="/pricing"
                            className={currentPathname === '/pricing' ? 'is-active' : ''}
                        >
                            {t.navPricing}
                        </Link>
                    )}
                    <a
                        href="#vocabulary-first"
                        className={activeNav === 'vocabulary-first' ? 'is-active' : ''}
                        onClick={() => setActiveSection('vocabulary-first')}
                    >
                        {t.navWhyVocabularyFirst}
                    </a>
                    <a
                        href="#reviews"
                        className={activeNav === 'reviews' ? 'is-active' : ''}
                        onClick={() => setActiveSection('reviews')}
                    >
                        {t.navFeedback}
                    </a>
                </nav>

                <div className="lp-nav-end">
                    <LangToggle language={language} setLanguage={setLanguage} />
                    {isAuthenticated ? (
                        <Link
                            to={authenticatedHomePath}
                            className="lp-btn lp-btn--nav"
                        >
                            {t.navApp}
                        </Link>
                    ) : (
                        <>
                            <Link to="/login" className="lp-nav-login">
                                {t.navLogin}
                            </Link>
                            <Link to="/login" className="lp-btn lp-btn--nav">
                                {t.navSignupShort}
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
