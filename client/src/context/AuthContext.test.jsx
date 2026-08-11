import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { authRepository } from '../repositories/AuthRepository';

// Regresión (ago 2026, reportado como hueco de seguridad): la marca de "premium optimista"
// tras el checkout vivía en localStorage sin dueño y `logout()` no la borraba, así que
// sobrevivía a cerrar sesión y la heredaba la SIGUIENTE cuenta que iniciara sesión en el mismo
// navegador (incluido dev-guest) — cualquiera veía "premium" sin haber pagado.

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
}));

vi.mock('../services/httpClient', () => ({
    httpClient: { get: mocks.get, post: mocks.post },
}));

vi.mock('../modules', () => ({
    getPublicEntryPathForConfig: () => '/',
    notifyAuthUserSynced: () => {},
    notifyAuthLogout: () => {},
}));

function Probe() {
    const { user, isPremium, markPremiumPending, logout } = useAuth();
    return (
        <div>
            <div data-testid="email">{user?.email ?? 'none'}</div>
            <div data-testid="is-premium">{String(isPremium)}</div>
            <button type="button" onClick={markPremiumPending}>mark-pending</button>
            <button type="button" onClick={logout}>logout</button>
        </div>
    );
}

function renderAuth() {
    return render(
        <MemoryRouter>
            <AuthProvider>
                <Probe />
            </AuthProvider>
        </MemoryRouter>,
    );
}

function seedSession(email) {
    authRepository.saveAuthData({
        token: `token-${email}`,
        user: { email, role: 'viewer', onboarding_completed: true },
    });
}

describe('AuthContext — premium optimista post-pago', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        // El servidor sigue diciendo "viewer": aísla el optimismo del cliente del rol real.
        mocks.get.mockResolvedValue({ effective_role: 'viewer', onboarding_completed: true });
        mocks.post.mockResolvedValue({});
    });

    it('marks the account premium optimistically and reverts it on logout', async () => {
        seedSession('paga@fluency.lat');
        renderAuth();
        await act(async () => {});

        expect(screen.getByTestId('is-premium')).toHaveTextContent('false');

        await act(async () => {
            fireEvent.click(screen.getByText('mark-pending'));
        });
        expect(screen.getByTestId('is-premium')).toHaveTextContent('true');

        await act(async () => {
            fireEvent.click(screen.getByText('logout'));
        });
        expect(screen.getByTestId('is-premium')).toHaveTextContent('false');
        expect(localStorage.getItem('fluency-pending-premium')).toBeNull();
    });

    it('does not leak a pending-premium mark to the next account that logs in', async () => {
        seedSession('paga@fluency.lat');
        const { unmount } = renderAuth();
        await act(async () => {});

        await act(async () => {
            fireEvent.click(screen.getByText('mark-pending'));
        });
        expect(screen.getByTestId('is-premium')).toHaveTextContent('true');

        // Cierra sesión (como haría el usuario real) y una cuenta DISTINTA entra en el mismo
        // navegador — nunca debe heredar el optimismo de la cuenta anterior.
        await act(async () => {
            fireEvent.click(screen.getByText('logout'));
        });
        unmount();

        seedSession('otra-cuenta@fluency.lat');
        renderAuth();
        await act(async () => {});

        expect(screen.getByTestId('email')).toHaveTextContent('otra-cuenta@fluency.lat');
        expect(screen.getByTestId('is-premium')).toHaveTextContent('false');
    });

    it('ignores a pending-premium mark left by a different email even without an explicit logout', async () => {
        // Simula una marca huérfana en localStorage (p. ej. de una sesión previa que no cerró
        // sesión de forma limpia) para una cuenta que NO es la que inicia sesión ahora.
        localStorage.setItem(
            'fluency-pending-premium',
            JSON.stringify({ email: 'alguien-mas@fluency.lat', until: Date.now() + 60_000 }),
        );

        seedSession('yo@fluency.lat');
        renderAuth();
        await act(async () => {});

        expect(screen.getByTestId('is-premium')).toHaveTextContent('false');
    });

    it('restores the optimistic premium after a reload within the window, for the same account', async () => {
        seedSession('paga@fluency.lat');
        localStorage.setItem(
            'fluency-pending-premium',
            JSON.stringify({ email: 'paga@fluency.lat', until: Date.now() + 60_000 }),
        );

        renderAuth();
        await act(async () => {});

        expect(screen.getByTestId('is-premium')).toHaveTextContent('true');
    });
});
