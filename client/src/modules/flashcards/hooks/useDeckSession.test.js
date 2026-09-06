import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeckSession } from './useDeckSession';

const fetchDecksForCategory = vi.fn();
const fetchDeckData = vi.fn();
const getPersonalWordsSummary = vi.fn();
// Referencias ESTABLES (no recreadas en cada render) — un mock que devuelve `vi.fn()` nuevo en
// cada llamada rompe cualquier `useCallback`/`useEffect` que la tenga como dependencia y provoca
// un loop de renders infinito ("Maximum update depth exceeded"), no reproducible en la app real
// (donde los providers sí memoizan) pero sí en un mock ingenuo como este.
const setAppMessage = vi.fn();
const confirmDialog = vi.fn();
const setIsCatalogVisible = vi.fn();
const deleteCardRequest = vi.fn();

// Categoría inventada (no está en NESTED_LEVEL_CATEGORIES) para que el hook no dispare el
// efecto de resúmenes por nivel — mantiene el mock mínimo, enfocado en el comportamiento bajo
// prueba: anteponer el mazo personal a `deckNames`/`deckSummaries` (ver
// docs/modules/flashcards.md §Personal Words).
const TEST_CATEGORY = 'flatcat';
const OTHER_TEST_CATEGORY = 'othercat';

// Mutable vía `vi.hoisted` porque `vi.mock` se iza sobre el resto del archivo: el test de salto
// de búsqueda cruzando de categoría necesita que `currentCategory` cambie entre renders, como lo
// haría `changeCategory` real (ver `context/CategoryContext.jsx`).
const categoryState = vi.hoisted(() => ({ current: 'flatcat' }));

vi.mock('../composition', () => ({
    flashcardPort: {
        fetchDecksForCategory: (...args) => fetchDecksForCategory(...args),
        fetchDeckData: (...args) => fetchDeckData(...args),
        fetchDeckSummaries: vi.fn(async () => ({ success: false })),
        updateCardsBatch: vi.fn(async () => {}),
        deleteDefinition: vi.fn(),
        deleteCard: (...args) => deleteCardRequest(...args),
        resetDeckStatus: vi.fn(),
        updateCardStatus: vi.fn(),
    },
    personalWordPort: {
        getPersonalWordsSummary: (...args) => getPersonalWordsSummary(...args),
    },
}));

vi.mock('../context/CategoryContext', () => ({
    useCategoryContext: () => ({ currentCategory: categoryState.current }),
}));

vi.mock('../context/FlashcardUiContext', () => ({
    useFlashcardUiContext: () => ({ setIsCatalogVisible }),
}));

vi.mock('../../../context/UIContext', () => ({
    useUIContext: () => ({ setAppMessage, language: 'en', studyLanguage: 'en' }),
}));

vi.mock('../../../context/AppContext', () => ({
    useDialog: () => ({ confirm: confirmDialog }),
}));

vi.mock('../../../context/AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: true, user: { email: 'user@example.com' } }),
}));

vi.mock('../adapters/srsOutboxIndexedDb', () => ({
    queueSrsBatch: vi.fn(),
    listSrsBatches: vi.fn(async () => []),
    removeSrsBatch: vi.fn(),
}));

vi.mock('../preload', () => ({
    consumeFlashcardPreload: vi.fn(async () => null),
    resetFlashcardPreload: vi.fn(),
}));

