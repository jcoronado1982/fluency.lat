import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './LoginPage.css';

import config from '../config';
import { getAuthenticatedHomePath } from '../modules';
import { resolvePostLoginPath } from '../modules/routingPaths';
import { useAuth } from '../context/AuthContext';
import { useUIContext } from '../context/UIContext';
import {
    hasDemoFeedbackReturn,
    markDemoFeedbackReturn,
} from '../utils/demoFeedbackStorage';
import { consumePostLoginRedirect } from '../utils/postLoginRedirectStorage';
import { shouldShowOnboarding } from '../utils/onboardingStorage';
import PageLoader from '../components/common/PageLoader';
import ShellFooter from '../components/shell/ShellFooter';

const GOOGLE_CLIENT_ID =
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    '977952175712-i072hpkjgq51ualf0hlkgj4boa48f0mp.apps.googleusercontent.com';

const LOGIN_LOADING_COPY = {
    es: {
        title: 'Validando acceso',
        subtitle: 'Estamos preparando tu acceso.',
        status: 'Verificando tu sesión...',
    },
    en: {
        title: 'Validating access',
        subtitle: 'We are preparing your access.',
        status: 'Checking your session...',
    },
};

const LOGIN_COPY = {
    es: {
        brand: 'Fluency',
        welcome: 'Bienvenido a Fluency',
        subtitle: 'Un clic y estás dentro.',
        trust: 'Sin contraseña. Sin spam. Gratis para empezar.',
        or: 'o',
        apple: 'Continuar con Apple',
        appleSoon: 'Próximamente',
        footerDocumentation: 'Documentación',
        footerPortfolio: 'Portfolio',
        footerGithub: 'GitHub',
    },
    en: {
        brand: 'Fluency',
        welcome: 'Welcome to Fluency',
        subtitle: "One click and you're in.",
        trust: 'No password. No spam. Free to start.',
        or: 'or',
        apple: 'Sign in with Apple',
        appleSoon: 'Coming soon',
        footerDocumentation: 'Documentation',
        footerPortfolio: 'Portfolio',
        footerGithub: 'GitHub',
    },
};

function AppleIcon() {
    return (
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
    );
}

function LangToggle({ language, setLanguage }) {
    return (
        <div className="lp-lang" role="group" aria-label="Language">
            <button
                type="button"
                className={language === 'es' ? 'is-active' : ''}
                onClick={() => setLanguage('es')}
            >
                ES
            </button>
            <span className="lp-lang-sep" aria-hidden="true">/</span>
            <button
                type="button"
                className={language === 'en' ? 'is-active' : ''}
                onClick={() => setLanguage('en')}
            >
                EN
            </button>
        </div>
    );
}

