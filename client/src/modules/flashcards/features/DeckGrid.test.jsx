import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DeckGrid from './DeckGrid';

const t = {
    restartGroup: 'Reiniciar',
    complete: '✓ completo',
    newStr: 'nuevo',
    loadingCategories: '…',
    renameTopicHint: 'Clic para cambiar el nombre',
    groups: {},
};

const categoryColors = { verbs: '#10b981' };

const baseProps = {
    isNestedCatalog: true,
    visibleNestedDecks: ['1-basic/my_words', '1-basic/action'],
    visibleGroups: [],
    deckSummaries: {
        '1-basic/my_words': { total: 3, learned: 1, topicName: 'Trabajo' },
        '1-basic/action': { total: 10, learned: 2 },
    },
    currentDeckName: null,
    currentCategory: 'verbs',
    language: 'es',
    t,
    categoryColors,
    onGroupClick: vi.fn(),
    onGroupReset: vi.fn(),
    onReorderGroups: vi.fn(),
};

describe('DeckGrid — renombrar mazo personal desde la grilla', () => {
    it('shows the personal deck name as editable and NOT the catalog deck', () => {
        render(<DeckGrid {...baseProps} onDeckClick={vi.fn()} onDeckReset={vi.fn()} onReorderNestedDecks={vi.fn()} />);

        expect(screen.getByTitle(t.renameTopicHint)).toHaveTextContent('Trabajo');
        // "Action" (catálogo) no debe ser editable — no tiene el título/hint de renombrar.
        expect(screen.queryAllByTitle(t.renameTopicHint)).toHaveLength(1);
    });

    it('clicking the personal deck name opens an inline input without opening the deck', () => {
        const onDeckClick = vi.fn();
        render(<DeckGrid {...baseProps} onDeckClick={onDeckClick} onDeckReset={vi.fn()} onReorderNestedDecks={vi.fn()} />);

        fireEvent.click(screen.getByTitle(t.renameTopicHint));

        expect(screen.getByDisplayValue('Trabajo')).toBeInTheDocument();
        expect(onDeckClick).not.toHaveBeenCalled();
    });

    it('commits the new name on Enter and calls onRenameTopic with the deck sentinel + trimmed value', () => {
        const onRenameTopic = vi.fn();
        render(<DeckGrid {...baseProps} onDeckClick={vi.fn()} onDeckReset={vi.fn()} onReorderNestedDecks={vi.fn()} onRenameTopic={onRenameTopic} />);

        fireEvent.click(screen.getByTitle(t.renameTopicHint));
        const input = screen.getByDisplayValue('Trabajo');
        fireEvent.change(input, { target: { value: '  Palabras de viaje  ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.blur(input);

        expect(onRenameTopic).toHaveBeenCalledWith('1-basic/my_words', 'Palabras de viaje');
    });

    it('cancels on Escape without calling onRenameTopic', () => {
        const onRenameTopic = vi.fn();
        render(<DeckGrid {...baseProps} onDeckClick={vi.fn()} onDeckReset={vi.fn()} onReorderNestedDecks={vi.fn()} onRenameTopic={onRenameTopic} />);

        fireEvent.click(screen.getByTitle(t.renameTopicHint));
        const input = screen.getByDisplayValue('Trabajo');
        fireEvent.change(input, { target: { value: 'algo distinto' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(onRenameTopic).not.toHaveBeenCalled();
        expect(screen.queryByDisplayValue('algo distinto')).not.toBeInTheDocument();
    });

    it('clicking anywhere else on the personal deck card still opens the deck', () => {
        const onDeckClick = vi.fn();
        render(<DeckGrid {...baseProps} onDeckClick={onDeckClick} onDeckReset={vi.fn()} onReorderNestedDecks={vi.fn()} />);

        fireEvent.click(screen.getByText('1 / 3'));
        expect(onDeckClick).toHaveBeenCalledWith('1-basic/my_words');
    });
});
