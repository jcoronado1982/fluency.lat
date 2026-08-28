import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateWordModal from './CreateWordModal';

const previewWord = vi.fn();
const createWord = vi.fn();
const renamePersonalDeck = vi.fn();
const getPersonalWordsSummary = vi.fn();
const changeCategory = vi.fn();
const changeDeck = vi.fn();
const refreshPersonalWords = vi.fn();
const onClose = vi.fn();

vi.mock('../composition', () => ({
    personalWordPort: {
        previewWord: (...args) => previewWord(...args),
        createWord: (...args) => createWord(...args),
        renamePersonalDeck: (...args) => renamePersonalDeck(...args),
        getPersonalWordsSummary: (...args) => getPersonalWordsSummary(...args),
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
    const input = screen.getByLabelText(/palabra o expresión/i);
    fireEvent.change(input, { target: { value: word } });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
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
        getPersonalWordsSummary.mockReset();
        // Default: usuario sin temas creados todavía en ninguna categoría — mantiene el
        // comportamiento previo (botón "agregar otra clasificación") en los tests que no
        // ejercitan el picker de temas explícitamente.
        getPersonalWordsSummary.mockResolvedValue({ decks: [] });
    });

    it('previews the destination before creating, then creates on confirm', async () => {
        getPersonalWordsSummary.mockImplementation(async ({ category }) => (
            category === 'nouns'
                ? { decks: [{ deck: '1-basic/my_words', total: 4, learned: 1, topic_name: 'Muebles de casa' }] }
                : { decks: [] }
        ));
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

        await waitFor(() => expect(previewWord).toHaveBeenCalledWith(
            expect.objectContaining({ word: 'table', courseDirection: 'es_en' }),
        ));
        // El selector de "Mazo destino" muestra el nombre del tema ya existente, no un nivel crudo.
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
        await waitFor(() => expect(screen.getAllByText(/creada/i).length).toBeGreaterThan(0));
        expect(refreshPersonalWords).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /ver en/i }));
        expect(changeCategory).toHaveBeenCalledWith('nouns');
        expect(changeDeck).toHaveBeenCalledWith('1-basic/my_words', null, 'nouns', { word: 'table' });
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

        expect(screen.getByLabelText(/palabra o expresión/i)).toBeInTheDocument();
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

        const nameInputs = screen.getAllByLabelText(/nombre del nuevo tema/i);
        fireEvent.change(nameInputs[0], { target: { value: 'Verbos de aprecio' } });
        fireEvent.change(nameInputs[1], { target: { value: 'Sustantivos de aprecio' } });

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

        const nameInput = screen.getByLabelText(/nombre del nuevo tema/i);
        fireEvent.change(nameInput, { target: { value: 'Verbos de aprecio' } });

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

    // Regresión: la categoría gramatical la decide la IA, pero EN QUÉ mazo (tema) ya existente se
    // guarda es una decisión del usuario, no un nivel de dificultad automático — el botón pasa a
    // listar los temas ya creados por nombre en vez de una categoría gramatical vacía.
    it('shows the topic name (not a raw level) once the row resolves to an existing personal deck', async () => {
        getPersonalWordsSummary.mockImplementation(async ({ category }) => (
            category === 'verbs'
                ? { decks: [{ deck: '1-basic/my_words', total: 3, learned: 1, topic_name: 'Trabajo' }] }
                : { decks: [] }
        ));
        previewWord.mockResolvedValueOnce({
            candidates: [{
                duplicate: false, category: 'verbs', level: '1-basic', name: 'spike', is_new_deck: false, existing_topic_name: 'Trabajo',
            }],
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('spike');
        await waitFor(() => expect(screen.getByText('spike')).toBeInTheDocument());

        await waitFor(() => expect(getPersonalWordsSummary).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByLabelText('Destino').value).toBe('1-basic'));
        expect(screen.getByRole('option', { name: 'Trabajo' })).toBeInTheDocument();
    });

    // Regresión: el nivel de un mazo NUEVO lo decide la IA (sabe más que el usuario qué tan
    // difícil es la palabra) — el selector "Destino" no debe ofrecer los otros dos niveles como
    // "nuevo tema" para que el usuario los elija a mano. Los temas YA EXISTENTES en otros niveles
    // sí siguen siendo elegibles (esa sí es una decisión del usuario: a cuál de sus mazos agregarla).
    it('only offers the AI-picked level as "new" — not the other two — while still offering existing topics at other levels', async () => {
        getPersonalWordsSummary.mockImplementation(async ({ category }) => (
            category === 'verbs'
                ? { decks: [{ deck: '3-advanced/my_words', total: 2, learned: 0, topic_name: 'Viajes' }] }
                : { decks: [] }
        ));
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '1-basic', name: 'spike', is_new_deck: true }],
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('spike');
        await waitFor(() => expect(screen.getByText('spike')).toBeInTheDocument());
        await waitFor(() => expect(getPersonalWordsSummary).toHaveBeenCalled());

        // Nivel clasificado por la IA (1-basic, nuevo, sin mostrar el nivel — la IA ya decidió) y
        // el tema ya existente (Viajes, 3-advanced): ambos elegibles, nada más — 2-intermediate no
        // tiene mazo existente y NO es el nivel que clasificó la IA, así que no debe ofrecerse.
        await waitFor(() => expect(screen.getByLabelText('Destino').options).toHaveLength(2));
        expect(screen.getByRole('option', { name: 'Nuevo tema' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Viajes' })).toBeInTheDocument();
    });

    it('offers the user\'s existing topics (across categories) instead of a blank category when adding another row', async () => {
        getPersonalWordsSummary.mockImplementation(async ({ category }) => (
            category === 'verbs'
                ? { decks: [{ deck: '1-basic/my_words', total: 3, learned: 1, topic_name: 'Trabajo' }] }
                : { decks: [] }
        ));
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'nouns', level: '2-intermediate', name: 'spike', is_new_deck: true }],
        });
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '1-basic', name: 'spike', is_new_deck: false, existing_topic_name: 'Trabajo' }],
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('spike');
        await waitFor(() => expect(screen.getByText('spike')).toBeInTheDocument());
        await waitFor(() => expect(getPersonalWordsSummary).toHaveBeenCalled());

        const addButton = await screen.findByRole('button', { name: /agregar a otro tema/i });
        fireEvent.click(addButton);

        const topicOption = await screen.findByRole('button', { name: /trabajo.*verbos.*básico/i });
        fireEvent.click(topicOption);

        await waitFor(() => expect(previewWord).toHaveBeenLastCalledWith({
            word: 'spike', courseDirection: 'es_en', categoryOverride: 'verbs', levelOverride: '1-basic',
        }));
        await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    });

    // Regresión: nadie estudia un mazo de una sola carta — si Gemini clasifica la palabra en un
    // nivel donde el usuario todavía no tiene mazo, pero SÍ tiene un tema en la misma categoría
    // gramatical (otro nivel), se lo sugerimos activamente en vez de dejar que solo lo descubra
    // por su cuenta en el desplegable.
    it('proactively suggests an existing topic in the same category when the AI-picked level has none', async () => {
        getPersonalWordsSummary.mockImplementation(async ({ category }) => (
            category === 'verbs'
                ? { decks: [{ deck: '1-basic/my_words', total: 5, learned: 2, topic_name: 'Trabajo' }] }
                : { decks: [] }
        ));
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '2-intermediate', name: 'negotiate', is_new_deck: true }],
        });
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '1-basic', name: 'negotiate', is_new_deck: false, existing_topic_name: 'Trabajo' }],
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('negotiate');
        await waitFor(() => expect(screen.getByText('negotiate')).toBeInTheDocument());
        await waitFor(() => expect(getPersonalWordsSummary).toHaveBeenCalled());

        const suggestionButton = await screen.findByRole('button', { name: /usar verbos · básico/i });
        expect(screen.getByText(/mazo sugerido/i)).toBeInTheDocument();

        fireEvent.click(suggestionButton);

        await waitFor(() => expect(previewWord).toHaveBeenLastCalledWith({
            word: 'negotiate', courseDirection: 'es_en', categoryOverride: 'verbs', levelOverride: '1-basic',
        }));
        await waitFor(() => expect(screen.getByLabelText('Destino').value).toBe('1-basic'));
    });

    it('does not suggest an existing topic when the AI-picked level already matches one', async () => {
        getPersonalWordsSummary.mockImplementation(async ({ category }) => (
            category === 'verbs'
                ? { decks: [{ deck: '1-basic/my_words', total: 5, learned: 2, topic_name: 'Trabajo' }] }
                : { decks: [] }
        ));
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '1-basic', name: 'negotiate', is_new_deck: false, existing_topic_name: 'Trabajo' }],
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('negotiate');
        await waitFor(() => expect(screen.getByText('negotiate')).toBeInTheDocument());
        await waitFor(() => expect(getPersonalWordsSummary).toHaveBeenCalled());

        expect(screen.queryByText(/mazo sugerido/i)).not.toBeInTheDocument();
    });

    it('requires naming the new deck before confirming creation, and saves it', async () => {
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '2-intermediate', name: 'acquire', is_new_deck: true }],
        });
        createWord.mockResolvedValueOnce({
            duplicate: false, category: 'verbs', level: '2-intermediate', is_new_deck: true, card: { name: 'acquire' },
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('acquire');
        await waitFor(() => expect(screen.getByLabelText(/nombre del nuevo tema/i)).toBeInTheDocument());

        expect(screen.getByRole('button', { name: /confirmar y crear/i })).toBeDisabled();

        const nameInput = screen.getByLabelText(/nombre del nuevo tema/i);
        fireEvent.change(nameInput, { target: { value: '  Palabras de trabajo  ' } });

        expect(screen.getByRole('button', { name: /confirmar y crear/i })).not.toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /confirmar y crear/i }));

        await waitFor(() => expect(renamePersonalDeck).toHaveBeenCalledWith({
            category: 'verbs',
            level: '2-intermediate',
            topicName: 'Palabras de trabajo',
            courseDirection: 'es_en',
        }));
        await waitFor(() => expect(screen.getAllByText(/creada/i).length).toBeGreaterThan(0));
        expect(screen.getByText('Verbos')).toBeInTheDocument();
        expect(screen.getByText('Palabras de trabajo')).toBeInTheDocument();
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
        await waitFor(() => expect(screen.getAllByText(/creada/i).length).toBeGreaterThan(0));

        expect(screen.queryByLabelText(/nombre del nuevo tema/i)).not.toBeInTheDocument();
    });

    // Regresión ("vos debés recomendarlo y colocar esa recomendación como primera opción, el
    // usuario lo puede cambiar entre sus otros decks o crear uno nuevo"): "crear otra palabra"
    // le manda a Gemini la lista COMPLETA de mazos personales existentes (no solo el último usado)
    // en la ÚNICA llamada de preview — nunca clasifica libre para después volver a preguntar con
    // overrides.
    it('lets the user create another word, sending the full existing-topics list in a single preview call', async () => {
        let verbsHasDeck = false;
        getPersonalWordsSummary.mockImplementation(async ({ category }) => (
            category === 'verbs' && verbsHasDeck
                ? { decks: [{ deck: '1-basic/my_words', total: 1, learned: 0 }] }
                : { decks: [] }
        ));
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '1-basic', name: 'acquire', is_new_deck: true }],
        });
        createWord.mockImplementationOnce(async () => {
            verbsHasDeck = true;
            return { duplicate: false, category: 'verbs', level: '1-basic', is_new_deck: true, card: { name: 'acquire' } };
        });

        render(<CreateWordModal onClose={onClose} />);
        await typeAndSubmit('acquire');
        await waitFor(() => expect(screen.getByLabelText(/nombre del nuevo tema/i)).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/nombre del nuevo tema/i), { target: { value: 'Trabajo' } });
        fireEvent.click(screen.getByRole('button', { name: /confirmar y crear/i }));
        await waitFor(() => expect(screen.getAllByText(/creada/i).length).toBeGreaterThan(0));

        // Tras crear, la lista de mazos existentes se refresca en segundo plano — se espera a que
        // el refresh (con el mazo recién creado ya reflejado) se dispare antes de crear otra.
        await waitFor(() => expect(
            getPersonalWordsSummary.mock.calls.filter(([arg]) => arg.category === 'verbs').length,
        ).toBeGreaterThanOrEqual(2));

        // El backend (Gemini simulado) ya ve el mazo recién creado en la lista y lo recomienda
        // directamente — una sola respuesta, no dos.
        previewWord.mockResolvedValueOnce({
            candidates: [{ duplicate: false, category: 'verbs', level: '1-basic', name: 'negotiate', is_new_deck: false }],
        });

        fireEvent.click(screen.getByRole('button', { name: /crear otra palabra/i }));
        expect(screen.getByLabelText(/palabra o expresión/i)).toHaveValue('');

        await typeAndSubmit('negotiate');
        await waitFor(() => expect(screen.getByText('negotiate')).toBeInTheDocument());

        expect(previewWord).toHaveBeenCalledTimes(2);
        expect(previewWord).toHaveBeenLastCalledWith({
            word: 'negotiate',
            courseDirection: 'es_en',
            existingTopics: [{ category: 'verbs', level: '1-basic', topicName: null, total: 1, learned: 0 }],
        });
        await waitFor(() => expect(screen.getByLabelText('Destino').value).toBe('1-basic'));
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
        expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
        expect(previewWord).not.toHaveBeenCalled();
    });
});