describe('useDeckSession — mazo personal ("Crear palabra")', () => {
    beforeEach(() => {
        categoryState.current = TEST_CATEGORY;
        fetchDecksForCategory.mockReset();
        fetchDeckData.mockReset();
        getPersonalWordsSummary.mockReset();
        fetchDecksForCategory.mockResolvedValue({ success: true, files: ['1-basic/action'] });
        // Nunca resuelve: aísla lo que este archivo prueba (el listado de mazos) de
        // `loadFlashcards`/la carga de contenido de un mazo, que no es el objeto de esta prueba.
        fetchDeckData.mockImplementation(() => new Promise(() => {}));
    });

    it('antepone el mazo personal a deckNames/deckSummaries cuando el usuario tiene uno', async () => {
        getPersonalWordsSummary.mockResolvedValue({
            decks: [{ deck: '1-basic/my_words', total: 2, learned: 1 }],
        });

        const { result } = renderHook(() => useDeckSession());

        await waitFor(() => {
            expect(result.current.deckNames).toContain('1-basic/my_words');
        });
        expect(result.current.deckNames[0]).toBe('1-basic/my_words');
        expect(result.current.deckNames).toContain('1-basic/action');
        expect(result.current.deckSummaries['1-basic/my_words']).toEqual({ total: 2, learned: 1 });
    });

    it('propaga el nombre que el usuario le puso al mazo (rename_personal_deck) a deckSummaries', async () => {
        getPersonalWordsSummary.mockResolvedValue({
            decks: [{ deck: '2-intermediate/my_words', total: 1, learned: 0, topic_name: 'Palabras de trabajo' }],
        });

        const { result } = renderHook(() => useDeckSession());

        await waitFor(() => {
            expect(result.current.deckSummaries['2-intermediate/my_words']?.topicName).toBe('Palabras de trabajo');
        });
    });

    it('no toca deckNames cuando el usuario no tiene mazo personal en esta categoría', async () => {
        getPersonalWordsSummary.mockResolvedValue({ decks: [] });

        const { result } = renderHook(() => useDeckSession());

        await waitFor(() => {
            expect(result.current.deckNames).toEqual(['1-basic/action']);
        });
        expect(getPersonalWordsSummary).toHaveBeenCalledWith({
            category: TEST_CATEGORY,
            courseDirection: 'es_en',
        });
    });

    it('refreshPersonalWords() vuelve a pedir el resumen aunque currentCategory no haya cambiado', async () => {
        // Bug real reportado en vivo: crear una palabra estando YA parado en su categoría no
        // mostraba el mazo nuevo hasta cerrar y volver a abrir la categoría — `CreateWordModal`
        // llama `refreshPersonalWords()` tras crear con éxito para forzar este refetch.
        getPersonalWordsSummary.mockResolvedValueOnce({ decks: [] });

        const { result } = renderHook(() => useDeckSession());

        await waitFor(() => expect(getPersonalWordsSummary).toHaveBeenCalledTimes(1));
        expect(result.current.deckNames).toEqual(['1-basic/action']);

        getPersonalWordsSummary.mockResolvedValueOnce({
            decks: [{ deck: '1-basic/my_words', total: 1, learned: 0 }],
        });
        result.current.refreshPersonalWords();

        await waitFor(() => expect(getPersonalWordsSummary).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(result.current.deckNames).toContain('1-basic/my_words'));
    });

    it('posiciona la sesión en la tarjeta objetivo cuando se llama changeDeck con targetMeta', async () => {
        getPersonalWordsSummary.mockResolvedValue({ decks: [] });
        fetchDeckData.mockResolvedValue([
            { id: 1, word: 'chair', learned: false },
            { id: 2, word: 'table', learned: false },
            { id: 3, word: 'lamp', learned: false },
        ]);

        const { result } = renderHook(() => useDeckSession());

        await waitFor(() => {
            expect(result.current.deckNames).toEqual(['1-basic/action']);
        });

        result.current.changeDeck('1-basic/action', 1, TEST_CATEGORY, { word: 'table' });

        await waitFor(() => {
            expect(result.current.currentIndex).toBe(1);
            expect(result.current.currentCard?.word).toBe('table');
        });
    });

    it('salto de búsqueda a un mazo personal en OTRA categoría no se pisa con el mazo por defecto del catálogo (bug real: la carta buscada nunca se resolvía)', async () => {
        // `CategorySelector.handleSelectSearchResult` llama `changeCategory(result.category)`
        // (mutamos el mock de contexto) y `changeDeck(...)` en el mismo click, sin esperar a que
        // la categoría "asiente" — reproduce ese salto simultáneo.
        fetchDecksForCategory.mockImplementation(async (category) => (
            category === OTHER_TEST_CATEGORY
                ? { success: true, files: ['1-basic/default-deck'] }
                : { success: true, files: ['1-basic/action'] }
        ));
        getPersonalWordsSummary.mockImplementation(async ({ category }) => (
            category === OTHER_TEST_CATEGORY
                ? { decks: [{ deck: '1-basic/my_words', total: 3, learned: 0 }] }
                : { decks: [] }
        ));
        fetchDeckData.mockImplementation(async (_email, category, deck) => {
            if (category === OTHER_TEST_CATEGORY && deck === '1-basic/my_words') {
                return [
                    { id: 1, word: 'apple', learned: false },
                    { id: 2, word: 'banana', learned: false },
                ];
            }
            // El mazo por defecto del catálogo NUNCA debería pedirse en este flujo — si el bug
            // reaparece y `currentDeckName` se pisa con él, esta promesa nunca resuelve y el
            // `waitFor` de abajo expira, marcando la regresión.
            return new Promise(() => {});
        });

        const { result, rerender } = renderHook(() => useDeckSession());

        await waitFor(() => {
            expect(result.current.deckNames).toEqual(['1-basic/action']);
        });

        categoryState.current = OTHER_TEST_CATEGORY;
        result.current.changeDeck('1-basic/my_words', 1, OTHER_TEST_CATEGORY, { word: 'banana' });
        rerender();

        await waitFor(() => {
            expect(result.current.currentDeckName).toBe('1-basic/my_words');
            expect(result.current.currentCard?.word).toBe('banana');
        });
    });

    it('re-seleccionar el mismo mazo resetea reachedDeckEnd y el índice a 0', async () => {
        getPersonalWordsSummary.mockResolvedValue({ decks: [] });
        fetchDecksForCategory.mockResolvedValue({ success: true, files: ['1-basic/action'] });
        fetchDeckData.mockResolvedValue([
            { id: 1, word: 'chair', learned: true },
            { id: 2, word: 'table', learned: false },
        ]);

        const { result } = renderHook(() => useDeckSession());

        await waitFor(() => {
            expect(result.current.deckNames).toEqual(['1-basic/action']);
            expect(result.current.filteredData.length).toBe(1);
        });

        // Simula llegar al final del mazo
        act(() => {
            result.current.nextCard();
        });
        expect(result.current.reachedDeckEnd).toBe(true);

        // Usuario vuelve a tocar el mazo en el selector de categorías
        act(() => {
            result.current.changeDeck('1-basic/action');
        });

        await waitFor(() => {
            expect(result.current.reachedDeckEnd).toBe(false);
            expect(result.current.currentIndex).toBe(0);
            expect(result.current.currentCard?.word).toBe('table');
        });
    });
});

