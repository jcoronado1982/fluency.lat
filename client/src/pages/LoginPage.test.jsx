import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';

const mocks = vi.hoisted(() => ({
    auth: {
        login: vi.fn(),
        loginWithApple: vi.fn(),
        isAuthenticated: false,
        loading: false,
        user: null,
    },
    initialize: vi.fn(),
    renderButton: vi.fn(),
}));

vi.mock('../config', () => ({ default: { features: { admin: false } } }));
vi.mock('../modules', () => ({ getAuthenticatedHomePath: () => '/dashboard' }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../context/UIContext', () => ({
    useUIContext: () => ({ language: 'en', setLanguage: vi.fn() }),
}));
vi.mock('../utils/demoFeedbackStorage', () => ({
    hasDemoFeedbackReturn: () => false,
    markDemoFeedbackReturn: vi.fn(),
}));
vi.mock('../utils/onboardingStorage', () => ({ shouldShowOnboarding: () => false }));
vi.mock('../components/common/PageLoader', () => ({ default: () => <div>Loading</div> }));
vi.mock('../components/shell/ShellFooter', () => ({ default: () => <footer>Footer</footer> }));

// Simula el comportamiento real (garantizado por el spec) de ResizeObserver:
// el callback se dispara una vez apenas se llama a observe(), aunque el
// tamaño no haya cambiado todavía.
class FakeResizeObserver {
    constructor(callback) {
        this.callback = callback;
    }

    observe() {
        queueMicrotask(() => this.callback([]));
    }

    disconnect() {}
}

function renderLoginPage() {
    return render(
        <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.isAuthenticated = false;
    mocks.auth.loading = false;
    mocks.auth.user = null;
    window.ResizeObserver = FakeResizeObserver;
    window.google = {
        accounts: {
            id: {
                initialize: mocks.initialize,
                renderButton: mocks.renderButton,
            },
        },
    };
});

describe('LoginPage Google button rendering', () => {
    it('does not rebuild the Google button on the guaranteed initial ResizeObserver callback', async () => {
        renderLoginPage();

        // Deja correr el microtask que dispara el callback inicial garantizado.
        await act(async () => {
            await Promise.resolve();
        });

        await waitFor(() => expect(mocks.initialize).toHaveBeenCalledTimes(1));
        // Antes del fix, el callback garantizado de ResizeObserver volvía a
        // destruir y recrear el iframe del botón (segunda llamada aquí),
        // dejando una ventana en la que un click del usuario no llegaba a
        // ningún iframe vivo.
        expect(mocks.renderButton).toHaveBeenCalledTimes(1);
    });
});