const LoginPage = () => {
    const { login, loginWithApple, isAuthenticated, loading, user } = useAuth();
    const { language = 'en', setLanguage } = useUIContext();
    const navigate = useNavigate();
    const location = useLocation();
    const googleBtnRef = useRef(null);
    const callbackRef = useRef(null);
    const shellRoutes = [{ path: '/admin', enabled: config.features.admin }];
    const defaultPath = getAuthenticatedHomePath(config, shellRoutes);
    // El state de React Router puede perderse al recargar o durante el flujo
    // externo de autenticación. La marca de sessionStorage conserva la
    // intención original: este login se inició para publicar un comentario.
    const demoFeedbackReturn = Boolean(
        location.state?.demoFeedbackReturn || hasDemoFeedbackReturn(),
    );
    // Respaldo genérico (ProtectedRoute) por el mismo motivo: si `location.state.from` no
    // sobrevive al flujo de Google/Apple, esto trae de vuelta la ruta protegida original
    // (ej. `/checkout?billing=annual`). Se consume una sola vez al montar.
    const [persistedRedirect] = useState(() => consumePostLoginRedirect());
    const targetPath = useMemo(
        () => (demoFeedbackReturn
            ? { pathname: '/', hash: 'reviews' }
            : (location.state?.from || persistedRedirect || defaultPath)),
        [demoFeedbackReturn, location.state?.from, persistedRedirect, defaultPath],
    );
    const locale = language === 'es' ? 'es' : 'en';
    const loadingCopy = LOGIN_LOADING_COPY[locale];
    const loginCopy = LOGIN_COPY[locale];
    const targetState = useMemo(
        () => (demoFeedbackReturn ? { demoFeedbackReturn: true } : undefined),
        [demoFeedbackReturn],
    );

    useEffect(() => {
        // Cargar SDK de autenticación de Apple
        if (!document.getElementById('apple-auth-sdk')) {
            const script = document.createElement('script');
            script.id = 'apple-auth-sdk';
            script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
            script.async = true;
            document.body.appendChild(script);
        }
    }, []);

    const handleAppleLogin = async () => {
        if (!window.AppleID) {
            console.error('Apple SDK not loaded');
            return;
        }
        try {
            window.AppleID.auth.init({
                clientId: import.meta.env.VITE_APPLE_CLIENT_ID || 'lat.fluency.client',
                scope: 'name email',
                redirectURI: window.location.origin + '/login',
                usePopup: true,
            });
            const response = await window.AppleID.auth.signIn();
            const idToken = response.authorization.id_token;

            let userName = null;
            if (response.user && response.user.name) {
                const { firstName, lastName } = response.user.name;
                userName = [firstName, lastName].filter(Boolean).join(' ');
            }

            const authData = await loginWithApple(idToken, userName);
            if (demoFeedbackReturn) {
                markDemoFeedbackReturn();
            }
            const nextPath = demoFeedbackReturn
                ? targetPath
                : resolvePostLoginPath({
                    from: targetPath,
                    defaultPath,
                    needsOnboarding: shouldShowOnboarding(authData?.user),
                });
            navigate(nextPath, { replace: true, state: nextPath === '/onboarding' ? undefined : targetState });
        } catch (error) {
            console.error('Apple login failed', error);
        }
    };

    useEffect(() => {
        callbackRef.current = async (response) => {
            try {
                const authData = await login(response.credential);
                if (demoFeedbackReturn) {
                    markDemoFeedbackReturn();
                }
                const nextPath = demoFeedbackReturn
                    ? targetPath
                    : resolvePostLoginPath({
                        from: targetPath,
                        defaultPath,
                        needsOnboarding: shouldShowOnboarding(authData?.user),
                    });
                navigate(nextPath, { replace: true, state: nextPath === '/onboarding' ? undefined : targetState });
            } catch {
                console.error('Login failed');
            }
        };
    }, [login, navigate, targetPath, targetState, defaultPath, demoFeedbackReturn]);

    useEffect(() => {
        if (loading || !isAuthenticated) return;
        const onLoginPage = location.pathname === '/login';
        const onLandingForFeedback = demoFeedbackReturn
            && location.pathname === '/'
            && (location.hash === '#reviews' || location.hash === '');
        if (!onLoginPage && onLandingForFeedback) return;
        if (!demoFeedbackReturn && location.pathname === targetPath && !shouldShowOnboarding(user)) return;
        if (demoFeedbackReturn && location.pathname === '/' && location.hash === '#reviews') return;
        const nextPath = demoFeedbackReturn
            ? targetPath
            : resolvePostLoginPath({
                from: targetPath,
                defaultPath,
                needsOnboarding: shouldShowOnboarding(user),
            });
        if (!demoFeedbackReturn && location.pathname === nextPath) return;
        navigate(nextPath, { replace: true, state: nextPath === '/onboarding' ? undefined : targetState });
    }, [
        isAuthenticated,
        loading,
        navigate,
        targetPath,
        targetState,
        defaultPath,
        demoFeedbackReturn,
        location.pathname,
        location.hash,
        user,
    ]);

    useEffect(() => {
        let isMounted = true;
        let resizeObserver = null;
        // ResizeObserver garantiza un primer callback apenas se llama a
        // observe(), aunque el tamaño no haya cambiado. Sin este guard, ese
        // callback vuelve a destruir y recrear el iframe del botón justo
        // después del render inicial, y un click que caiga en esa ventana
        // (milisegundos) no llega a ningún iframe vivo — de ahí que hiciera
        // falta clickear varias veces para que arrancara el login.
        let lastRenderedWidth = null;

        const handleCallbackResponse = (response) => {
            callbackRef.current?.(response);
        };

        const renderGoogleButton = () => {
            const container = googleBtnRef.current;
            if (!window.google?.accounts?.id || !container) return;

            const containerWidth = Math.floor(container.getBoundingClientRect().width);
            const width = Math.min(320, Math.max(200, containerWidth || 300));
            if (width === lastRenderedWidth) return;
            lastRenderedWidth = width;

            container.replaceChildren();

            window.google.accounts.id.renderButton(container, {
                theme: 'outline',
                size: 'large',
                shape: 'pill',
                width,
                text: 'continue_with',
            });
        };

        let retries = 0;
        const initGoogle = () => {
            if (window.google?.accounts?.id && googleBtnRef.current) {
                // Google conserva globalmente la ultima configuracion de
                // initialize(). Hay que registrar el callback de este montaje:
                // el anterior puede pertenecer a un login normal ya desmontado
                // y perder la intencion de volver al formulario de comentarios.
                window.google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleCallbackResponse,
                    use_fedcm_for_prompt: false,
                });

                renderGoogleButton();

                if (typeof ResizeObserver !== 'undefined') {
                    resizeObserver = new ResizeObserver(renderGoogleButton);
                    resizeObserver.observe(googleBtnRef.current);
                }
            } else if (isMounted && retries < 25) {
                retries++;
                setTimeout(initGoogle, 200);
            } else if (!window.google?.accounts?.id) {
                console.warn('Google Identity Services SDK could not be loaded (offline?).');
            }
        };

        initGoogle();

        return () => {
            isMounted = false;
            resizeObserver?.disconnect();
        };
    }, []);

    if (loading) {
        return (
            <PageLoader
                title={loadingCopy.title}
                subtitle={loadingCopy.subtitle}
                status={loadingCopy.status}
                progress={56}
            />
        );
    }

    return (
        <div className="lp login-page">
            <header className="lp-nav login-nav">
                <div className="lp-nav-inner">
                    <Link to="/" className="lp-brand">
                        <img src="/logo.avif" alt="" className="lp-brand-logo" />
                        <span className="lp-brand-name">{loginCopy.brand}</span>
                    </Link>
                    <div className="lp-nav-end">
                        <LangToggle language={language} setLanguage={setLanguage} />
                    </div>
                </div>
            </header>

            <main className="login-main">
                <div className="login-stage">
                    <div className="login-panel">
                        <h1 className="login-title">{loginCopy.welcome}</h1>
                        {/* <p className="login-subtitle">{loginCopy.subtitle}</p> */}

                        <div className="login-auth">
                            <div className="google-btn-container" ref={googleBtnRef} />
                            <p className="login-trust">{loginCopy.trust}</p>

                            {/*
                            <div className="login-or" role="separator" aria-label={loginCopy.or}>
                                <span>{loginCopy.or}</span>
                            </div>

                            <button
                                type="button"
                                className="login-apple-btn"
                                onClick={handleAppleLogin}
                            >
                                <AppleIcon />
                                <span>{loginCopy.apple}</span>
                            </button>
                            */}
                        </div>
                    </div>
                </div>
            </main>

            <ShellFooter
                variant="landing"
                labels={{
                    documentation: loginCopy.footerDocumentation,
                    portfolio: loginCopy.footerPortfolio,
                    github: loginCopy.footerGithub,
                }}
            />
        </div>
    );
};

export default LoginPage;