// Curaduría del admin: `deleteCard()` elimina la tarjeta visible del catálogo GENERAL y deja la
// sesión coherente. Lo que se prueba acá son los escenarios de borde de "¿y después qué se ve?"
// (ver la tabla de escenarios en el JSDoc de `deleteCard`, en useDeckSession.js).
describe('useDeckSession — deleteCard (borrado de tarjeta por admin)', () => {
    beforeEach(() => {
        categoryState.current = TEST_CATEGORY;
        fetchDecksForCategory.mockReset();
        fetchDeckData.mockReset();
        getPersonalWordsSummary.mockReset();
        deleteCardRequest.mockReset();
        setAppMessage.mockReset();
        fetchDecksForCategory.mockResolvedValue({ success: true, files: ['1-basic/action'] });
        getPersonalWordsSummary.mockResolvedValue({ decks: [] });
        deleteCardRequest.mockResolvedValue({ success: true, remaining_active: 0 });
    });

    const renderLoadedSession = async (cards) => {
        fetchDeckData.mockResolvedValue(cards);
        const { result } = renderHook(() => useDeckSession());
        await waitFor(() => expect(result.current.masterData.length).toBe(cards.length));
        return result;
    };

    it('quedan tarjetas: avanza a la siguiente y la borrada desaparece del mazo', async () => {
        const result = await renderLoadedSession([
            { name: 'chair', learned: false },
            { name: 'table', learned: false },
            { name: 'lamp', learned: false },
        ]);

        let outcome;
        await act(async () => { outcome = await result.current.deleteCard(); });

        expect(outcome).toBe('advanced');
        expect(result.current.currentCard?.name).toBe('table');
        expect(result.current.filteredData.map((c) => c.name)).toEqual(['table', 'lamp']);
        expect(result.current.deckSummaries['1-basic/action']).toEqual({ total: 2, learned: 0 });
    });

    it('manda el índice REAL en el archivo, no la posición en la lista filtrada', async () => {
        // La tarjeta 0 está aprendida: no entra a `filteredData`, pero sigue ocupando el índice 0
        // del JSON. Borrar la primera visible tiene que apuntar al índice 1, o el backend
        // retiraría la tarjeta equivocada (el `expected_word` es justamente la última defensa).
        const result = await renderLoadedSession([
            { name: 'chair', learned: true },
            { name: 'table', learned: false },
            { name: 'lamp', learned: false },
        ]);

        await act(async () => { await result.current.deleteCard(); });

        expect(deleteCardRequest).toHaveBeenCalledWith(expect.objectContaining({
            category: TEST_CATEGORY,
            deck: '1-basic/action',
            index: 1,
            expectedWord: 'table',
        }));
    });

    it('borrar la última de la lista retrocede una en vez de dejar el índice fuera de rango', async () => {
        const result = await renderLoadedSession([
            { name: 'chair', learned: false },
            { name: 'table', learned: false },
        ]);

        act(() => { result.current.nextCard(); });
        expect(result.current.currentCard?.name).toBe('table');

        let outcome;
        await act(async () => { outcome = await result.current.deleteCard(); });

        expect(outcome).toBe('advanced');
        expect(result.current.currentIndex).toBe(0);
        expect(result.current.currentCard?.name).toBe('chair');
    });

    it('era la última SIN aprender pero quedan aprendidas: cierra el mazo en vez de dejar pantalla vacía', async () => {
        const result = await renderLoadedSession([
            { name: 'chair', learned: true },
            { name: 'table', learned: false },
        ]);

        let outcome;
        await act(async () => { outcome = await result.current.deleteCard(); });

        expect(outcome).toBe('deck_completed');
        expect(result.current.filteredData).toEqual([]);
        expect(result.current.masterData.length).toBe(1);
        // `justCompletedInSession` es lo que hace que FlashcardPage muestre la pantalla de fin
        // de mazo (con la recomendación de continuar) en vez de "No hay tarjetas disponibles".
        expect(result.current.justCompletedInSession).toBe(true);
    });

    it('era la única tarjeta del mazo: informa deck_empty para que la página salte al siguiente mazo', async () => {
        const result = await renderLoadedSession([{ name: 'chair', learned: false }]);

        let outcome;
        await act(async () => { outcome = await result.current.deleteCard(); });

        expect(outcome).toBe('deck_empty');
        expect(result.current.masterData).toEqual([]);
        expect(result.current.filteredData).toEqual([]);
    });

    it('si la petición falla (403/409/red) no toca la sesión y avisa', async () => {
        deleteCardRequest.mockRejectedValue(new Error('El mazo cambió'));
        const result = await renderLoadedSession([
            { name: 'chair', learned: false },
            { name: 'table', learned: false },
        ]);

        let outcome;
        await act(async () => { outcome = await result.current.deleteCard(); });

        expect(outcome).toBe('error');
        expect(result.current.masterData.length).toBe(2);
        expect(result.current.currentCard?.name).toBe('chair');
        expect(setAppMessage).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));
    });
});

