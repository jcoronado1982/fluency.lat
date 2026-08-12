import React, { useEffect, useRef, useState } from 'react';
import styles from './CreateWordModal.module.css';
import { useUIContext } from '../../../context/UIContext';
import { useCategoryContext } from '../context/CategoryContext';
import { useFlashcardContext } from '../context/FlashcardContext';
import { getFlashcardTranslations } from '../config/translations';
import { getCourseDirectionFromStudyLanguage } from '../../../contracts/courseDirection';
import { personalWordPort } from '../composition';
import { getLevelFromDeckName, NESTED_LEVEL_CATEGORIES } from '../useCases/deckUseCases';

const MAX_WORD_LEN = 80;
const MAX_TOPIC_NAME_LEN = 60;

// Mismos 3 slugs que `PERSONAL_WORD_LEVELS` en
// `backend/mod_flashcards/src/card_creation_use_cases.rs` — duplicado intencional (frontend no
// puede importar Rust), igual criterio que `NESTED_LEVEL_CATEGORIES` para categorías.
const PERSONAL_WORD_LEVELS = ['1-basic', '2-intermediate', '3-advanced'];

const formatCategoryName = (category, categoryNames) => {
    if (!category) return '';
    if (categoryNames?.[category]) return categoryNames[category];
    return category.replace(/[_-]/g, ' ').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const formatLevelName = (level, levelNames) => {
    const key = getLevelFromDeckName(level); // "1-basic" -> "basic"
    return levelNames?.[key] || key;
};

/** Convierte un candidato del backend (`PreviewWordCandidate`/`CreateWordResponse`) en una fila de UI. */
const toRow = (candidate, id) => ({
    id,
    category: candidate?.category ?? '',
    level: candidate?.level ?? PERSONAL_WORD_LEVELS[0],
    name: candidate?.name ?? '',
    isNewDeck: Boolean(candidate?.is_new_deck),
    existingTopicName: candidate?.existing_topic_name ?? null,
    duplicate: Boolean(candidate?.duplicate),
    selected: !candidate?.duplicate,
    refreshing: false,
    createStatus: 'idle', // idle | creating | created | duplicate | error
    createError: '',
    topicName: '',
    topicNameStatus: 'idle', // idle | saving | dismissed | error
});

/**
 * "Crear palabra" — mazo personal por usuario (ver docs/modules/flashcards.md §Personal Words).
 * Se renderiza dentro de `CategorySelector` (tiene acceso a `CategoryContext`/`FlashcardContext`).
 *
 * Flujo: escribe palabra -> Gemini clasifica (1 o 2 candidatos: 2 solo cuando la palabra tiene un
 * segundo uso gramatical realmente común, ej. verbo Y sustantivo) -> el usuario ve cada candidato
 * como una fila editable (tildar/destildar, cambiar categoría/nivel, agregar una clasificación
 * manual) ANTES de gastar en imagen/audio -> al confirmar, se crea una palabra por cada fila
 * tildada (llamadas independientes — una fila puede fallar sin afectar a las demás). Pedido
 * explícito del usuario: no forzar una palabra ambigua a una sola categoría, y darle control para
 * corregir la recomendación de la IA en vez de un preview de solo lectura.
 */
function CreateWordModal({ onClose }) {
    const { language = 'en', studyLanguage = 'en' } = useUIContext();
    const { changeCategory } = useCategoryContext();
    const { changeDeck, refreshPersonalWords } = useFlashcardContext();
    const translations = getFlashcardTranslations(language);
    const t = translations.createWordModal;
    const categoryNames = translations.categorySelector?.categories;
    const levelNames = translations.categorySelector?.levels;

    const [word, setWord] = useState('');
    // idle | previewing | candidates | creating | results | error
    const [status, setStatus] = useState('idle');
    const [candidates, setCandidates] = useState([]);
    // Cuántos candidatos devolvió Gemini en el preview INICIAL (sin overrides) — fijo aunque el
    // usuario agregue filas manuales después, para que el texto de introducción no cambie de golpe.
    const [detectedCount, setDetectedCount] = useState(1);
    const [errorMessage, setErrorMessage] = useState('');
    // Temas (mazos personales YA creados) del usuario, en TODAS las categorías — `null` mientras
    // no se pidieron todavía. La categoría gramatical la decide la IA (no es una elección del
    // usuario); pero EN QUÉ mazo existente se guarda para estudiar sí lo es — esta lista es la que
    // permite mostrar nombres de tema en vez de niveles crudos ("Básico/Intermedio/Avanzado") y
    // dejar elegir un tema ya creado en vez de una categoría gramatical vacía (ver
    // `handleAddCandidateClick`/`topicsForCategory`).
    const [existingTopics, setExistingTopics] = useState(null);
    const [isPickingTopic, setIsPickingTopic] = useState(false);

    const rowIdRef = useRef(0);
    const nextRowId = () => `row-${rowIdRef.current++}`;

    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    const isBusy = status === 'previewing' || status === 'creating';

    /**
     * Pide los mazos personales del usuario en las 9 categorías en paralelo. Se dispara EAGER al
     * montar el modal (ver `useEffect` abajo) — no al primer submit — para que ya esté lista (o
     * lo más lista posible) cuando se arma la PRIMERA llamada a Gemini: la lista completa se le
     * manda ahí mismo para que recomiende el mejor mazo existente en vez de clasificar a ciegas y
     * tener que reconsultar después (ver `handleSubmit`).
     */
    const loadExistingTopics = async () => {
        try {
            const results = await Promise.all(
                NESTED_LEVEL_CATEGORIES.map(async (category) => {
                    const response = await personalWordPort.getPersonalWordsSummary({ category, courseDirection });
                    return (response?.decks ?? []).map((entry) => ({
                        category,
                        // `entry.deck` es siempre `"<nivel-crudo>/my_words"` (ej. "1-basic/my_words")
                        // — el slug crudo necesario para `levelOverride`. OJO: NO usar
                        // `getLevelFromDeckName` acá, devuelve la forma humana ("basic", sin
                        // prefijo numérico), que el backend no reconoce como nivel válido.
                        level: entry.deck.split('/')[0],
                        topicName: entry.topic_name || null,
                        total: entry.total ?? 0,
                        learned: entry.learned ?? 0,
                    }));
                }),
            );
            const flat = results.flat();
            setExistingTopics(flat);
            return flat;
        } catch {
            // Silencioso: sin esta lista, el selector cae al comportamiento anterior (niveles
            // crudos, botón "agregar categoría nueva") — nunca bloquea crear la palabra.
            setExistingTopics([]);
            return [];
        }
    };

    // Eager: listo (o intentado) desde que se abre el modal, no recién al primer submit — la
    // lista viaja en la PRIMERA llamada a Gemini (ver `handleSubmit`).
    useEffect(() => {
        void loadExistingTopics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const topicsForCategory = (category) => (existingTopics ?? []).filter((topic) => topic.category === category);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const trimmed = word.trim();
        if (!trimmed || isBusy) return;
        setStatus('previewing');
        setErrorMessage('');
        try {
            // Le mandamos a Gemini la lista COMPLETA de mazos personales que el usuario ya tiene,
            // en TODAS las categorías, desde esta MISMA llamada — Gemini recomienda el mejor
            // encaje como primera clasificación (o decide que ninguno calza y clasifica libre, un
            // mazo nuevo) en vez de que el frontend adivine con una sola pista y tenga que
            // reconsultar después con overrides. Pedido explícito: "vos debés recomendarlo y
            // colocar esa recomendación como primera opción... el usuario lo puede cambiar entre
            // sus otros decks o crear uno nuevo" — la fila resultante sigue siendo editable como
            // cualquier otra.
            const topics = existingTopics === null ? await loadExistingTopics() : existingTopics;
            const response = await personalWordPort.previewWord({
                word: trimmed,
                courseDirection,
                existingTopics: topics,
            });
            const rawCandidates = response?.candidates ?? [];
            setCandidates(rawCandidates.map((c) => toRow(c, nextRowId())));
            setDetectedCount(rawCandidates.length || 1);
            setStatus('candidates');
        } catch (err) {
            setErrorMessage(err?.message || '');
            setStatus('error');
        }
    };

    const handleCancelCandidates = () => {
        setCandidates([]);
        setStatus('idle');
    };

    /** Re-consulta el preview forzado a `category`/`level` para UNA fila y la reemplaza in-place. */
    const refreshRow = async (id, category, level) => {
        setCandidates((prev) => prev.map((r) => (r.id === id ? { ...r, category, level, refreshing: true } : r)));
        try {
            const response = await personalWordPort.previewWord({
                word: word.trim(),
                courseDirection,
                categoryOverride: category,
                levelOverride: level,
            });
            const candidate = response?.candidates?.[0];
            setCandidates((prev) => prev.map((r) => (r.id === id
                ? { ...r, ...toRow(candidate, id), category: candidate?.category ?? category, level: candidate?.level ?? level }
                : r)));
        } catch (err) {
            setCandidates((prev) => prev.map((r) => (r.id === id ? { ...r, refreshing: false } : r)));
            setErrorMessage(err?.message || '');
        }
    };

    /**
     * Mejor tema existente en la categoría de la fila (el de más tarjetas, si hay varios) — solo
     * para SUGERIR cuando el nivel que clasificó Gemini no coincide con ninguno de los mazos que
     * el usuario ya tiene ahí. La decisión de usarlo o crear uno nuevo es del usuario, esto es
     * únicamente una recomendación (nadie estudia un mazo de una sola carta si ya tenía un tema
     * establecido en la misma categoría).
     */
    const bestExistingTopicFor = (category) => {
        const options = topicsForCategory(category);
        if (options.length === 0) return null;
        return options.reduce((best, topic) => (topic.total > best.total ? topic : best));
    };

    const handleUseSuggestedTopic = (id, topic) => {
        refreshRow(id, topic.category, topic.level);
    };

    const handleRowFieldChange = (id, field, value) => {
        const row = candidates.find((r) => r.id === id);
        if (!row) return;
        const nextCategory = field === 'category' ? value : row.category;
        const nextLevel = field === 'level' ? value : row.level;
        refreshRow(id, nextCategory, nextLevel);
    };

    const handleToggleRow = (id) => {
        setCandidates((prev) => prev.map((r) => (r.id === id && !r.duplicate ? { ...r, selected: !r.selected } : r)));
    };

    const usedCategories = candidates.map((r) => r.category);
    const nextCategoryOption = NESTED_LEVEL_CATEGORIES.find((cat) => !usedCategories.includes(cat));

    const handleAddCandidate = () => {
        if (!nextCategoryOption) return;
        const level = candidates[0]?.level || PERSONAL_WORD_LEVELS[0];
        const id = nextRowId();
        setCandidates((prev) => [...prev, {
            ...toRow({ category: nextCategoryOption, level, name: word.trim() }, id),
            refreshing: true,
        }]);
        refreshRow(id, nextCategoryOption, level);
    };

    /** Agrega una fila apuntada directamente a un tema (mazo) que el usuario ya creó. */
    const handlePickTopic = (topic) => {
        const id = nextRowId();
        setCandidates((prev) => [...prev, {
            ...toRow({ category: topic.category, level: topic.level, name: word.trim() }, id),
            refreshing: true,
        }]);
        setIsPickingTopic(false);
        refreshRow(id, topic.category, topic.level);
    };

    // Temas existentes que todavía no están usados por ninguna fila (categoría+nivel exactos) —
    // esto es lo que se ofrece para elegir, no una categoría gramatical en blanco.
    const usedCategoryLevelPairs = candidates.map((r) => `${r.category}::${r.level}`);
    const pickableTopics = (existingTopics ?? []).filter(
        (topic) => !usedCategoryLevelPairs.includes(`${topic.category}::${topic.level}`),
    );

    const handleAddCandidateClick = () => {
        if (pickableTopics.length === 0) {
            handleAddCandidate();
            return;
        }
        setIsPickingTopic(true);
    };

    const handleConfirmCreate = async () => {
        const trimmed = word.trim();
        const toCreate = candidates.filter((r) => r.selected && !r.duplicate);
        if (!trimmed || isBusy || toCreate.length === 0) return;
        setStatus('creating');
        setErrorMessage('');
        setCandidates((prev) => prev.map((r) => (
            toCreate.some((c) => c.id === r.id) ? { ...r, createStatus: 'creating' } : r
        )));

        // Si algo se creó de verdad (no todo duplicado), la lista de mazos existentes quedó
        // desactualizada — se refresca para que "Crear otra palabra" en la MISMA sesión del modal
        // le mande a Gemini el mazo recién creado como candidato a recomendar.
        let anyCreated = false;

        // Secuencial a propósito (no Promise.all): no saturar generación de imagen/audio con
        // varias filas en simultáneo — ver docs/modules/flashcards.md §Personal Words.
        for (const row of toCreate) {
            try {
                const response = await personalWordPort.createWord({
                    word: trimmed,
                    courseDirection,
                    categoryOverride: row.category,
                    levelOverride: row.level,
                });
                const category = response?.category ?? row.category;
                const level = response?.level ?? row.level;
                if (!response?.duplicate) {
                    anyCreated = true;
                }
                setCandidates((prev) => prev.map((r) => (r.id === row.id ? {
                    ...r,
                    category,
                    level,
                    isNewDeck: Boolean(response?.is_new_deck),
                    createStatus: response?.duplicate ? 'duplicate' : 'created',
                } : r)));
            } catch (err) {
                setCandidates((prev) => prev.map((r) => (r.id === row.id
                    ? { ...r, createStatus: 'error', createError: err?.message || '' }
                    : r)));
            }
        }

        if (anyCreated) {
            void loadExistingTopics();
        }
        refreshPersonalWords?.();
        setStatus('results');
    };

    /** Vuelve al formulario para cargar otra palabra sin cerrar el modal — mantiene `existingTopics`
     * en caché (ya refrescada tras la creación, ver `handleConfirmCreate`) para que Gemini la vea
     * completa desde el primer submit de la siguiente palabra. */
    const handleCreateAnother = () => {
        setWord('');
        setCandidates([]);
        setErrorMessage('');
        setStatus('idle');
    };

    const handleRowTopicNameChange = (id, value) => {
        setCandidates((prev) => prev.map((r) => (r.id === id ? { ...r, topicName: value } : r)));
    };

    const handleSkipRowTopicName = (id) => {
        setCandidates((prev) => prev.map((r) => (r.id === id ? { ...r, topicNameStatus: 'dismissed' } : r)));
    };

    const handleSaveRowTopicName = async (id) => {
        const row = candidates.find((r) => r.id === id);
        const trimmed = row?.topicName.trim();
        if (!row || !trimmed) return;
        setCandidates((prev) => prev.map((r) => (r.id === id ? { ...r, topicNameStatus: 'saving' } : r)));
        try {
            await personalWordPort.renamePersonalDeck({
                category: row.category,
                level: row.level,
                topicName: trimmed,
                courseDirection,
            });
            refreshPersonalWords?.();
            setCandidates((prev) => prev.map((r) => (r.id === id ? { ...r, topicNameStatus: 'dismissed' } : r)));
        } catch {
            setCandidates((prev) => prev.map((r) => (r.id === id ? { ...r, topicNameStatus: 'error' } : r)));
        }
    };

    // La categoría/mazo son los REALES del catálogo (ej. "verbs" / "1-basic/my_words") — el
    // mismo flujo que abrir cualquier otro mazo, ver docs/modules/flashcards.md §Personal Words.
    const handleViewRow = (row) => {
        changeCategory(row.category);
        changeDeck(`${row.level}/my_words`);
        onClose();
    };

    return (
        <div className={styles.modal} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <button type="button" className={styles.closeButton} onClick={onClose} aria-label={t.closeButton}>&times;</button>
                <h3 className={styles.title}>{t.title}</h3>

                {(status === 'idle' || status === 'previewing' || status === 'error') && (
                    <form onSubmit={handleSubmit} className={styles.form}>
                        <label className={styles.label} htmlFor="create-word-input">{t.wordLabel}</label>
                        <input
                            id="create-word-input"
                            type="text"
                            className={styles.input}
                            value={word}
                            maxLength={MAX_WORD_LEN}
                            placeholder={t.placeholder}
                            onChange={(e) => setWord(e.target.value)}
                            disabled={isBusy}
                            autoFocus
                        />
                        <p className={styles.helperText}>{t.helperText}</p>

                        {status === 'error' && (
                            <div className={styles.errorBox}>
                                <strong>{t.errorTitle}</strong>
                                {errorMessage ? <span>{errorMessage}</span> : null}
                            </div>
                        )}

                        {status === 'previewing' ? (
                            <p className={styles.loadingMessage} role="status">
                                <span className={styles.spinner} aria-hidden="true" />
                                {t.previewingMessage}
                            </p>
                        ) : (
                            <div className={styles.actions}>
                                <button type="button" className={styles.cancelButton} onClick={onClose}>
                                    {t.cancelButton}
                                </button>
                                <button type="submit" className={styles.submitButton} disabled={!word.trim()}>
                                    {status === 'error' ? t.retryButton : t.submitButton}
                                </button>
                            </div>
                        )}
                    </form>
                )}

                {status === 'candidates' && (
                    <div className={styles.resultBox}>
                        <p className={styles.introText}>
                            {detectedCount > 1
                                ? t.candidatesIntroMultiple.replace('{word}', word.trim()).replace('{count}', String(detectedCount))
                                : t.candidatesIntroSingle.replace('{word}', word.trim())}
                        </p>
                        <div className={styles.candidateList}>
                            {candidates.map((row) => {
                                // Nadie estudia un mazo de una sola carta: si el nivel que Gemini clasificó
                                // no tiene mazo del usuario todavía, pero SÍ hay un tema establecido en esa
                                // misma categoría (otro nivel), se lo sugerimos — la decisión de usarlo o
                                // crear uno nuevo sigue siendo suya.
                                const suggestedTopic = (!row.refreshing && row.isNewDeck) ? bestExistingTopicFor(row.category) : null;
                                return (
                                <div
                                    key={row.id}
                                    className={`${styles.candidateRow} ${row.duplicate ? styles.candidateRowDuplicate : ''}`}
                                >
                                    <label className={styles.candidateHeader}>
                                        <input
                                            type="checkbox"
                                            checked={row.selected}
                                            disabled={row.duplicate || row.refreshing}
                                            onChange={() => handleToggleRow(row.id)}
                                        />
                                        <span className={styles.candidateName}>{row.name || word.trim()}</span>
                                        <span className={styles.candidateUsageHint}>
                                            ({formatCategoryName(row.category, categoryNames).toLowerCase()})
                                        </span>
                                        {row.duplicate && (
                                            <span className={`${styles.rowBadge} ${styles.rowBadgeDuplicate}`}>{t.duplicateBadge}</span>
                                        )}
                                    </label>
                                    <div className={styles.candidateFields}>
                                        <div className={styles.candidateFieldGroup}>
                                            <label className={styles.fieldLabel} htmlFor={`category-${row.id}`}>{t.categoryFieldLabel}</label>
                                            <select
                                                id={`category-${row.id}`}
                                                className={styles.select}
                                                value={row.category}
                                                disabled={row.refreshing}
                                                onChange={(e) => handleRowFieldChange(row.id, 'category', e.target.value)}
                                            >
                                                {NESTED_LEVEL_CATEGORIES.map((cat) => (
                                                    <option key={cat} value={cat}>{formatCategoryName(cat, categoryNames)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className={styles.candidateFieldGroup}>
                                            <label className={styles.fieldLabel} htmlFor={`topic-${row.id}`}>{t.topicFieldLabel}</label>
                                            <select
                                                id={`topic-${row.id}`}
                                                className={styles.select}
                                                value={row.level}
                                                disabled={row.refreshing}
                                                onChange={(e) => handleRowFieldChange(row.id, 'level', e.target.value)}
                                            >
                                                {PERSONAL_WORD_LEVELS
                                                    // El nivel de un mazo NUEVO lo decide la IA, no el usuario (sabe mejor que
                                                    // él qué tan difícil es la palabra) — solo se ofrece como opción "nueva"
                                                    // el nivel que ya clasificó (`row.level`), nunca los otros dos. Los temas
                                                    // YA EXISTENTES sí siguen siendo elegibles: ahí la decisión es "a cuál de
                                                    // mis mazos lo agrego", no una evaluación de dificultad.
                                                    .filter((lvl) => lvl === row.level || topicsForCategory(row.category).some((topic) => topic.level === lvl))
                                                    .map((lvl) => {
                                                        const existingTopic = topicsForCategory(row.category).find((topic) => topic.level === lvl);
                                                        // El nivel de un mazo nuevo lo decide la IA, no el usuario — no se
                                                        // muestra acá (ya lo comunicó al clasificar), solo "Nuevo tema".
                                                        const label = existingTopic
                                                            ? (existingTopic.topicName || t.topicNameDefault)
                                                            : t.newTopicOption;
                                                        return <option key={lvl} value={lvl}>{label}</option>;
                                                    })}
                                            </select>
                                        </div>
                                    </div>
                                    {suggestedTopic && (
                                        <p className={styles.topicSuggestionInline}>
                                            {t.topicSuggestionLabel}{' '}
                                            <button
                                                type="button"
                                                className={styles.topicSuggestionLink}
                                                onClick={() => handleUseSuggestedTopic(row.id, suggestedTopic)}
                                            >
                                                {t.topicSuggestionLinkText
                                                    .replace('{category}', formatCategoryName(suggestedTopic.category, categoryNames))
                                                    .replace('{level}', formatLevelName(suggestedTopic.level, levelNames))}
                                            </button>
                                        </p>
                                    )}
                                </div>
                                );
                            })}
                        </div>

                        {isPickingTopic ? (
                            <div className={styles.topicPicker}>
                                <p className={styles.topicPickerLabel}>{t.pickTopicPrompt}</p>
                                {pickableTopics.map((topic) => (
                                    <button
                                        key={`${topic.category}-${topic.level}`}
                                        type="button"
                                        className={styles.topicPickerOption}
                                        onClick={() => handlePickTopic(topic)}
                                    >
                                        {topic.topicName || t.topicNameDefault} ({formatCategoryName(topic.category, categoryNames)}·{formatLevelName(topic.level, levelNames)})
                                    </button>
                                ))}
                                {nextCategoryOption && (
                                    <button
                                        type="button"
                                        className={styles.topicPickerOption}
                                        onClick={() => { setIsPickingTopic(false); handleAddCandidate(); }}
                                    >
                                        {t.pickNewCategoryOption}
                                    </button>
                                )}
                                <button type="button" className={styles.cancelButton} onClick={() => setIsPickingTopic(false)}>
                                    {t.cancelButton}
                                </button>
                            </div>
                        ) : (nextCategoryOption || pickableTopics.length > 0) && (
                            <button type="button" className={styles.addCandidateButton} onClick={handleAddCandidateClick}>
                                {pickableTopics.length > 0 ? t.addTopicButton : t.addCandidateButton}
                            </button>
                        )}

                        {errorMessage && (
                            <div className={styles.errorBox}>{errorMessage}</div>
                        )}

                        <div className={styles.actions}>
                            <button type="button" className={styles.cancelButton} onClick={handleCancelCandidates}>
                                {t.cancelButton}
                            </button>
                            <button
                                type="button"
                                className={styles.submitButton}
                                onClick={handleConfirmCreate}
                                disabled={!candidates.some((r) => r.selected && !r.duplicate)}
                            >
                                {t.confirmCreateButton}
                            </button>
                        </div>
                    </div>
                )}

                {status === 'creating' && (
                    <p className={styles.loadingMessage} role="status">
                        <span className={styles.spinner} aria-hidden="true" />
                        {t.loadingMessage}
                    </p>
                )}

                {status === 'results' && (
                    <div className={styles.resultBox}>
                        <p className={styles.resultTitle}>{t.resultsTitle}</p>
                        <div className={styles.resultsList}>
                            {candidates.filter((r) => r.createStatus !== 'idle').map((row) => (
                                <div key={row.id} className={styles.resultRow}>
                                    <div className={styles.resultRowHeader}>
                                        <span>
                                            {formatCategoryName(row.category, categoryNames)} → {formatLevelName(row.level, levelNames)}
                                        </span>
                                        {row.createStatus === 'created' && (
                                            <span className={`${styles.rowBadge} ${styles.rowBadgeCreated}`}>{t.rowCreated}</span>
                                        )}
                                        {row.createStatus === 'duplicate' && (
                                            <span className={`${styles.rowBadge} ${styles.rowBadgeDuplicate}`}>{t.rowDuplicate}</span>
                                        )}
                                        {row.createStatus === 'error' && (
                                            <span className={`${styles.rowBadge} ${styles.rowBadgeError}`}>{t.rowError}</span>
                                        )}
                                    </div>

                                    {row.createStatus === 'error' && row.createError && (
                                        <p className={styles.errorBox}>{row.createError}</p>
                                    )}

                                    {(row.createStatus === 'created' || row.createStatus === 'duplicate') && (
                                        <div className={styles.actions}>
                                            <button type="button" className={styles.submitButton} onClick={() => handleViewRow(row)}>
                                                {t.successViewButton.replace('{category}', formatCategoryName(row.category, categoryNames))}
                                            </button>
                                        </div>
                                    )}

                                    {row.isNewDeck && row.createStatus === 'created' && row.topicNameStatus !== 'dismissed' && (
                                        <div className={styles.topicNameBox}>
                                            <label className={styles.label} htmlFor={`topic-name-${row.id}`}>{t.topicNameLabel}</label>
                                            <input
                                                id={`topic-name-${row.id}`}
                                                type="text"
                                                className={styles.input}
                                                value={row.topicName}
                                                maxLength={MAX_TOPIC_NAME_LEN}
                                                placeholder={t.topicNamePlaceholder}
                                                onChange={(e) => handleRowTopicNameChange(row.id, e.target.value)}
                                                disabled={row.topicNameStatus === 'saving'}
                                            />
                                            {row.topicNameStatus === 'error' && (
                                                <p className={styles.errorBox}>{t.topicNameError}</p>
                                            )}
                                            <div className={styles.actions}>
                                                <button
                                                    type="button"
                                                    className={styles.cancelButton}
                                                    onClick={() => handleSkipRowTopicName(row.id)}
                                                >
                                                    {t.topicNameSkip}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={styles.submitButton}
                                                    onClick={() => handleSaveRowTopicName(row.id)}
                                                    disabled={!row.topicName.trim() || row.topicNameStatus === 'saving'}
                                                >
                                                    {t.topicNameSave}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className={styles.actions}>
                            <button type="button" className={styles.cancelButton} onClick={onClose}>
                                {t.closeButton}
                            </button>
                            <button type="button" className={styles.submitButton} onClick={handleCreateAnother}>
                                {t.createAnotherButton}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default CreateWordModal;
