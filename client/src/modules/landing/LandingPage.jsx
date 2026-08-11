import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import config from '../../config';
import { getAuthenticatedHomePath } from '../index';
import { getLandingTranslations } from './config/translations';
import PageLoader from '../../components/common/PageLoader';
import ShellFooter from '../../components/shell/ShellFooter';
import LandingNav from './features/LandingNav';
import LandingHero from './features/LandingHero';
import FeedbackSection from './features/FeedbackSection';
import VocabularyFirstSection from './features/VocabularyFirstSection';
import WhySection from './features/WhySection';
import { hasDemoFeedbackReturn } from '../../utils/demoFeedbackStorage';
import useDocumentMeta from '../../hooks/useDocumentMeta';
import {
    isLandingSectionHash,
    scrollToLandingSection,
} from './landingSections';
import './LandingPage.css';

/**
 * LandingPage — orquestador: guards de auth, scroll por hash, nav activo y
 * composición de las secciones. Cada sección vive en ./features/ con su
 * propia responsabilidad; para reordenar la página basta mover las líneas
 * del JSX de abajo.
 */
function useLandingNavActive() {
    const [active, setActive] = useState('how-it-works');

    useEffect(() => {
        const howItWorks = document.getElementById('how-it-works');
        const vocabularyFirst = document.getElementById('vocabulary-first');
        const reviews = document.getElementById('reviews');
        const targets = [howItWorks, vocabularyFirst, reviews].filter(Boolean);
        if (!targets.length) return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
                const id = visible[0]?.target?.id;
                if (id) setActive(id);
            },
            { rootMargin: '-35% 0px -45% 0px', threshold: [0, 0.15, 0.4, 0.7] },
        );

        targets.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const setActiveSection = useCallback((id) => setActive(id), []);

    return { active, setActiveSection };
}

export default function LandingPage() {
    const { isAuthenticated, loading, loadingStage, onboardingRequired } = useAuth();
    const { language = 'en', setLanguage } = useAppContext();
    const location = useLocation();
    const t = getLandingTranslations(language);
    const pricingEnabled = config.features.pricing !== false;
    const { active: activeNav, setActiveSection } = useLandingNavActive();
    // Congelado al montar: DemoFeedback limpia este flag de sessionStorage en
    // cuanto el POST del auto-envío tiene éxito, mientras el usuario sigue en
    // esta misma visita de landing. Si se releyera en cada render (p. ej. el
    // IntersectionObserver de scroll dispara un re-render al llegar a
    // #reviews), el guard de abajo vería el flag ya en false con
    // onboardingRequired aún en true y mandaría al usuario a /onboarding a
    // mitad del envío — justo el salto brusco a la app que no debe pasar.
    const [returningForFeedback] = useState(() => hasDemoFeedbackReturn());

    useDocumentMeta({ title: t.metaTitle, description: t.metaDescription, lang: language });

    useEffect(() => {
        if (!returningForFeedback) return;
        if (window.location.hash !== '#reviews') {
            window.location.hash = 'reviews';
        }
        const el = document.getElementById('reviews');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [returningForFeedback]);

    useLayoutEffect(() => {
        if (loading || returningForFeedback) return undefined;
        const hash = location.hash?.replace('#', '');
        if (!isLandingSectionHash(hash)) return undefined;
        setActiveSection(hash);
        return scrollToLandingSection(hash);
    }, [loading, location.hash, location.pathname, returningForFeedback, setActiveSection]);

    if (loading) {
        const copy = t.loading[loadingStage] ?? t.loading.fallback;
        return (
            <PageLoader
                className="landing-page-loader"
                title={copy.title}
                subtitle={copy.subtitle}
                status={copy.status}
                progress={copy.progress}
            />
        );
    }

    const landingSectionHash = isLandingSectionHash(location.hash);

    // Una cuenta nueva que llegó desde "Dejar comentario" debe recuperar el
    // formulario y su borrador antes de entrar al onboarding general.
    if (isAuthenticated && onboardingRequired && !returningForFeedback) {
        return <Navigate to="/onboarding" replace />;
    }

    if (isAuthenticated && !returningForFeedback && !landingSectionHash) {
        return <Navigate to={getAuthenticatedHomePath(config, [])} replace />;
    }

    return (
        <div className="lp">
            <LandingNav
                t={t}
                language={language}
                setLanguage={setLanguage}
                activeNav={activeNav}
                setActiveSection={setActiveSection}
                isAuthenticated={isAuthenticated}
                pricingEnabled={pricingEnabled}
                currentPathname={location.pathname}
                authenticatedHomePath={getAuthenticatedHomePath(config, [])}
            />

            <main>
                <div className="lp-zone-flow">
                    <LandingHero t={t} language={language} pricingEnabled={pricingEnabled} />
                </div>

                {/* Feedback + vocabulary-first + why + CTA comparten degradado */}
                <div className="lp-zone-lower">
                    <FeedbackSection language={language} />
                    <VocabularyFirstSection t={t} />
                    <WhySection t={t} />
                </div>
            </main>

            <ShellFooter
                variant="landing"
                labels={{
                    documentation: t.footerDocumentation,
                    portfolio: t.footerPortfolio,
                    github: t.footerGithub,
                }}
            />

            {/* decorative bg */}
            <div className="lp-bg-glow" aria-hidden />
            <div className="lp-bg-blob lp-bg-blob--1" aria-hidden />
            <div className="lp-bg-blob lp-bg-blob--2" aria-hidden />
        </div>
    );
}
