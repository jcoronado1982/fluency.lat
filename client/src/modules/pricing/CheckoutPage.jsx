import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
    FiCheck, FiZap, FiArrowLeft, FiShield, FiLock,
    FiChevronDown,
} from 'react-icons/fi';
import { useUIContext } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import config from '../../config';
import LanguageSelector from '../../components/common/LanguageSelector';
import { getAuthenticatedHomePath } from '../index';
import { getCheckoutPlanData } from './config/planCatalog';
import { CHECKOUT_TRANSLATIONS } from './translations';
import { checkoutPort } from './composition';
import './CheckoutPage.css';

/* Vuelta del checkout (`?status=success`): LemonSqueezy confirma el cobro por webhook, o sea de
   forma ASÍNCRONA, así que el rol del servidor puede tardar. El usuario NO espera por eso: se le
   marca premium optimista (`markPremiumPending`) y entra a la app enseguida. La confirmación
   sigue sola en `AuthContext`; si el pago no prospera, la marca caduca y los permisos vuelven.
   Por eso aquí no hay ni cuenta atrás ni avisos de "está tardando". */
const ENTER_APP_DELAY_MS = 5000;

/* ── Componente principal ──────────────────────────────────────── */
export default function CheckoutPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { language = 'en', setLanguage } = useUIContext();
    const { refreshUser, markPremiumPending } = useAuth();
    const t = CHECKOUT_TRANSLATIONS[language === 'es' ? 'es' : 'en'];
    const PLAN_DATA = getCheckoutPlanData(t);

    /* billing param desde URL: ?billing=annual | monthly */
    const initBilling = searchParams.get('billing') === 'monthly' ? 'monthly' : 'annual';
    const [billing, setBilling] = useState(initBilling);
    const plan = PLAN_DATA[billing];

    /* 'form' | 'processing' | 'success' — 'success' llega vía redirect_url de LemonSqueezy */
    const [step, setStep] = useState(searchParams.get('status') === 'success' ? 'success' : 'form');
    const [showOrderSummary, setShowOrderSummary] = useState(false);

    // Los efectos de la vuelta del pago no deben reiniciarse porque cambie la identidad de
    // estas funciones: solo dependen del paso del checkout.
    const authActionsRef = useRef({ refreshUser, markPremiumPending });
    useEffect(() => {
        authActionsRef.current = { refreshUser, markPremiumPending };
    }, [refreshUser, markPremiumPending]);

    /* --- Vuelta del pago: premium optimista + entrada inmediata a la app --- */
    useEffect(() => {
        if (step !== 'success') return undefined;

        authActionsRef.current.markPremiumPending?.();
        // Un intento inmediato por si el webhook ya llegó (no se espera al resultado).
        void authActionsRef.current.refreshUser?.();

        const timerId = setTimeout(() => {
            navigate(getAuthenticatedHomePath(config, []));
        }, ENTER_APP_DELAY_MS);
        return () => clearTimeout(timerId);
    }, [step, navigate]);

    /* --- update billing in URL without full nav --- */
    useEffect(() => {
        if (step !== 'form') return;
        const url = new URL(window.location.href);
        url.searchParams.set('billing', billing);
        window.history.replaceState({}, '', url.toString());
    }, [billing, step]);

    /* ── Handlers ─────────────────────────────────────────────── */
    async function handleUpgrade() {
        setStep('processing');
        try {
            const { checkout_url: checkoutUrl } = await checkoutPort.createCheckoutSession(billing);
            window.location.href = checkoutUrl;
        } catch {
            setStep('form');
        }
    }

    /* ── Render: Success ─────────────────────────────────────── */
    if (step === 'success') {
        return (
            <div className="checkout-page">
                <div className="checkout-bg-glow" aria-hidden />
                <div className="checkout-success-wrap">
                    <div className="checkout-success-icon">
                        <FiCheck size={40} />
                    </div>
                    <h1>{t.successTitle}</h1>
                    <p>{t.successSub}</p>

                    {/* Sin estados de espera ni botón: se lee el mensaje de éxito y la app
                        entra sola a los ENTER_APP_DELAY_MS. */}
                    <div className="checkout-activation" role="status" aria-live="polite">
                        <span className="checkout-spinner checkout-spinner--inline" aria-hidden />
                        <span>{t.enteringApp}</span>
                    </div>
                </div>
            </div>
        );
    }

    /* ── Render: Processing ──────────────────────────────────── */
    if (step === 'processing') {
        return (
            <div className="checkout-page">
                <div className="checkout-bg-glow" aria-hidden />
                <div className="checkout-processing-wrap">
                    <div className="checkout-spinner" aria-label={t.processing} />
                    <h2>{t.processing}</h2>
                </div>
            </div>
        );
    }

    /* ── Render: Form (confirmación de plan) ───────────────────── */
    return (
        <div className="checkout-page">
            <div className="checkout-bg-glow" aria-hidden />
            <div className="checkout-bg-blob checkout-bg-blob--1" aria-hidden />
            <div className="checkout-bg-blob checkout-bg-blob--2" aria-hidden />

            {/* NAV */}
            <header className="checkout-nav">
                <div className="checkout-nav-inner">
                    <Link to="/pricing" className="checkout-back">
                        <FiArrowLeft size={18} />
                        <span>{t.back}</span>
                    </Link>
                    <Link to="/" className="checkout-brand">
                        <img src="/logo.avif" alt="Fluency" className="checkout-brand-logo" />
                        <span className="checkout-brand-name">Fluency</span>
                    </Link>
                    <div className="checkout-secure-badge">
                        <LanguageSelector currentLanguage={language} onLanguageChange={setLanguage} />
                        <FiLock size={13} style={{ marginLeft: '1rem' }} aria-label={t.secureAria} />
                    </div>
                </div>
            </header>

            <main className="checkout-main">
                <div className="checkout-grid">

                    {/* ── COLUMNA IZQUIERDA: confirmación de plan ── */}
                    <div className="checkout-form-col">

                        {/* Resumen móvil (acordeón) */}
                        <button
                            className="checkout-mobile-summary-toggle"
                            onClick={() => setShowOrderSummary((v) => !v)}
                            aria-expanded={showOrderSummary}
                        >
                            <span className="checkout-mobile-summary-label">
                                <FiZap size={14} />
                                {t.summaryTitle}
                            </span>
                            <span className="checkout-mobile-summary-right">
                                <strong>{plan.priceDisplay}</strong>
                                <FiChevronDown
                                    size={16}
                                    className={showOrderSummary ? 'rotated' : ''}
                                />
                            </span>
                        </button>

                        {showOrderSummary && (
                            <div className="checkout-mobile-summary-panel">
                                <OrderSummary billing={billing} setBilling={setBilling} plan={plan} t={t} />
                            </div>
                        )}

                        {/* ─ Billing toggle ─ */}
                        <div className="checkout-section">
                            <h2 className="checkout-section-title">1. {t.step2}</h2>
                            <div className="checkout-billing-toggle">
                                <label className={`checkout-billing-option ${billing === 'annual' ? 'is-active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="billing"
                                        value="annual"
                                        checked={billing === 'annual'}
                                        onChange={() => setBilling('annual')}
                                    />
                                    <div className="checkout-billing-option-body">
                                        <div className="checkout-billing-option-header">
                                            <span className="checkout-billing-option-label">{t.billingAnnual}</span>
                                            <span className="checkout-billing-savings">{t.billingSavings}</span>
                                        </div>
                                        <div className="checkout-billing-option-price">
                                            <strong>{PLAN_DATA.annual.priceDisplay}</strong>
                                            <span>{t.billingAnnualEquivalent}</span>
                                        </div>
                                    </div>
                                </label>

                                <label className={`checkout-billing-option ${billing === 'monthly' ? 'is-active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="billing"
                                        value="monthly"
                                        checked={billing === 'monthly'}
                                        onChange={() => setBilling('monthly')}
                                    />
                                    <div className="checkout-billing-option-body">
                                        <div className="checkout-billing-option-header">
                                            <span className="checkout-billing-option-label">{t.billingMonthly}</span>
                                        </div>
                                        <div className="checkout-billing-option-price">
                                            <strong>{PLAN_DATA.monthly.priceDisplay}</strong>
                                            <span>{t.billingMonthlyEquivalent}</span>
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* ─ Confirmación: redirige al checkout hospedado de LemonSqueezy ─ */}
                        <div className="checkout-section">
                            <h2 className="checkout-section-title">2. {t.formTitle}</h2>
                            <p className="checkout-section-hint">{t.formSubtitle}</p>

                            <div className="checkout-submit-section">
                                <div className="checkout-total-line">
                                    <span>{t.total}</span>
                                    <strong>{plan.billedAs}</strong>
                                </div>

                                <button type="button" className="checkout-submit-btn" onClick={handleUpgrade}>
                                    <FiLock size={16} />
                                    {t.payBtn} · {plan.billedAs}
                                </button>

                                <p className="checkout-legal">
                                    {t.secureNotice}
                                </p>

                                <div className="checkout-trust-badges">
                                    <span><FiShield size={13} /> Pago cifrado SSL</span>
                                    <span><FiLock size={13} /> Seguro</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── COLUMNA DERECHA: Resumen del pedido (desktop) ── */}
                    <aside className="checkout-summary-col">
                        <div className="checkout-summary-sticky">
                            <OrderSummary billing={billing} setBilling={setBilling} plan={plan} t={t} />
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}

