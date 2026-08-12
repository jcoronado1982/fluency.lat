import { useEffect, useState } from 'react';
import { flashcardPort } from '../composition';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * Búsqueda de palabras en catálogo + mazos personales (`GET /api/search-words`). Aislada de
 * `CatalogSearch.jsx` para mantener ese componente como pura presentación (SRP) — la única pieza
 * que sabe de debounce/estado de red es este hook, consumiendo el puerto ya cableado en
 * `composition.js` (nunca fetch directo). Ver docs/modules/flashcards.md §Word Search.
 */
export function useCatalogSearch(courseDirection) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < MIN_QUERY_LENGTH) {
            setResults([]);
            setIsSearching(false);
            return undefined;
        }

        setIsSearching(true);
        const timer = setTimeout(async () => {
            try {
                const res = await flashcardPort.searchWords(trimmed, courseDirection);
                setResults(res?.results || []);
            } catch {
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [query, courseDirection]);

    return {
        query,
        setQuery,
        results,
        isSearching,
        isActive: query.trim().length >= MIN_QUERY_LENGTH,
    };
}
