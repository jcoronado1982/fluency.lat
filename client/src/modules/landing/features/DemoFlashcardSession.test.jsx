import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DemoFlashcardSession from './DemoFlashcardSession';

const mocks = vi.hoisted(() => ({
    imagePrefetch: vi.fn(),
    audioPrefetch: vi.fn(),
}));

vi.mock('../composition', () => ({
    demoAudioPort: Object.freeze({ resolve: vi.fn(), preload: vi.fn() }),
    demoImagePort: Object.freeze({ resolve: vi.fn(), preloadImage: vi.fn() }),
}));

vi.mock('../../../components/flashcardStudy/features/useNextImagePrefetch', () => ({
    useNextImagePrefetch: mocks.imagePrefetch,
}));

vi.mock('../../../components/flashcardStudy/features/useNextAudioPrefetch', () => ({
    useNextAudioPrefetch: mocks.audioPrefetch,
}));

vi.mock('../../../components/flashcardStudy', async () => {
    const ReactModule = await import('react');
    const FlashcardContext = ReactModule.createContext(null);
    const FlashcardUiContext = ReactModule.createContext(null);
    const CategoryContext = ReactModule.createContext(null);

    function Flashcard() {
        const session = ReactModule.useContext(FlashcardContext);
        return <div data-testid="current-card">{session.currentCard?.id ?? 'none'}</div>;
    }

    function Controls() {
        const session = ReactModule.useContext(FlashcardContext);
        return (
            <div>
                <button type="button" onClick={session.prevCard}>Previous</button>
                <button type="button" onClick={session.nextCard}>Next</button>
                <button type="button" onClick={session.markAsLearned}>Learn</button>
                <button type="button" onClick={session.resetDeck}>Reset controls</button>
                <span data-testid="card-count">{session.filteredData.length}</span>
            </div>
        );
    }

    return {
        Flashcard,
        Controls,
        FlashcardContext,
        FlashcardUiContext,
        CategoryContext,
        StudyMediaProvider: ({ children }) => children,
    };
});

const renderSession = (props = {}) => render(
    <MemoryRouter>
        <DemoFlashcardSession language="en" badgeLabel="Interactive" {...props} />
    </MemoryRouter>,
);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('DemoFlashcardSession interactions', () => {
    it('navigates next/previous with wrap-around and prefetches the next media', () => {
        renderSession();
        expect(screen.getByTestId('current-card')).toHaveTextContent('1');
        expect(screen.getByTestId('card-count')).toHaveTextContent('10');
        expect(mocks.imagePrefetch).toHaveBeenCalledWith(expect.objectContaining({
            category: 'landing-demo',
            deckName: 'verbs-essentials',
            enabled: true,
        }));
        expect(mocks.audioPrefetch).toHaveBeenCalledWith(expect.objectContaining({
            category: 'landing-demo',
            studyLanguage: 'es',
            enabled: true,
        }));

        fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
        expect(screen.getByTestId('current-card')).toHaveTextContent('10');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByTestId('current-card')).toHaveTextContent('1');
    });

    it('supports horizontal swipe only beyond the threshold', () => {
        const { container } = renderSession();
        const area = container.querySelector('.flashcard-main-area');

        fireEvent.touchStart(area, { targetTouches: [{ clientX: 200, clientY: 30 }] });
        fireEvent.touchEnd(area, { changedTouches: [{ clientX: 140, clientY: 32 }] });
        expect(screen.getByTestId('current-card')).toHaveTextContent('2');

        fireEvent.touchStart(area, { targetTouches: [{ clientX: 100, clientY: 30 }] });
        fireEvent.touchEnd(area, { changedTouches: [{ clientX: 140, clientY: 32 }] });
        expect(screen.getByTestId('current-card')).toHaveTextContent('2');

        fireEvent.touchStart(area, { targetTouches: [{ clientX: 100, clientY: 30 }] });
        fireEvent.touchEnd(area, { changedTouches: [{ clientX: 180, clientY: 35 }] });
        expect(screen.getByTestId('current-card')).toHaveTextContent('1');

        fireEvent.touchStart(area, { targetTouches: [{ clientX: 100, clientY: 30 }] });
        fireEvent.touchEnd(area, { changedTouches: [{ clientX: 180, clientY: 200 }] });
        expect(screen.getByTestId('current-card')).toHaveTextContent('1');
    });

    it('completes all cards and restarts a fresh temporary deck', () => {
        renderSession();

        for (let remaining = 10; remaining > 0; remaining -= 1) {
            expect(screen.getByTestId('card-count')).toHaveTextContent(String(remaining));
            fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
        }

        expect(screen.getByRole('status')).toHaveTextContent('You finished the demo');
        expect(screen.queryByTestId('current-card')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');

        fireEvent.click(screen.getByRole('button', { name: 'Restart demo' }));
        expect(screen.getByTestId('current-card')).toHaveTextContent('1');
        expect(screen.getByTestId('card-count')).toHaveTextContent('10');
    });

    it('jumps to a carousel selection and revives a previously learned card', async () => {
        const { rerender } = renderSession();
        fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
        expect(screen.getByTestId('current-card')).toHaveTextContent('2');

        rerender(
            <MemoryRouter>
                <DemoFlashcardSession
                    language="en"
                    badgeLabel="Interactive"
                    demoSelection={{ cardId: 1, defIndex: 0, form: 'v1', requestId: 1 }}
                />
            </MemoryRouter>,
        );

        await waitFor(() => expect(screen.getByTestId('current-card')).toHaveTextContent('1'));
        expect(screen.getByTestId('card-count')).toHaveTextContent('10');
    });

    it('ignores multi-touch and cancelled gestures', () => {
        const { container } = renderSession();
        const area = container.querySelector('.flashcard-main-area');

        fireEvent.touchStart(area, {
            targetTouches: [{ clientX: 200, clientY: 20 }, { clientX: 210, clientY: 30 }],
        });
        fireEvent.touchEnd(area, { changedTouches: [{ clientX: 20, clientY: 20 }] });
        expect(screen.getByTestId('current-card')).toHaveTextContent('1');

        fireEvent.touchStart(area, { targetTouches: [{ clientX: 200, clientY: 20 }] });
        fireEvent.touchCancel(area);
        fireEvent.touchEnd(area, { changedTouches: [{ clientX: 20, clientY: 20 }] });
        expect(screen.getByTestId('current-card')).toHaveTextContent('1');
    });
});