// `reachedDeckEnd` es lo que hace aparecer la pantalla de fin de mazo al llegar navegando a la
// última tarjeta. Reporte en vivo: "a veces muestra la confirmación de terminado de mazo, a veces
// se queda en la última".
describe('useDeckSession — llegar al final del mazo navegando', () => {
    beforeEach(() => {
        categoryState.current = TEST_CATEGORY;
        fetchDecksForCategory.mockReset();
        fetchDeckData.mockReset();
        getPersonalWordsSummary.mockReset();
        fetchDecksForCategory.mockResolvedValue({ success: true, files: ['1-basic/action'] });
        getPersonalWordsSummary.mockResolvedValue({ decks: [] });
    });

    const loaded = async (cards) => {
        fetchDeckData.mockResolvedValue(cards);
        const { result } = renderHook(() => useDeckSession());
        await waitFor(() => expect(result.current.filteredData.length).toBe(cards.filter((c) => !c.learned).length));
        return result;
    };

    it('recorriendo el mazo entero desde el principio muestra el fin de mazo', async () => {
        const result = await loaded([
            { name: 'one', learned: false },
            { name: 'two', learned: false },
            { name: 'three', learned: false },
        ]);

        act(() => { result.current.nextCard(); });
        act(() => { result.current.nextCard(); });
        expect(result.current.currentCard?.name).toBe('three');
        act(() => { result.current.nextCard(); });

        expect(result.current.reachedDeckEnd).toBe(true);
    });

    it('entrando a mitad del mazo (reanudar / salto de búsqueda) también cierra la pasada al llegar al final', async () => {
        // Reanudar desde el dashboard o abrir un resultado de búsqueda posiciona la sesión en una
        // tarjeta del medio: las anteriores nunca se "visitan". El guard contaba visitadas contra
        // el largo del mazo, así que jamás llegaba al umbral y la pantalla de fin no aparecía —
        // el usuario quedaba clavado en la última tarjeta sin salida.
        const result = await loaded([
            { name: 'one', learned: false },
            { name: 'two', learned: false },
            { name: 'three', learned: false },
            { name: 'four', learned: false },
        ]);

        act(() => { result.current.setCurrentIndex(2); });
        expect(result.current.currentCard?.name).toBe('three');

        act(() => { result.current.nextCard(); });
        expect(result.current.currentCard?.name).toBe('four');
        act(() => { result.current.nextCard(); });

        expect(result.current.reachedDeckEnd).toBe(true);
    });

    it('saltar directo a la ÚLTIMA tarjeta y pulsar siguiente NO cierra el mazo sin haber avanzado', async () => {
        // Falso positivo a evitar: abrir un resultado de búsqueda que cae en la última tarjeta no
        // significa haber estudiado el mazo.
        const result = await loaded([
            { name: 'one', learned: false },
            { name: 'two', learned: false },
            { name: 'three', learned: false },
        ]);

        act(() => { result.current.setCurrentIndex(2); });
        act(() => { result.current.nextCard(); });

        expect(result.current.reachedDeckEnd).toBe(false);
    });
});
