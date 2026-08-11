import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CategorySelector from './CategorySelector';

const mockSetIsCatalogVisible = vi.fn();
const mockSetSelectedGroup = vi.fn();
const mockChangeDeck = vi.fn();

vi.mock('../../../context/AuthContext', () => ({
    useAuth: () => ({
        user: { email: 'test@example.com', catalog_preferences: null },
        updateCatalogPreferences: vi.fn(),
    }),
}));

vi.mock('../../../context/UIContext', () => ({
    useUIContext: () => ({
        language: 'en',
        studyLanguage: 'en',
    }),
}));

vi.mock('../../../context/AppContext', () => ({
    useDialog: () => ({
        confirm: vi.fn(),
    }),
}));

vi.mock('../context/FlashcardUiContext', () => ({
    useFlashcardUiContext: () => ({
        setIsCatalogVisible: mockSetIsCatalogVisible,
    }),
}));

vi.mock('../context/CategoryContext', () => ({
    useCategoryContext: () => ({
        categories: ['nouns', 'verbs'],
        categoryTotals: { nouns: 10, verbs: 20 },
        areCategoryTotalsLoading: false,
        currentCategory: 'nouns',
        changeCategory: vi.fn(),
        moveCategory: vi.fn(),
        recentlyFinishedDecks: [],
        isLoading: false,
    }),
}));

vi.mock('../context/FlashcardContext', () => ({
    useFlashcardContext: () => ({
        deckNames: ['nouns-basic'],
        deckSummaries: { 'nouns-basic': { total: 10, learned: 0 } },
        currentDeckName: 'nouns-basic',
        changeDeck: mockChangeDeck,
        masterData: [
            { id: 1, group_name: 'Action', learned: false },
            { id: 2, group_name: 'Action', learned: false },
        ],
        setSelectedGroup: mockSetSelectedGroup,
        resetDeckByName: vi.fn(),
        resetGroup: vi.fn(),
    }),
}));

describe('CategorySelector', () => {
    it('closes the category selector when selecting a deck card', () => {
        render(<CategorySelector />);
        const deckCard = screen.getByText('Nouns Basic');
        fireEvent.click(deckCard);

        expect(mockChangeDeck).toHaveBeenCalledWith('nouns-basic');
        expect(mockSetIsCatalogVisible).toHaveBeenCalledWith(false);
    });
});