/* ── Componente separado: Resumen del pedido ─────────────────── */
function OrderSummary({ billing, plan, t }) {
    return (
        <div className="checkout-summary">
            <div className="checkout-summary-header">
                <div className="checkout-summary-plan-badge">
                    <FiZap size={14} />
                    Fluency Premium
                </div>
                <div className="checkout-summary-price">
                    <span className="checkout-summary-price-amount">{plan.priceDisplay}</span>
                    <span className="checkout-summary-price-period">USD / {plan.period}</span>
                </div>
                {plan.savingsBadge && (
                    <div className="checkout-summary-savings">{plan.savingsBadge}</div>
                )}
                <p className="checkout-summary-billed-as">{plan.label}</p>
            </div>

            <div className="checkout-summary-divider" />

            <div className="checkout-summary-line-items">
                <div className="checkout-summary-line">
                    <span>Fluency Premium {billing === 'annual' ? 'Anual' : 'Mensual'}</span>
                    <span>{plan.billedAs}</span>
                </div>
                <div className="checkout-summary-line checkout-summary-line--total">
                    <span>{t.total}</span>
                    <strong>{plan.billedAs}</strong>
                </div>
            </div>

            <div className="checkout-summary-guarantee">
                <FiShield size={20} className="checkout-summary-guarantee-icon" />
                <div>
                    <p className="checkout-summary-guarantee-title">{t.guarantee}</p>
                </div>
            </div>
        </div>
    );
}
