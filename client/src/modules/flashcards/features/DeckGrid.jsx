import { useState } from 'react';
import { LuPencil } from 'react-icons/lu';
// Reusa el stylesheet de CategorySelector (mismo motivo que CategoryHelpPopover/CategoryNav).
import styles from './CategorySelector.module.css';
import { useDragReorder } from '../hooks/useDragReorder';
import { formatDeckCategoryName, isPersonalDeckName } from '../useCases/deckUseCases';

/**
 * Grilla principal del catálogo: mazos anidados (categorías con niveles, ej. verbos) O grupos
 * (categorías planas, ej. sustantivos) — nunca ambos a la vez, decidido por `isNestedCatalog`.
 * Componente de presentación puro: recibe las listas ya ordenadas (`useLocalCatalogOrder`) y
 * expone reorden por arrastre vía `useDragReorder`; toda la orquestación (click/reset/navegación)
 * vive en los callbacks que le pasa `CategorySelector.jsx`.
 */
function DeckGrid({
    isNestedCatalog,
    visibleNestedDecks,
    visibleGroups,
    deckSummaries,
    currentDeckName,
    currentCategory,
    language,
    t,
    categoryColors,
    onDeckClick,
    onGroupClick,
    onDeckReset,
    onGroupReset,
    onReorderNestedDecks,
    onReorderGroups,
    onRenameTopic,
}) {
    const { draggingId: draggingNestedDeck, getDragHandlers: getNestedDeckDragHandlers } = useDragReorder({
        items: visibleNestedDecks,
        onReorder: onReorderNestedDecks,
        logLabel: 'DeckGrid:nested-deck',
    });
    const { draggingId: draggingGroup, getDragHandlers: getGroupDragHandlers } = useDragReorder({
        items: visibleGroups.map((group) => group.name),
        onReorder: onReorderGroups,
        logLabel: 'DeckGrid:group',
    });

    // Edición inline del nombre de un mazo personal ("Crear palabra") directo desde su tarjeta en
    // la grilla — antes solo se podía nombrar justo al crearlo. Solo aplica a mazos personales
    // (`isPersonalDeckName`); los del catálogo curado no son renombrables por el usuario.
    const [editingDeckName, setEditingDeckName] = useState(null);
    const [editingValue, setEditingValue] = useState('');

    const startEditingTopic = (event, deckName, currentLabel) => {
        event.stopPropagation();
        setEditingDeckName(deckName);
        setEditingValue(currentLabel);
    };

    const commitTopicEdit = (deckName) => {
        const trimmed = editingValue.trim();
        setEditingDeckName(null);
        if (trimmed && onRenameTopic) {
            onRenameTopic(deckName, trimmed);
        }
    };

    return (
        <div className={styles.groupsGrid} data-tour="catalogo-grid">
            {isNestedCatalog ? visibleNestedDecks.map((deckName) => {
                const summary = deckSummaries[deckName];
                const total = summary?.total ?? 0;
                const learned = summary?.learned ?? 0;
                // "Crear palabra": si el usuario le puso nombre a su mazo personal
                // (rename_personal_deck), se muestra ese nombre en vez del label
                // genérico ("Mis palabras").
                const deckLabel = summary?.topicName || formatDeckCategoryName(deckName, language);
                const progressPercent = total > 0 ? (learned / total) * 100 : 0;
                const isComplete = total > 0 && learned === total;
                const isNew = learned === 0;
                const isActiveDeck = deckName === currentDeckName;
                const categoryColor = categoryColors[currentCategory] || '#38bdf8';
                const progressColor = isComplete
                    ? '#10b981'
                    : isNew
                        ? categoryColor
                        : '#f59e0b';

                return (
                    <div
                        key={deckName}
                        className={`${styles.groupCard} ${isComplete ? styles.groupCardComplete : ''} ${isActiveDeck ? styles.activeCategory : ''} ${draggingNestedDeck === deckName ? styles.isDragging : ''}`}
                        onClick={() => onDeckClick(deckName)}
                        style={{ '--card-accent': categoryColor }}
                        data-tour="boton-abrir-categoria"
                        {...getNestedDeckDragHandlers(deckName, { disabled: isComplete })}
                    >
                        <div className={styles.groupHeader}>
                            {editingDeckName === deckName ? (
                                <input
                                    type="text"
                                    className={styles.groupNameInput}
                                    value={editingValue}
                                    autoFocus
                                    maxLength={60}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => setEditingValue(event.target.value)}
                                    onBlur={() => commitTopicEdit(deckName)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.currentTarget.blur();
                                        } else if (event.key === 'Escape') {
                                            setEditingDeckName(null);
                                        }
                                    }}
                                />
                            ) : isPersonalDeckName(deckName) ? (
                                <h4
                                    className={`${styles.groupName} ${styles.groupNameEditable}`}
                                    role="button"
                                    tabIndex={0}
                                    title={t.renameTopicHint}
                                    onClick={(event) => startEditingTopic(event, deckName, deckLabel)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') startEditingTopic(event, deckName, deckLabel);
                                    }}
                                >
                                    {deckLabel}
                                    <LuPencil size={12} className={styles.groupNameEditIcon} />
                                </h4>
                            ) : (
                                <h4 className={styles.groupName}>{deckLabel}</h4>
                            )}
                            {/* <div className={styles.groupMetaInfo}>
                                <span className={styles.groupDeckId}>{deckName}</span>
                            </div> */}
                            <div className={styles.groupActions}>
                                {isComplete ? (
                                    <button
                                        type="button"
                                        className={styles.resetGroupBtn}
                                        onClick={(event) => onDeckReset(event, deckName)}
                                    >
                                        {t.restartGroup}
                                    </button>
                                ) : (
                                    <span className={styles.groupCountBadge}>{summary ? total : '…'}</span>
                                )}
                            </div>
                        </div>

                        <div className={styles.progressContainer}>
                            <div
                                className={styles.progressBar}
                                style={{
                                    width: `${progressPercent}%`,
                                    backgroundColor: progressColor,
                                }}
                            />
                        </div>

                        <div className={styles.groupStatus}>
                            {summary ? (
                                isComplete ? (
                                    <span className={styles.statusCompleted}>{t.complete}</span>
                                ) : (
                                    <span className={styles.statusProgress}>{learned} / {total}</span>
                                )
                            ) : (t.loadingCategories || '…')}
                        </div>
                    </div>
                );
            }) : visibleGroups.map((group) => {
                const progressPercent = (group.learned / group.total) * 100;
                const isComplete = group.learned === group.total;
                const isNew = group.learned === 0;
                const categoryColor = categoryColors[currentCategory] || '#38bdf8';
                const progressColor = isComplete
                    ? '#10b981'
                    : isNew
                        ? categoryColor
                        : '#f59e0b';

                return (
                    <div
                        key={group.name}
                        className={`${styles.groupCard} ${isComplete ? styles.groupCardComplete : ''} ${draggingGroup === group.name ? styles.isDragging : ''}`}
                        onClick={isComplete ? undefined : () => onGroupClick(group.name)}
                        style={{ '--card-accent': categoryColor }}
                        aria-disabled={isComplete}
                        {...getGroupDragHandlers(group.name, { disabled: isComplete })}
                        data-tour={!isComplete ? 'boton-abrir-categoria' : undefined}
                    >
                        <div className={styles.groupHeader}>
                            <h4 className={styles.groupName}>{t.groups && t.groups[group.name] ? t.groups[group.name] : group.name}</h4>
                            <div className={styles.groupActions}>
                                {isComplete ? (
                                    <button
                                        type="button"
                                        className={styles.resetGroupBtn}
                                        onClick={(event) => onGroupReset(event, group.name)}
                                    >
                                        {t.restartGroup}
                                    </button>
                                ) : (
                                    <span className={styles.groupCountBadge}>{group.total}</span>
                                )}
                            </div>
                        </div>

                        {/* Barra de progreso */}
                        <div className={styles.progressContainer}>
                            <div
                                className={styles.progressBar}
                                style={{
                                    width: `${progressPercent}%`,
                                    backgroundColor: progressColor,
                                }}
                            />
                        </div>

                        {/* Estado inferior */}
                        <div className={styles.groupStatus}>
                            {isComplete ? (
                                <span className={styles.statusCompleted}>{t.complete}</span>
                            ) : isNew ? (
                                <span className={styles.statusNew}>{t.newStr}</span>
                            ) : (
                                <span className={styles.statusProgress}>{group.learned} / {group.total}</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default DeckGrid;
