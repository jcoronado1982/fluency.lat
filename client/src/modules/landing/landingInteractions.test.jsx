import React, { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import LandingNav from './features/LandingNav';
import DemoImageCarousel from './features/DemoImageCarousel';
import DemoImagePromptPanel from './features/DemoImagePromptPanel';
import { StarRatingDisplay, StarRatingInput } from './features/StarRating';

const copy = {
    brand: 'Fluency',
    navHowItWorks: 'How it works',
    navPricing: 'Pricing',
    navWhyVocabularyFirst: 'Vocabulary first',
    navFeedback: 'Reviews',
    navApp: 'Open app',
    navLogin: 'Log in',
    navSignupShort: 'Sign up',
    demoImagePromptPlaceholder: 'Describe a scene',
    demoImagePromptApply: 'Apply',
    demoImagePromptHint: 'Optional detail',
    demoImagePromptLabel: 'Customize image',
    premiumBadgeLabel: 'Premium',
    imageShowcaseTitle: 'Images',
    imageShowcaseSubtitle: 'Choose one',
    demoInteractiveBadge: 'Use image',
    seePremiumCta: 'See premium',
};

const routed = (node) => render(<MemoryRouter>{node}</MemoryRouter>);

describe('landing navigation interactions', () => {
    it('switches languages and reports active section clicks', () => {
        const setLanguage = vi.fn();
        const setActiveSection = vi.fn();
        routed(
            <LandingNav
                t={copy}
                language="en"
                setLanguage={setLanguage}
                activeNav="reviews"
                setActiveSection={setActiveSection}
                isAuthenticated={false}
                pricingEnabled
                currentPathname="/"
                authenticatedHomePath="/dashboard"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'ES' }));
        fireEvent.click(screen.getByRole('link', { name: 'Reviews' }));
        expect(setLanguage).toHaveBeenCalledWith('es');
        expect(setActiveSection).toHaveBeenCalledWith('reviews');
        expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
        expect(screen.getByRole('link', { name: 'Reviews' })).toHaveClass('is-active');
        expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
        expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/login');
    });

    it('shows the authenticated destination and hides disabled pricing', () => {
        routed(
            <LandingNav
                t={copy}
                language="es"
                setLanguage={vi.fn()}
                activeNav="how-it-works"
                setActiveSection={vi.fn()}
                isAuthenticated
                pricingEnabled={false}
                currentPathname="/"
                authenticatedHomePath="/dashboard"
            />,
        );

        expect(screen.getByRole('link', { name: 'Open app' })).toHaveAttribute('href', '/dashboard');
        expect(screen.queryByRole('link', { name: 'Pricing' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    });
});

describe('landing rating controls', () => {
    it('renders partial rating and an accessible label', () => {
        const { container } = render(<StarRatingDisplay value={4.5} label="4.5 out of 5" />);
        expect(screen.getByRole('img', { name: '4.5 out of 5' })).toBeVisible();
        expect(container.querySelectorAll('.is-full')).toHaveLength(4);
        expect(container.querySelector('.is-partial')).toHaveStyle({ '--star-fill': '50%' });
    });

    it('supports hover, focus and selection as a radio group', () => {
        const onChange = vi.fn();
        const { rerender } = render(<StarRatingInput value={0} onChange={onChange} />);
        const fourth = screen.getByRole('radio', { name: '4 estrellas' });

        fireEvent.mouseEnter(fourth);
        expect(fourth).toHaveClass('is-active');
        fireEvent.click(fourth);
        expect(onChange).toHaveBeenCalledWith(4);

        rerender(<StarRatingInput value={4} onChange={onChange} />);
        expect(screen.getByRole('radio', { name: '4 estrellas' })).toHaveAttribute('aria-checked', 'true');
    });
});

describe('demo image controls', () => {
    it('opens the prompt, synchronizes its ref and applies with click or Enter', () => {
        const promptRef = createRef();
        const onApply = vi.fn();
        render(
            <DemoImagePromptPanel
                promptRef={promptRef}
                onApply={onApply}
                t={copy}
                collapsible
            />,
        );

        const toggle = screen.getByRole('button', { name: 'Customize image' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');

        const input = screen.getByPlaceholderText('Describe a scene');
        fireEvent.change(input, { target: { value: 'at sunset' } });
        expect(promptRef.current).toBe('at sunset');
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalledTimes(2);
    });

    it('selects an exact carousel identity and hides pricing CTA when disabled', () => {
        const onSelectImage = vi.fn();
        routed(<DemoImageCarousel t={copy} pricingEnabled={false} onSelectImage={onSelectImage} />);

        const tiles = screen.getAllByRole('button', { name: /Use image/ });
        fireEvent.click(tiles[0]);
        expect(onSelectImage).toHaveBeenCalledWith(expect.objectContaining({
            cardId: 8,
            defIndex: 1,
            form: 'v1',
        }));
        expect(screen.queryByRole('link', { name: 'See premium' })).not.toBeInTheDocument();
    });
});
