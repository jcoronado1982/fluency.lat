import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';

const mocks = vi.hoisted(() => ({
    auth: {
        isAuthenticated: false,
        loading: false,
        loadingStage: 'session',
        onboardingRequired: false,
    },
    app: { language: 'en', setLanguage: vi.fn() },
    hasReturn: false,
    documentMeta: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../context/AppContext', () => ({ useAppContext: () => mocks.app }));
vi.mock('../../config', () => ({ default: { features: { pricing: true } } }));
vi.mock('../index', () => ({ getAuthenticatedHomePath: () => '/dashboard' }));
vi.mock('../../utils/demoFeedbackStorage', () => ({
    hasDemoFeedbackReturn: () => mocks.hasReturn,
}));
vi.mock('../../hooks/useDocumentMeta', () => ({ default: mocks.documentMeta }));
vi.mock('../../components/common/PageLoader', () => ({
    default: ({ title, status }) => <div data-testid="loader">{title}|{status}</div>,
}));
vi.mock('../../components/shell/ShellFooter', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('./features/LandingNav', () => ({ default: () => <nav>Landing nav</nav> }));
vi.mock('./features/LandingHero', () => ({ default: () => <section id="how-it-works">Hero</section> }));
vi.mock('./features/FeedbackSection', () => ({ default: () => <section id="reviews">Feedback</section> }));
vi.mock('./features/VocabularyFirstSection', () => ({ default: () => <section id="vocabulary-first">Vocabulary</section> }));
vi.mock('./features/WhySection', () => ({ default: () => <section>Why</section> }));

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}{location.hash}</output>;
}

function landingTree(entry) {
    return (
        <MemoryRouter initialEntries={[entry]}>
            <Routes>
                <Route path="*" element={<><LandingPage /><LocationProbe /></>} />
            </Routes>
        </MemoryRouter>
    );
}

function renderPage(entry = '/') {
    return render(landingTree(entry));
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.isAuthenticated = false;
    mocks.auth.loading = false;
    mocks.auth.loadingStage = 'session';
    mocks.auth.onboardingRequired = false;
    mocks.hasReturn = false;
    mocks.app.language = 'en';
    window.IntersectionObserver = class {
        observe() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
});

describe('LandingPage guards and routing', () => {
    it('renders the complete public landing and sets localized metadata', () => {
        renderPage('/');
        expect(screen.getByText('Landing nav')).toBeVisible();
        expect(screen.getByText('Hero')).toBeVisible();
        expect(screen.getByText('Feedback')).toBeVisible();
        expect(screen.getByText('Footer')).toBeVisible();
        expect(mocks.documentMeta).toHaveBeenCalledWith(expect.objectContaining({ lang: 'en' }));
    });

    it('shows the stage-specific loader while auth restores', () => {
        mocks.auth.loading = true;
        renderPage('/');
        expect(screen.getByTestId('loader')).toBeVisible();
        expect(screen.queryByText('Hero')).not.toBeInTheDocument();
    });

    it('routes a new authenticated account to onboarding', async () => {
        mocks.auth.isAuthenticated = true;
        mocks.auth.onboardingRequired = true;
        renderPage('/');
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/onboarding'));
    });

    it('routes a returning authenticated account to the dashboard', async () => {
        mocks.auth.isAuthenticated = true;
        renderPage('/');
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    });

    it('allows authenticated section hashes to remain on landing', () => {
        mocks.auth.isAuthenticated = true;
        renderPage('/#reviews');
        expect(screen.getByText('Feedback')).toBeVisible();
        expect(screen.getByTestId('location')).toHaveTextContent('/#reviews');
    });

    it('keeps a feedback return on landing even when onboarding is pending', () => {
        mocks.auth.isAuthenticated = true;
        mocks.auth.onboardingRequired = true;
        mocks.hasReturn = true;
        renderPage('/');
        expect(screen.getByText('Feedback')).toBeVisible();
        expect(screen.getByTestId('location')).toHaveTextContent('/');
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('does not bounce to onboarding when the feedback flag clears mid-visit', () => {
        // Reproduce la carrera real: DemoFeedback limpia el flag de
        // sessionStorage en cuanto el auto-envío tiene éxito, y un re-render
        // posterior (p. ej. el IntersectionObserver de scroll al llegar a
        // #reviews) no debe releerlo y mandar al usuario a /onboarding.
        mocks.auth.isAuthenticated = true;
        mocks.auth.onboardingRequired = true;
        mocks.hasReturn = true;
        const { rerender } = renderPage('/');
        expect(screen.getByText('Feedback')).toBeVisible();

        mocks.hasReturn = false;
        rerender(landingTree('/'));

        expect(screen.getByText('Feedback')).toBeVisible();
        expect(screen.getByTestId('location')).toHaveTextContent('/');
    });
});
