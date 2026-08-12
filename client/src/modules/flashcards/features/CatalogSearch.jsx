import { LuSearch, LuX } from 'react-icons/lu';
import styles from './CatalogSearch.module.css';
import { useCatalogSearch } from '../hooks/useCatalogSearch';

const DECK_PREFIX_WORDS = ['noun', 'verb', 'adjective', 'adverb', 'phrasal_verbs'];

const cleanWordName = (name) => (
    name.includes('/')
        ? name.split('/').filter((part) => !DECK_PREFIX_WORDS.includes(part.toLowerCase())).shift()?.replace(/_/g, ' ') || name
        : name
);

const topicLabel = (result) => {
    const raw = result.is_personal
        ? 'Mis palabras'
        : result.deck.split('/').pop().replace(/\.json$/, '').replace(/_/g, ' ');
    return raw.replace(/\b\w/g, (c) => c.toUpperCase());
};

const levelLabel = (level) => (
    level.includes('1-basic') ? 'Básico' : level.includes('2-intermediate') ? 'Intermedio' : 'Avanzado'
);

/**
 * Buscador de palabras (catálogo + mazos personales) — componente enchufable e independiente:
 * mientras hay una búsqueda activa (≥2 caracteres) reemplaza a `children` (normalmente la
 * navegación de categorías) con el panel de resultados; al vaciar el input, `children` vuelve a
 * mostrarse tal cual. No conoce `CategorySelector` ni su estado — solo recibe lo que necesita
 * para pintar (colores/labels de categoría) y un callback de selección. Se puede quitar
 * reemplazando este bloque por `children` directamente, sin tocar el resto del selector. Estado
 * de red/debounce vive en `useCatalogSearch` (hook de aplicación); ver
 * docs/modules/flashcards.md §Word Search.
 */
function CatalogSearch({ courseDirection, categoryColors, categoryLabels, studyLanguage, onSelectResult, children }) {
    const { query, setQuery, results, isSearching, isActive } = useCatalogSearch(courseDirection);

    return (
        <>
            <div className={styles.searchBarBox}>
                <LuSearch className={styles.searchIcon} size={15} />
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder={studyLanguage === 'es' ? 'Buscar palabra (ej. spikes)…' : 'Search word (e.g. spikes)…'}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Buscar palabras"
                />
                {query && (
                    <button
                        type="button"
                        className={styles.searchClearBtn}
                        onClick={() => setQuery('')}
                        title="Limpiar búsqueda"
                    >
                        <LuX size={13} />
                    </button>
                )}
            </div>

            {isActive ? (
                <div className={styles.searchResultsPanel}>
                    <div className={styles.searchResultsHeader}>
                        <span>{isSearching ? 'Buscando…' : `Resultados (${results.length})`}</span>
                    </div>
                    {isSearching && (
                        <p className={styles.searchLoadingMsg}>Buscando en el catálogo…</p>
                    )}
                    {!isSearching && results.length === 0 && (
                        <p className={styles.searchNoResultsMsg}>
                            No se encontraron palabras que coincidan con «{query}».
                        </p>
                    )}
                    {!isSearching && results.length > 0 && (
                        <div className={styles.searchResultsList}>
                            {results.map((res, i) => (
                                <div
                                    key={`${res.category}-${res.deck}-${res.card_index}-${i}`}
                                    className={styles.searchResultCard}
                                    onClick={() => onSelectResult(res)}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <div className={styles.searchResultTopRow}>
                                        <strong className={styles.searchResultWord}>
                                            {cleanWordName(res.name)}
                                        </strong>
                                        <span className={styles.searchResultCatBadge}>
                                            <span
                                                className={styles.searchResultCatDot}
                                                style={{ backgroundColor: categoryColors[res.category] || '#ffffff' }}
                                            />
                                            {categoryLabels?.[res.category] || res.category}
                                        </span>
                                    </div>
                                    <div className={styles.searchResultMetaRow}>
                                        <span className={styles.searchResultLevel}>{levelLabel(res.level)}</span>
                                        <span className={styles.searchResultDeckName}>{topicLabel(res)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : children}
        </>
    );
}

export default CatalogSearch;
