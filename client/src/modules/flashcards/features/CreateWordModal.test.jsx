import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateWordModal from './CreateWordModal';

const previewWord = vi.fn();
const createWord = vi.fn();
const renamePersonalDeck = vi.fn();
const changeCategory = vi.fn();
const changeDeck = vi.fn();
const refreshPersonalWords = vi.fn();
const onClose = vi.fn();

vi.mock('../composition', () => ({
    personalWordPort: {
        previewWord: (...args) => previewWord(...args),
        createWord: (...args) => createWord(...args),
        renamePersonalDeck: (...args) => renamePersonalDeck(...args),
    },
}));

vi.mock('../../../context/UIContext', () => ({
    useUIContext: () => ({ language: 'es', studyLanguage: 'en' }),
}));

vi.mock('../context/CategoryContext', () => ({
    useCategoryContext: () => ({ changeCategory }),
}));

vi.mock('../context/FlashcardContext', () => ({
    useFlashcardContext: () => ({ changeDeck, refreshPersonalWords }),
}));

async function typeAndSubmit(word) {
    const input = screen.getByLabelText(/palabra o frase/i);
    fireEvent.change(input, { target: { value: word } });
    fireEvent.click(screen.getByRole('button', { name: /crear con ia/i }));
}

describe('CreateWordModal', () => {
    beforeEach(() => {
        previewWord.mockReset();
        createWord.mockReset();
        renamePersonalDeck.mockReset();
        changeCategory.mockReset();
        changeDeck.mockReset();
        refreshPersonalWords.mockReset();
        onClose.mockReset();
    });

    it('previews the destination before creating, then creates on confirm', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [{
                duplicate: false,
                category: 'nouns',
                level: '1-basic',
                name: 'table',
                is_new_deck: false,
                existing_topic_name: 'Muebles de casa',
            }],
        });
        createWord.mockResolvedValueOnce({
            duplicate: false,
            category: 'nouns',
            level: '1-basic',
            is_new_deck: false,
            card: { name: 'table' },
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('table');

        expect(previewWord).toHaveBeenCalledWith({ word: 'table', courseDirection: 'es_en' });
        await waitFor(() => expect(screen.getByText(/muebles de casa/i)).toBeInTheDocument());
        // Todavía no debería haber gastado en generación real.
        expect(createWord).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /confirmar y crear/i }));

        await waitFor(() => expect(createWord).toHaveBeenCalledWith({
            word: 'table',
            courseDirection: 'es_en',
            categoryOverride: 'nouns',
            levelOverride: '1-basic',
        }));
        await waitFor(() => expect(screen.getByText(/creada/i)).toBeInTheDocument());
        expect(refreshPersonalWords).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /ver en/i }));
        expect(changeCategory).toHaveBeenCalledWith('nouns');
        expect(changeDeck).toHaveBeenCalledWith('1-basic/my_words');
        expect(onClose).toHaveBeenCalled();
    });

    it('lets the user cancel out of the candidates preview without creating anything', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'nouns', level: '1-basic', name: 'table', is_new_deck: true }],
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('table');
        await waitFor(() => expect(screen.getByRole('button', { name: /confirmar y crear/i })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));

        expect(screen.getByLabelText(/palabra o frase/i)).toBeInTheDocument();
        expect(createWord).not.toHaveBeenCalled();
    });

    it('shows a duplicate candidate disabled and unselected, keeping confirm disabled', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: true, category: 'nouns', level: '1-basic', name: 'table', is_new_deck: false }],
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('table');

        await waitFor(() => expect(screen.getByText(/ya la ten/i)).toBeInTheDocument());
        expect(screen.getByRole('checkbox')).toBeDisabled();
        expect(screen.getByRole('checkbox')).not.toBeChecked();
        expect(screen.getByRole('button', { name: /confirmar y crear/i })).toBeDisabled();
        expect(createWord).not.toHaveBeenCalled();
    });

    it('shows two candidates for a grammatically ambiguous word and creates both on confirm', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [
                { duplicate: false, category: 'verbs', level: '2-intermediate', name: 'appreciate', is_new_deck: true },
                { duplicate: false, category: 'nouns', level: '3-advanced', name: 'appreciation', is_new_deck: true },
            ],
        });
        createWord
            .mockResolvedValueOnce({ duplicate: false, category: 'verbs', level: '2-intermediate', is_new_deck: true, card: { name: 'appreciate' } })
            .mockResolvedValueOnce({ duplicate: false, category: 'nouns', level: '3-advanced', is_new_deck: true, card: { name: 'appreciation' } });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('appreciate');

        await waitFor(() => expect(screen.getByText('appreciate')).toBeInTheDocument());
        expect(screen.getByText('appreciation')).toBeInTheDocument();
        expect(screen.getByText(/2 usos comunes/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /confirmar y crear/i }));

        await waitFor(() => expect(createWord).toHaveBeenCalledTimes(2));
        expect(createWord).toHaveBeenNthCalledWith(1, {
            word: 'appreciate', courseDirection: 'es_en', categoryOverride: 'verbs', levelOverride: '2-intermediate',
        });
        expect(createWord).toHaveBeenNthCalledWith(2, {
            word: 'appreciate', courseDirection: 'es_en', categoryOverride: 'nouns', levelOverride: '3-advanced',
        });

        await waitFor(() => expect(screen.getAllByText(/^creada$/i)).toHaveLength(2));
    });

    it('lets the user exclude a candidate by unchecking it before confirming', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [
                { duplicate: false, category: 'verbs', level: '2-intermediate', name: 'appreciate', is_new_deck: true },
                { duplicate: false, category: 'nouns', level: '3-advanced', name: 'appreciation', is_new_deck: true },
            ],
        });
        createWord.mockResolvedValueOnce({
            duplicate: false, category: 'verbs', level: '2-intermediate', is_new_deck: true, card: { name: 'appreciate' },
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('appreciate');
        await waitFor(() => expect(screen.getByText('appreciation')).toBeInTheDocument());

        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[1]);

        fireEvent.click(screen.getByRole('button', { name: /confirmar y crear/i }));

        await waitFor(() => expect(createWord).toHaveBeenCalledTimes(1));
        expect(createWord).toHaveBeenCalledWith({
            word: 'appreciate', courseDirection: 'es_en', categoryOverride: 'verbs', levelOverride: '2-intermediate',
        });
    });

    it('re-previews a row with overrides when the user changes its category, correcting the AI pick', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '2-intermediate', name: 'appreciate', is_new_deck: true }],
        });
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'adjectives', level: '2-intermediate', name: 'appreciate', is_new_deck: true }],
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('appreciate');
        await waitFor(() => expect(screen.getByText('appreciate')).toBeInTheDocument());

        const categorySelect = screen.getByLabelText('Categoría');
        fireEvent.change(categorySelect, { target: { value: 'adjectives' } });

        await waitFor(() => expect(previewWord).toHaveBeenLastCalledWith({
            word: 'appreciate', courseDirection: 'es_en', categoryOverride: 'adjectives', levelOverride: '2-intermediate',
        }));
        await waitFor(() => expect(categorySelect.value).toBe('adjectives'));
    });

    it('lets the user add a manual classification the AI did not suggest', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '2-intermediate', name: 'appreciate', is_new_deck: true }],
        });
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'nouns', level: '2-intermediate', name: 'appreciate', is_new_deck: true }],
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('appreciate');
        await waitFor(() => expect(screen.getByText('appreciate')).toBeInTheDocument());
        expect(screen.getAllByRole('checkbox')).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: /agregar otra clasificación/i }));

        await waitFor(() => expect(previewWord).toHaveBeenCalledTimes(2));
        expect(previewWord).toHaveBeenLastCalledWith({
            word: 'appreciate', courseDirection: 'es_en', categoryOverride: 'nouns', levelOverride: '2-intermediate',
        });
        await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    });

    it('offers to name the deck only when confirming created it (is_new_deck), and saves it', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '2-intermediate', name: 'acquire', is_new_deck: true }],
        });
        createWord.mockResolvedValueOnce({
            duplicate: false, category: 'verbs', level: '2-intermediate', is_new_deck: true, card: { name: 'acquire' },
        });
        renamePersonalDeck.mockResolvedValueOnce({ success: true });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('acquire');
        await waitFor(() => expect(screen.getByRole('button', { name: /confirmar y crear/i })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /confirmar y crear/i }));
        await waitFor(() => expect(screen.getByLabelText(/ponele un nombre/i)).toBeInTheDocument());

        const nameInput = screen.getByLabelText(/ponele un nombre/i);
        fireEvent.change(nameInput, { target: { value: '  Palabras de trabajo  ' } });
        fireEvent.click(screen.getByRole('button', { name: /guardar nombre/i }));

        await waitFor(() => expect(renamePersonalDeck).toHaveBeenCalledWith({
            category: 'verbs',
            level: '2-intermediate',
            topicName: 'Palabras de trabajo',
            courseDirection: 'es_en',
        }));
        await waitFor(() => expect(screen.queryByLabelText(/ponele un nombre/i)).not.toBeInTheDocument());
    });

    it('lets the user skip naming the new deck without calling the port', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '2-intermediate', name: 'acquire', is_new_deck: true }],
        });
        createWord.mockResolvedValueOnce({
            duplicate: false, category: 'verbs', level: '2-intermediate', is_new_deck: true, card: { name: 'acquire' },
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('acquire');
        await waitFor(() => expect(screen.getByRole('button', { name: /confirmar y crear/i })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /confirmar y crear/i }));
        await waitFor(() => expect(screen.getByLabelText(/ponele un nombre/i)).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /omitir/i }));

        expect(screen.queryByLabelText(/ponele un nombre/i)).not.toBeInTheDocument();
        expect(renamePersonalDeck).not.toHaveBeenCalled();
    });

    it('never offers to name the deck when it already existed', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '2-intermediate', name: 'acquire', is_new_deck: false }],
        });
        createWord.mockResolvedValueOnce({
            duplicate: false, category: 'verbs', level: '2-intermediate', is_new_deck: false, card: { name: 'acquire' },
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('acquire');
        await waitFor(() => expect(screen.getByRole('button', { name: /confirmar y crear/i })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /confirmar y crear/i }));
        await waitFor(() => expect(screen.getByText(/creada/i)).toBeInTheDocument());

        expect(screen.queryByLabelText(/ponele un nombre/i)).not.toBeInTheDocument();
    });

    it('shows an error state when the preview call fails, without losing the typed word', async () => {
        previewWord.mockRejectedValueOnce(new Error('boom'));

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('table');

        await waitFor(() => expect(screen.getByText(/no se pudo crear/i)).toBeInTheDocument());
        expect(screen.getByText('boom')).toBeInTheDocument();
        expect(screen.getByDisplayValue('table')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    });

    it('does not call the port for a blank word', async () => {
        render(<CreateWordModal onClose={onClose} />);
        expect(screen.getByRole('button', { name: /crear con ia/i })).toBeDisabled();
        expect(previewWord).not.toHaveBeenCalled();
    });
});
