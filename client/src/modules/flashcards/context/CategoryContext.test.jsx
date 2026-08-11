import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryProvider, useCategoryContext } from './CategoryContext';

vi.mock('../composition', () => ({
    flashcardPort: {
        fetchCategories: vi.fn(async () => ({
            success: true,
            categories: ['verbs', 'nouns', 'adjectives', 'adverbs'],
        })),
    },
}));

vi.mock('../preload', () => ({
    consumeCategoryPreload: vi.fn(async () => null),
}));

const stableUser = { email: 'user@example.com', catalog_preferences: null };
const updateCatalogPreferences = vi.fn();

vi.mock('../../../context/AuthContext', () => ({
    useAuth: () => ({
        isAuthenticated: true,
        user: stableUser,
        updateCatalogPreferences,
    }),
}));

vi.mock('../../../context/UIContext', () => ({
    useUIContext: () => ({ studyLanguage: 'en' }),
}));

function Probe() {
    const { categories, recentlyFinishedDecks, markDeckFinished } = useCategoryContext();
    return (
        <div>
            <div data-testid="order">{categories.join(',')}</div>
            <div data-testid="recent-decks">
                {recentlyFinishedDecks.map((entry) => `${entry.category}:${entry.deck}`).join(',')}
            </div>
            <button type="button" onClick={() => markDeckFinished('verbs', '1-basic/action')}>finish-deck</button>
        </div>
    );
}

describe('CategoryProvider', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('does NOT reorder the category list when a deck inside it is finished', async () => {
        // El usuario pidió explícitamente que la categoría de nivel superior se quede donde la
        // organiza el catálogo/sus preferencias — solo el mazo dentro de ella debe hundirse
        // (eso lo prueba CategorySelector, que consume recentlyFinishedDecks).
        render(
            <CategoryProvider>
                <Probe />
            </CategoryProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('order').textContent).not.toBe(''));
        const initialOrder = screen.getByTestId('order').textContent;

        await act(async () => {
            screen.getByText('finish-deck').click();
        });

        expect(screen.getByTestId('order').textContent).toBe(initialOrder);
    });

    it('accumulates recently finished decks instead of overwriting the previous one', async () => {
        render(
            <CategoryProvider>
                <Probe />
            </CategoryProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('order').textContent).not.toBe(''));

        await act(async () => {
            screen.getByText('finish-deck').click();
        });

        expect(screen.getByTestId('recent-decks').textContent).toBe('verbs:1-basic/action');
    });
});
