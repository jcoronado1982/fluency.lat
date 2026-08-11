import React from 'react';
import { LuZap, LuCrown } from 'react-icons/lu';
import ProtectedRoute from '../../components/common/ProtectedRoute';
import PricingPage from './PricingPage';
import CheckoutPage from './CheckoutPage';
import { getPricingTranslations } from './translations';

/** Subtítulo del ítem premium: "Activo · hasta el 12 ago 2026" si hay fecha válida. */
function formatSubscriptionSub(t, language, subscription) {
    const expiresAt = subscription?.expires_at;
    if (!expiresAt) return t.floatingMenu.activeSub;

    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) return t.floatingMenu.activeSub;

    const formatted = date.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
    return t.floatingMenu.activeUntil.replace('{date}', formatted);
}

const pricingModule = {
    id: 'pricing',
    enabled: (config) => config.features.pricing !== false,
    routes: () => [
        {
            path: '/pricing',
            element: <PricingPage />,
            layout: 'bare',
            public: true,
        },
        {
            path: '/checkout',
            element: <ProtectedRoute fallbackTo="/login"><CheckoutPage /></ProtectedRoute>,
            layout: 'bare',
        },
    ],
    floatingMenuItems: ({ close, navigate, config, language, isPremium, user, subscription }) => {
        if (config.features.pricing === false) return [];
        const userIsPremium = isPremium || user?.role === 'premium' || user?.role === 'admin';
        const t = getPricingTranslations(language);

        if (userIsPremium) {
            // Sin onClick: fila informativa, no navegable (no hay página de gestión de la
            // suscripción todavía; LemonSqueezy la gestiona desde su propio portal).
            return [{
                id: 'pricing-active-float',
                sectionLabel: t.floatingMenu.sectionLabel,
                icon: <LuCrown />,
                iconColor: 'premium',
                name: t.floatingMenu.activeName,
                sub: formatSubscriptionSub(t, language, subscription ?? user?.subscription),
            }];
        }

        return [{
            id: 'pricing-upgrade-float',
            sectionLabel: t.floatingMenu.sectionLabel,
            icon: <LuZap />,
            iconColor: 'premium',
            name: t.floatingMenu.name,
            sub: t.floatingMenu.sub,
            onClick: () => {
                navigate('/pricing');
                close();
            },
        }];
    },
};

export default pricingModule;
