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

// "Crear palabra" (mazo personal): la card real de `composition.js` también exporta
// `imageCompressionService` (heic2any), que revienta en jsdom ("Worker is not defined") — se
// mockea el módulo entero para que CategorySelector (y CreateWordModal, que ahora importa desde
// acá) nunca toquen ese import real.
vi.mock('../composition', () => ({
    personalWordPort: {
        createWord: vi.fn(),
        getPersonalWordsSummary: vi.fn(async () => ({ exists: false, deck: 'my_words', total: 0 })),
    },
    flashcardPort: {
        searchWords: vi.fn(async () => ({
            results: [
                {
                    category: 'nouns',
                    deck: '1-basic/nouns/essentials.json',
                    deck_display_name: '1-basic/nouns/essentials',
                    level: '1-basic',
                    card_index: 3,
                    name: 'table',
                    translation: 'mesa',
                    example: 'the table is clean',
                    is_personal: false,
                },
            ],
        })),
    },
}));

describe('CategorySelector', () => {
    it('closes the category selector when selecting a deck card', () => {
        render(<CategorySelector />);
        const deckCard = screen.getByText('Nouns Basic');
        fireEvent.click(deckCard);

        expect(mockChangeDeck).toHaveBeenCalledWith('nouns-basic');
        expect(mockSetIsCatalogVisible).toHaveBeenCalledWith(false);
    });

    it('searches for words and navigates to the target deck and card when a result is clicked', async () => {
        render(<CategorySelector />);

        const searchInput = screen.getByLabelText('Buscar palabras');
        fireEvent.change(searchInput, { target: { value: 'table' } });

        const resultCard = await screen.findByText('table');
        expect(resultCard).toBeInTheDocument();

        fireEvent.click(resultCard);

        expect(mockChangeDeck).toHaveBeenCalledWith(
            '1-basic/nouns/essentials',
            3,
            'nouns',
            { word: 'table' },
        );
        expect(mockSetIsCatalogVisible).toHaveBeenCalledWith(false);
    });
});
