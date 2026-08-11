import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CheckoutPage from './CheckoutPage';

const mocks = vi.hoisted(() => ({
    createCheckoutSession: vi.fn(),
    refreshUser: vi.fn(),
    markPremiumPending: vi.fn(),
    navigate: vi.fn(),
    auth: { isPremium: false },
}));

vi.mock('../../context/UIContext', () => ({
    useUIContext: () => ({ language: 'en', setLanguage: vi.fn() }),
}));
vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({
        isPremium: mocks.auth.isPremium,
        refreshUser: mocks.refreshUser,
        markPremiumPending: mocks.markPremiumPending,
    }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal()),
    useNavigate: () => mocks.navigate,
}));
vi.mock('../index', () => ({ getAuthenticatedHomePath: () => '/dashboard' }));
vi.mock('./composition', () => ({
    checkoutPort: { createCheckoutSession: mocks.createCheckoutSession },
}));

/** Avanza los timers falsos dejando que React confirme los efectos que se programen dentro. */
async function advanceBy(ms) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

function renderCheckoutPage(initialEntry = '/checkout') {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <CheckoutPage />
        </MemoryRouter>,
    );
}

// El checkout es el único flujo que mueve dinero: el submit debe llegar exactamente una vez
// al puerto con el plan seleccionado, y redirigir a la URL de checkout que devuelve el backend.
describe('CheckoutPage', () => {
    const originalLocation = window.location;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.isPremium = false;
        mocks.refreshUser.mockResolvedValue({ role: 'viewer' });
        const realHref = window.location.href;
        delete window.location;
        window.location = { href: realHref };
    });

    afterEach(() => {
        vi.useRealTimers();
        window.location = originalLocation;
    });

    it('requests a checkout session for the selected plan and redirects to it', async () => {
        mocks.createCheckoutSession.mockResolvedValue({ checkout_url: 'https://lemonsqueezy.example/checkout/abc' });
        renderCheckoutPage();

        fireEvent.click(screen.getByRole('button', { name: /pay|pagar/i }));

        await waitFor(() => expect(mocks.createCheckoutSession).toHaveBeenCalledTimes(1));
        expect(mocks.createCheckoutSession).toHaveBeenCalledWith('annual');
        await waitFor(() => expect(window.location.href).toBe('https://lemonsqueezy.example/checkout/abc'));
    });

    it('sends the plan selected via the billing toggle', async () => {
        mocks.createCheckoutSession.mockResolvedValue({ checkout_url: 'https://lemonsqueezy.example/checkout/xyz' });
        renderCheckoutPage();

        fireEvent.click(screen.getByRole('radio', { name: /monthly|mensual/i }));
        fireEvent.click(screen.getByRole('button', { name: /pay|pagar/i }));

        await waitFor(() => expect(mocks.createCheckoutSession).toHaveBeenCalledWith('monthly'));
    });

    it('falls back to the form when session creation fails', async () => {
        mocks.createCheckoutSession.mockRejectedValue(new Error('boom'));
        renderCheckoutPage();

        fireEvent.click(screen.getByRole('button', { name: /pay|pagar/i }));

        await waitFor(() => expect(mocks.createCheckoutSession).toHaveBeenCalledTimes(1));
        expect(await screen.findByRole('button', { name: /pay|pagar/i })).toBeInTheDocument();
    });

    it('shows the success screen when redirected back with status=success', () => {
        renderCheckoutPage('/checkout?status=success');

        expect(screen.getByText(/payment successful/i)).toBeInTheDocument();
        expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
    });

    // El webhook de LemonSqueezy es asíncrono, pero el usuario no espera por él: se marca el
    // premium optimista y se entra a la app. La confirmación va por AuthContext.
    it('marks premium as pending and enters the app right after paying', async () => {
        vi.useFakeTimers();

        renderCheckoutPage('/checkout?status=success');

        await advanceBy(0);
        expect(mocks.markPremiumPending).toHaveBeenCalledTimes(1);
        expect(mocks.refreshUser).toHaveBeenCalledTimes(1);

        // La pantalla de éxito se deja leer: nada de redirigir de inmediato.
        await advanceBy(4000);
        expect(mocks.navigate).not.toHaveBeenCalled();

        await advanceBy(1000);
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    });

    // Regresión: la pantalla de éxito no debe contarle al usuario que la confirmación tarda.
    it('never shows a waiting or delayed confirmation message', async () => {
        vi.useFakeTimers();

        renderCheckoutPage('/checkout?status=success');
        await advanceBy(0);

        expect(screen.queryByText(/taking longer|delayed|activating/i)).not.toBeInTheDocument();
        expect(screen.getByText(/entering fluency premium/i)).toBeInTheDocument();
    });

    // La entrada es automática: un botón ahí solo compite con la redirección.
    it('shows no action button on the success screen', async () => {
        vi.useFakeTimers();

        renderCheckoutPage('/checkout?status=success');
        await advanceBy(0);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
