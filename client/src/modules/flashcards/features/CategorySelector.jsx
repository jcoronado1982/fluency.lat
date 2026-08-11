import React, { useEffect, useRef, useState, useMemo } from 'react';
import { LuCircleHelp } from 'react-icons/lu';
import styles from './CategorySelector.module.css';
import { useAuth } from '../../../context/AuthContext';
import { useUIContext } from '../../../context/UIContext';
import { useDialog } from '../../../context/AppContext';
import { useFlashcardUiContext } from '../context/FlashcardUiContext';
import { useFlashcardContext } from '../context/FlashcardContext';
import { useCategoryContext } from '../context/CategoryContext';
import { getFlashcardTranslations } from '../config/translations';
import { getHelpForCourse } from '../config/categoryHelpByCourse';
import { getCourseDirectionFromStudyLanguage } from '../../../contracts/courseDirection';
import { sortGroups, sinkRecentCategory } from '../config/catalogOrder';
import {
    applyPreferenceOrder,
    getGroupOrderPreference,
    moveOrderedItem,
    saveGroupOrderPreference,
} from '../config/catalogPreferences';
import { categoryToTourSlug } from '../config/onboardingUiAutomation';
import {
    getDeckCategoryName,
    formatDeckCategoryName,
    getLevelFromDeckName,
    usesNestedLevelDecks,
} from '../useCases/deckUseCases';

// Los totales son dinámicos — vienen del contexto que obtiene el conteo real del backend

const categoryColors = {
    nouns: '#3b82f6', // blue
    verbs: '#10b981', // green
    adjectives: '#f97316', // orange/red
    adverbs: '#f59e0b', // yellow/amber
    preposition: '#8b5cf6', // purple
    pronouns: '#ec4899', // pink
    connectors: '#06b6d4', // cyan
    determinant: '#64748b', // slate
    phrasal_verbs: '#ef4444' // red
};

const formatName = (name, t) => {
    if (!name) return '';
    const clean = name.replace(/^\.\//, '');
    if (t && t.categories && t.categories[clean]) {
        return t.categories[clean];
    }
    return clean.replace(/[_-]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildHighlightPattern = (items) => items
    .filter(Boolean)
    .map((item) => {
        const text = String(item);
        const escaped = escapeRegExp(text);

        // Highlight standalone words like "in" or "to" without matching inside "going".
        if (/^[A-Za-z]+$/.test(text)) {
            return `\\b${escaped}\\b`;
        }

        return escaped;
    })
    .join('|');

const getCategoryHelpContent = (category, uiTranslations) => {
    const help = uiTranslations?.categoryHelp?.[category] || uiTranslations?.categoryHelp?.nouns;
    if (!help) return null;

    return {
        title: help.title,
        summary: help.summary,
        usage: help.usage,
        example: help.example,
        exampleSentence: help.exampleSentence ?? null,
        exampleNotes: help.exampleNotes ?? null,
        exampleHighlight: help.exampleHighlight ?? null,
        exampleTable: help.exampleTable ?? null,
    };
};

const renderHighlightedExample = (text, highlight) => {
    if (!text) return null;
    if (!highlight) return text;

    const highlightList = Array.isArray(highlight) ? highlight.filter(Boolean) : [highlight];
    if (highlightList.length === 0) return text;

    const pattern = buildHighlightPattern(highlightList);
    const parts = String(text).split(new RegExp(`(${pattern})`, 'gi'));

    return parts.map((part, index) => {
        const matchedHighlight = highlightList.find((item) => part.toLowerCase() === item.toLowerCase());
        if (matchedHighlight) {
            return (
                <strong key={`${part}-${index}`} className={styles.helpPopoverExampleHighlight}>
                    {part}
                </strong>
            );
        }
        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    });
};

const renderExampleTable = (rows, highlight) => {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    return (
        <table className={styles.helpPopoverExampleTable}>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.label}>
                        <th scope="row" className={styles.helpPopoverExampleRowLabel}>
                            {row.label}
                        </th>
                        <td className={styles.helpPopoverExampleRowValues}>
                            <div className={styles.helpPopoverExampleValueList}>
                                {(row.items || []).map((item) => (
                                    <span key={`${row.label}-${item}`} className={styles.helpPopoverExampleValue}>
                                        {renderHighlightedExample(item, highlight)}
                                    </span>
                                ))}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const renderExampleNotes = (notes, highlight) => {
    if (!Array.isArray(notes) || notes.length === 0) return null;

    return (
        <div className={styles.helpPopoverExampleNotes}>
            {notes.map((note, index) => (
                <p
                    key={`${note}-${index}`}
                    className={`${styles.helpPopoverExampleNote} ${index === notes.length - 1 ? styles.helpPopoverExampleRule : ''}`}
                >
                    {renderHighlightedExample(note, highlight)}
                </p>
            ))}
        </div>
    );
};

const getCategoryQuestionTitle = (category, language, fallbackTitle) => {
    const isSpanish = language === 'es';
    const questionTitles = isSpanish
        ? {
            nouns: '¿Qué es un sustantivo?',
            verbs: '¿Qué es un verbo?',
            adjectives: '¿Qué es un adjetivo?',
            adverbs: '¿Qué es un adverbio?',
            preposition: '¿Qué es una preposición?',
            pronouns: '¿Qué es un pronombre?',
            connectors: '¿Qué es un conector?',
            determinant: '¿Qué es un determinante?',
            phrasal_verbs: '¿Qué es un verbo frasal?',
        }
        : {
            nouns: 'What is a noun?',
            verbs: 'What is a verb?',
            adjectives: 'What is an adjective?',
            adverbs: 'What is an adverb?',
            preposition: 'What is a preposition?',
            pronouns: 'What is a pronoun?',
            connectors: 'What is a connector?',
            determinant: 'What is a determiner?',
            phrasal_verbs: 'What is a phrasal verb?',
        };

    return questionTitles[category] || fallbackTitle;
};

function CategorySelector() {
    const { user, updateCatalogPreferences } = useAuth();
    const { language = 'en', studyLanguage = 'en' } = useUIContext();
    const { confirm } = useDialog();
    const { setIsCatalogVisible } = useFlashcardUiContext();
    const {
        categories,
        categoryTotals,
        areCategoryTotalsLoading,
        currentCategory,
        changeCategory,
        moveCategory,
        recentlyFinishedDecks,
        isLoading: categoriesLoading,
    } = useCategoryContext();
    const t = getFlashcardTranslations(language).categorySelector;
    const helpQuestionTitle = getCategoryQuestionTitle(currentCategory, language, t.helpPopoverTitle || '');
    const dragStateRef = useRef({ type: null, id: null });
    const helpPopoverRef = useRef(null);
    const helpButtonRef = useRef(null);
    const [draggingCategory, setDraggingCategory] = useState(null);
    const [draggingGroup, setDraggingGroup] = useState(null);
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    const {
        deckNames, deckSummaries, currentDeckName, changeDeck, masterData, setSelectedGroup, resetDeckByName, resetGroup
    } = useFlashcardContext();

    const isNestedCatalog = usesNestedLevelDecks(currentCategory);
    const activeLevel = getLevelFromDeckName(currentDeckName);

    const nestedDeckNames = useMemo(() => {
        return isNestedCatalog
            ? deckNames.filter((name) => getLevelFromDeckName(name) === activeLevel)
            : [];
    }, [isNestedCatalog, deckNames, activeLevel]);

    const levelTotals = useMemo(() => {
        return nestedDeckNames.reduce((acc, deckName) => {
            const summary = deckSummaries[deckName];
            acc.total += summary?.total ?? 0;
            acc.learned += summary?.learned ?? 0;
            return acc;
        }, { total: 0, learned: 0 });
    }, [nestedDeckNames, deckSummaries]);

    const totalCards = isNestedCatalog && nestedDeckNames.length > 0
        ? levelTotals.total
        : masterData.length;
    const learnedCards = isNestedCatalog && nestedDeckNames.length > 0
        ? levelTotals.learned
        : masterData.filter(c => c.learned).length;
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    const courseSpecificHelp = getHelpForCourse(courseDirection, currentCategory);
    const studyLocale = studyLanguage === 'de' ? 'de' : studyLanguage === 'es' ? 'es' : 'en';
    const interfaceHelpContent = getCategoryHelpContent(
        currentCategory,
        getFlashcardTranslations(language).categorySelector,
    );
    const studyHelpContent = getCategoryHelpContent(
        currentCategory,
        getFlashcardTranslations(studyLocale).categorySelector,
    );
    const mergedExampleTable = interfaceHelpContent?.exampleTable?.map((row, index) => ({
        ...row,
        items: studyHelpContent?.exampleTable?.[index]?.items ?? row.items,
    })) ?? null;
    const baseHelpContent = interfaceHelpContent
        ? {
            ...interfaceHelpContent,
            example: studyHelpContent?.example ?? interfaceHelpContent.example,
            exampleSentence: studyHelpContent?.exampleSentence ?? interfaceHelpContent.exampleSentence,
            exampleNotes: studyHelpContent?.exampleNotes ?? interfaceHelpContent.exampleNotes,
            exampleHighlight: studyHelpContent?.exampleHighlight ?? interfaceHelpContent.exampleHighlight,
            exampleTable: mergedExampleTable,
        }
        : null;
    const helpContent = courseSpecificHelp
        ? {
            ...baseHelpContent,
            ...courseSpecificHelp,
            title: language === 'es' ? courseSpecificHelp.title : (baseHelpContent?.title || courseSpecificHelp.title),
        }
        : baseHelpContent;

    // Obtener los grupos únicos de la data cargada actualmente
    const groupsMap = useMemo(() => {
        const map = {};
        masterData.forEach(card => {
            const groupName = card.group_name || 'General';
            if (!map[groupName]) {
                map[groupName] = [];
            }
            map[groupName].push(card);
        });
        return map;
    }, [masterData]);

    const groupNames = useMemo(() => Object.keys(groupsMap), [groupsMap]);

    const completedGroupNames = useMemo(() => {
        return groupNames.filter((groupName) => {
            const cards = groupsMap[groupName] || [];
            return cards.length > 0 && cards.every((card) => card.learned);
        });
    }, [groupNames, groupsMap]);

    const completedNestedDeckNames = useMemo(() => {
        return nestedDeckNames.filter((deckName) => {
            const summary = deckSummaries[deckName];
            return summary?.total > 0 && summary.learned === summary.total;
        });
    }, [nestedDeckNames, deckSummaries]);

    // Local states to handle fluid drag-and-drop before saving
    const [localGroupOrder, setLocalGroupOrder] = useState([]);
    const [localNestedDeckOrder, setLocalNestedDeckOrder] = useState([]);

    const recentNestedDecks = useMemo(
        () => recentlyFinishedDecks
            .filter((entry) => entry.category === currentCategory)
            .map((entry) => entry.deck),
        [recentlyFinishedDecks, currentCategory],
    );

    const groupNamesKey = groupNames.join(',');
    const completedGroupNamesKey = completedGroupNames.join(',');
    const nestedDeckNamesKey = nestedDeckNames.join(',');
    const completedNestedDeckNamesKey = completedNestedDeckNames.join(',');
    const recentNestedDecksKey = recentNestedDecks.join(',');

    useEffect(() => {
        const storedGroupOrder = getGroupOrderPreference(
            user?.email,
            currentCategory,
            currentDeckName,
            groupNames,
            user?.catalog_preferences,
        );
        const ordered = sortGroups(
            currentCategory,
            currentDeckName,
            groupNames,
            storedGroupOrder,
            completedGroupNames,
        );
        setLocalGroupOrder(ordered);
    }, [currentCategory, currentDeckName, groupNamesKey, user?.catalog_preferences, completedGroupNamesKey, user?.email]);

    const levelPreferenceKey = `__level__${activeLevel || 'basic'}`;
    useEffect(() => {
        const storedNestedDeckOrder = getGroupOrderPreference(
            user?.email,
            currentCategory,
            levelPreferenceKey,
            nestedDeckNames,
            user?.catalog_preferences,
        );
        const ordered = sinkRecentCategory(
            applyPreferenceOrder(nestedDeckNames, storedNestedDeckOrder),
            recentNestedDecks,
            completedNestedDeckNames,
        );
        setLocalNestedDeckOrder(ordered);
    }, [currentCategory, levelPreferenceKey, nestedDeckNamesKey, user?.catalog_preferences, completedNestedDeckNamesKey, user?.email, recentNestedDecksKey]);

    const groupsList = (localGroupOrder.length > 0 ? localGroupOrder : groupNames)
        .map(name => {
            const cards = groupsMap[name] || [];
            const total = cards.length;
            const learned = cards.filter(c => c.learned).length;
            return { name, total, learned };
        });
    const visibleGroups = groupsList;
    const visibleNestedDecks = localNestedDeckOrder.length > 0 ? localNestedDeckOrder : nestedDeckNames;

    const handleLevelChange = (level) => {
        const targetDeck = isNestedCatalog
            ? (
                deckNames.find((name) =>
                    getLevelFromDeckName(name) === level
                    && getDeckCategoryName(name) === getDeckCategoryName(currentDeckName),
                ) ?? deckNames.find((name) => getLevelFromDeckName(name) === level)
            )
            : deckNames.find((name) => getLevelFromDeckName(name) === level);
        if (targetDeck) {
            changeDeck(targetDeck);
        }
    };

    const handleCategoryClick = (category) => {
        changeCategory(category);
    };

    const handleGroupClick = (groupName) => {
        setSelectedGroup(groupName === 'General' ? null : groupName);
        dismissSheet();
    };

    const handleVerbDeckClick = (deckName) => {
        changeDeck(deckName);
        dismissSheet();
    };

    const moveLocalGroup = (fromIndex, toIndex) => {
        console.log(`[CategorySelector] 🔄 Moviendo grupo de índice ${fromIndex} a ${toIndex}`);
        let next;
        setLocalGroupOrder((previous) => {
            next = moveOrderedItem(previous, fromIndex, toIndex);
            console.log('[CategorySelector] ➡️ Nuevo orden de grupos en memoria:', next);
            return next;
        });

        setTimeout(() => {
            if (next) {
                console.log('[CategorySelector] 💾 Guardando orden final de grupos en servidor:', next);
                const nextPreferences = saveGroupOrderPreference(
                    user?.email,
                    currentCategory,
                    currentDeckName,
                    next,
                    user?.catalog_preferences,
                );
                console.log('[CategorySelector] ➡️ Preferencias de grupos actualizadas a enviar:', nextPreferences);
                void updateCatalogPreferences(nextPreferences);
            }
        }, 0);
    };

    const moveLocalNestedDeck = (fromIndex, toIndex) => {
        console.log(`[CategorySelector] 🔄 Moviendo subcategoría de índice ${fromIndex} a ${toIndex}`);
        let next;
        setLocalNestedDeckOrder((previous) => {
            next = moveOrderedItem(previous, fromIndex, toIndex);
            console.log('[CategorySelector] ➡️ Nuevo orden de subcategorías en memoria:', next);
            return next;
        });

        setTimeout(() => {
            if (next) {
                console.log('[CategorySelector] 💾 Guardando orden final de subcategorías en servidor:', next);
                const nextPreferences = saveGroupOrderPreference(
                    user?.email,
                    currentCategory,
                    levelPreferenceKey,
                    next,
                    user?.catalog_preferences,
                );
                console.log('[CategorySelector] ➡️ Preferencias de subcategorías actualizadas a enviar:', nextPreferences);
                void updateCatalogPreferences(nextPreferences);
            }
        }, 0);
    };

    const handleGroupReset = async (event, groupName) => {
        event.stopPropagation();

        const groupLabel = t.groups?.[groupName] || groupName;
        const shouldReset = await confirm({
            title: t.restartGroupConfirm.replace('{group}', groupLabel),
            tone: 'danger',
            confirmLabel: t.restartGroup,
        });

        if (!shouldReset) return;

        const resetOk = await resetGroup(groupName);
        if (resetOk) {
            handleGroupClick(groupName);
        }
    };

    const handleNestedDeckReset = async (event, deckName) => {
        event.stopPropagation();

        const deckLabel = formatDeckCategoryName(deckName, language);
        const shouldReset = await confirm({
            title: t.restartGroupConfirm.replace('{group}', deckLabel),
            tone: 'danger',
            confirmLabel: t.restartGroup,
        });

        if (!shouldReset) return;

        const resetOk = await resetDeckByName(deckName);
        if (resetOk) {
            handleVerbDeckClick(deckName);
        }
    };

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, []);

    useEffect(() => {
        if (!isHelpOpen) return undefined;

        const handlePointerDown = (event) => {
            const helpNode = helpPopoverRef.current;
            const buttonNode = helpButtonRef.current;
            if (helpNode?.contains(event.target) || buttonNode?.contains(event.target)) return;
            setIsHelpOpen(false);
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsHelpOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isHelpOpen]);

    // Mecánica de bottom sheet nativa (solo PWA standalone): arrastre desde
    // la franja superior (asa) con seguimiento del dedo y cierre animado
    // deslizando hacia abajo; el componente se desmonta al terminar la salida.
    const sheetRef = useRef(null);
    const sheetDragStartYRef = useRef(null);
    const [sheetDragY, setSheetDragY] = useState(0);
    const [isSheetDismissing, setIsSheetDismissing] = useState(false);
    const [isSheetSnapping, setIsSheetSnapping] = useState(false);
    const isStandaloneSheet = () => window.matchMedia?.('(display-mode: standalone)').matches;

    const dismissSheet = () => {
        if (!isStandaloneSheet()) {
            setIsCatalogVisible(false);
            return;
        }
        setIsSheetDismissing(true);
    };

    useEffect(() => {
        if (!isSheetDismissing) return undefined;
        const timer = setTimeout(() => setIsCatalogVisible(false), 260);
        return () => clearTimeout(timer);
    }, [isSheetDismissing, setIsCatalogVisible]);

    useEffect(() => {
        if (!isSheetSnapping) return undefined;
        const timer = setTimeout(() => setIsSheetSnapping(false), 300);
        return () => clearTimeout(timer);
    }, [isSheetSnapping]);

    const handleSheetTouchStart = (event) => {
        if (!isStandaloneSheet() || isSheetDismissing) return;
        const sheetTop = sheetRef.current?.getBoundingClientRect().top ?? 0;
        const touchY = event.targetTouches[0].clientY;
        if (touchY - sheetTop <= 56) {
            sheetDragStartYRef.current = touchY;
        }
    };

    const handleSheetTouchMove = (event) => {
        if (sheetDragStartYRef.current == null) return;
        const delta = event.targetTouches[0].clientY - sheetDragStartYRef.current;
        setSheetDragY(Math.max(0, delta));
    };

    const handleSheetTouchEnd = () => {
        if (sheetDragStartYRef.current == null) return;
        sheetDragStartYRef.current = null;
        if (sheetDragY > 110) {
            dismissSheet();
        } else {
            setSheetDragY(0);
            setIsSheetSnapping(true);
        }
    };

    const isSheetDragging = sheetDragStartYRef.current != null;
    const sheetMotionStyle = (sheetDragY > 0 || isSheetDismissing || isSheetSnapping)
        ? {
            transform: isSheetDismissing ? 'translateY(110%)' : `translateY(${sheetDragY}px)`,
            transition: isSheetDragging ? 'none' : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
        }
        : undefined;

    return (
        <div className={styles.categorySelectorOverlay} data-dismissing={isSheetDismissing || undefined}>
            <div
                className={styles.dashboardContainer}
                data-tour="catalogo-modal"
                ref={sheetRef}
                style={sheetMotionStyle}
                onTouchStart={handleSheetTouchStart}
                onTouchMove={handleSheetTouchMove}
                onTouchEnd={handleSheetTouchEnd}
            >
                {/* Botón de cerrar */}
                <button className={styles.closeBtn} onClick={dismissSheet}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                {/* Sidebar Izquierda */}
                <aside className={styles.sidebar} data-tour="panel-categorias">
                    <h3 className={styles.sidebarTitle}>{t.categoryTitle}</h3>
                    <nav className={styles.categoryNav} aria-busy={categoriesLoading || areCategoryTotalsLoading}>
                        {categoriesLoading && categories.length === 0 && (
                            <p className={styles.sidebarLoading}>{t.loadingCategories || '…'}</p>
                        )}
                        {categories.map(cat => {
                            const isActive = cat === currentCategory;
                            const count = categoryTotals[cat];
                            const isCountLoading = areCategoryTotalsLoading && count == null;
                            const dotColor = categoryColors[cat] || '#ffffff';
                            return (
                                <button
                                    key={cat}
                                    className={`${styles.categoryBtn} ${isActive ? styles.activeCategory : ''} ${draggingCategory === cat ? styles.isDragging : ''}`}
                                    onClick={() => handleCategoryClick(cat)}
                                    draggable
                                    onDragStart={(event) => {
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', cat);
                                        dragStateRef.current = { type: 'category', id: cat };
                                        setDraggingCategory(cat);
                                    }}
                                    onDragOver={(event) => {
                                        if (dragStateRef.current.type !== 'category') return;
                                        event.preventDefault();
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        if (dragStateRef.current.type !== 'category') return;
                                        const sourceCategory = dragStateRef.current.id;
                                        console.log(`[CategorySelector] 📥 Soltando categoría "${sourceCategory}" sobre "${cat}"`);
                                        if (sourceCategory && sourceCategory !== cat) {
                                            const fromIndex = categories.indexOf(sourceCategory);
                                            const toIndex = categories.indexOf(cat);
                                            if (fromIndex !== -1 && toIndex !== -1) {
                                                console.log(`[CategorySelector] 🔄 Reordenando categorías en memoria de índice ${fromIndex} a ${toIndex}`);
                                                moveCategory(fromIndex, toIndex);
                                            }
                                        }
                                    }}
                                    onDragEnd={() => {
                                        console.log('[CategorySelector] 🏁 Fin de arrastre de categoría');
                                        dragStateRef.current = { type: null, id: null };
                                        setDraggingCategory(null);
                                    }}
                                    data-tour="categoria-item"
                                    data-categoria={categoryToTourSlug(cat)}
                                    aria-current={isActive ? 'true' : undefined}
                                >
                                    <span className={styles.categoryInfo}>
                                        <span className={styles.dot} style={{ backgroundColor: dotColor }} />
                                        <span className={styles.categoryName}>{formatName(cat, t)}</span>
                                    </span>
                                    <span
                                        className={`${styles.categoryCount} ${isCountLoading ? styles.categoryCountLoading : ''}`}
                                        aria-label={isCountLoading ? (t.loadingCategories || 'Cargando') : undefined}
                                    >
                                        {isCountLoading ? <span className={styles.countSpinner} aria-hidden="true" /> : (count ?? '—')}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {/* Contenido Principal Derecha */}
                <main className={styles.mainContent}>
                    {/* Header superior */}
                    <div className={styles.header}>
                        <div className={styles.levelSelector} data-tour="catalogo-nivel">
                            <div className={styles.selectorLabelRow}>
                                <span className={styles.selectorLabel}>{t.level}</span>
                            </div>
                            <div className={styles.levelControlsRow}>
                                <div className={styles.levelButtons}>
                                    {['basic', 'intermediate', 'advanced'].map(lvl => {
                                        const isActive = activeLevel === lvl;
                                        const isAvailable = deckNames.some((name) => getLevelFromDeckName(name) === lvl);
                                        return (
                                                <button
                                                key={lvl}
                                                disabled={!isAvailable}
                                                className={`${styles.levelBtn} ${isActive ? styles.activeLevel : ''}`}
                                                onClick={() => handleLevelChange(lvl)}
                                            >
                                                {t.levels ? t.levels[lvl] : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    type="button"
                                    ref={helpButtonRef}
                                    className={styles.helpIconBtn}
                                    onClick={() => setIsHelpOpen((value) => !value)}
                                    aria-label={t.helpButtonLabel || 'Category help'}
                                    aria-expanded={isHelpOpen}
                                    aria-controls="category-help-popover"
                                >
                                    <LuCircleHelp />
                                </button>
                            </div>
                            {isHelpOpen && helpContent && (
                                <div
                                    id="category-help-popover"
                                    ref={helpPopoverRef}
                                    className={styles.helpPopover}
                                    role="dialog"
                                    aria-label={helpQuestionTitle || helpContent.title}
                                >
                                    <div className={styles.helpPopoverHeader}>
                                        <span className={styles.helpPopoverKicker}>{helpQuestionTitle}</span>
                                        <button
                                            type="button"
                                            className={styles.helpPopoverCloseBtn}
                                            onClick={() => setIsHelpOpen(false)}
                                            aria-label={language === 'es' ? 'Cerrar ayuda' : 'Close help'}
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <p className={styles.helpPopoverText}>{helpContent.summary}</p>
                                    <div className={styles.helpPopoverBlock}>
                                        <span className={styles.helpPopoverLabel}>{t.helpPopoverUsageLabel}</span>
                                        <p className={styles.helpPopoverText}>{helpContent.usage}</p>
                                    </div>
                                    <div className={styles.helpPopoverExample}>
                                        <span className={styles.helpPopoverLabel}>{t.helpPopoverExampleLabel}</span>
                                        {helpContent.exampleTable ? (
                                            <>
                                                {renderExampleTable(helpContent.exampleTable, helpContent.exampleHighlight)}
                                                {helpContent.exampleSentence ? (
                                                    <p className={styles.helpPopoverExampleSentence}>
                                                        {helpContent.exampleSentence}
                                                    </p>
                                                ) : null}
                                                {renderExampleNotes(helpContent.exampleNotes, helpContent.exampleHighlight)}
                                            </>
                                        ) : helpContent.exampleNotes ? (
                                            renderExampleNotes(helpContent.exampleNotes, helpContent.exampleHighlight)
                                        ) : (
                                            <p className={styles.helpPopoverExampleText}>
                                                {renderHighlightedExample(helpContent.example, helpContent.exampleHighlight)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={styles.stats}>
                            <span className={styles.statTotal}>{totalCards} {t.cardsInLevel}</span>
                            <span className={styles.statSeparator}>·</span>
                            <span className={styles.statLearned}>{learnedCards} {t.learned}</span>
                        </div>
                    </div>

                    {/* Grilla de grupos */}
                    <div className={styles.groupsGrid} data-tour="catalogo-grid">
                        {isNestedCatalog ? visibleNestedDecks.map((deckName) => {
                            const summary = deckSummaries[deckName];
                            const total = summary?.total ?? 0;
                            const learned = summary?.learned ?? 0;
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
                                    className={`${styles.groupCard} ${isComplete ? styles.groupCardComplete : ''} ${isActiveDeck ? styles.activeCategory : ''} ${draggingGroup === deckName ? styles.isDragging : ''}`}
                                    onClick={() => handleVerbDeckClick(deckName)}
                                    style={{ '--card-accent': categoryColor }}
                                    data-tour="boton-abrir-categoria"
                                    draggable={!isComplete}
                                    onDragStart={(event) => {
                                        if (isComplete) return;
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', deckName);
                                        dragStateRef.current = { type: 'nested-deck', id: deckName };
                                        setDraggingGroup(deckName);
                                        console.log('[CategorySelector] 🚀 Inicia arrastre de subcategoría:', deckName);
                                    }}
                                    onDragOver={(event) => {
                                        if (isComplete || dragStateRef.current.type !== 'nested-deck') return;
                                        event.preventDefault();
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        if (isComplete || dragStateRef.current.type !== 'nested-deck') return;
                                        const sourceDeckName = dragStateRef.current.id;
                                        console.log(`[CategorySelector] 📥 Soltando subcategoría "${sourceDeckName}" sobre "${deckName}"`);
                                        if (sourceDeckName && sourceDeckName !== deckName) {
                                            const fromIndex = localNestedDeckOrder.indexOf(sourceDeckName);
                                            const toIndex = localNestedDeckOrder.indexOf(deckName);
                                            if (fromIndex !== -1 && toIndex !== -1) {
                                                console.log(`[CategorySelector] 🔄 Reordenando subcategoría local de índice ${fromIndex} a ${toIndex}`);
                                                moveLocalNestedDeck(fromIndex, toIndex);
                                            }
                                        }
                                    }}
                                    onDragEnd={() => {
                                        console.log('[CategorySelector] 🏁 Fin de arrastre de subcategoría');
                                        dragStateRef.current = { type: null, id: null };
                                        setDraggingGroup(null);
                                    }}
                                >
                                    <div className={styles.groupHeader}>
                                        <h4 className={styles.groupName}>{formatDeckCategoryName(deckName, language)}</h4>
                                        <div className={styles.groupActions}>
                                            {isComplete ? (
                                                <button
                                                    type="button"
                                                    className={styles.resetGroupBtn}
                                                    onClick={(event) => handleNestedDeckReset(event, deckName)}
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
                                    onClick={isComplete ? undefined : () => handleGroupClick(group.name)}
                                    style={{ '--card-accent': categoryColor }}
                                    aria-disabled={isComplete}
                                    draggable={!isComplete}
                                    onDragStart={(event) => {
                                        if (isComplete) return;
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', group.name);
                                        dragStateRef.current = { type: 'group', id: group.name };
                                        setDraggingGroup(group.name);
                                        console.log('[CategorySelector] 🚀 Inicia arrastre de grupo:', group.name);
                                    }}
                                    onDragOver={(event) => {
                                        if (isComplete || dragStateRef.current.type !== 'group') return;
                                        event.preventDefault();
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        if (isComplete || dragStateRef.current.type !== 'group') return;
                                        const sourceGroupName = dragStateRef.current.id;
                                        console.log(`[CategorySelector] 📥 Soltando grupo "${sourceGroupName}" sobre "${group.name}"`);
                                        if (sourceGroupName && sourceGroupName !== group.name) {
                                            const fromIndex = localGroupOrder.indexOf(sourceGroupName);
                                            const toIndex = localGroupOrder.indexOf(group.name);
                                            if (fromIndex !== -1 && toIndex !== -1) {
                                                console.log(`[CategorySelector] 🔄 Reordenando grupo local de índice ${fromIndex} a ${toIndex}`);
                                                moveLocalGroup(fromIndex, toIndex);
                                            }
                                        }
                                    }}
                                    onDragEnd={() => {
                                        console.log('[CategorySelector] 🏁 Fin de arrastre de grupo');
                                        dragStateRef.current = { type: null, id: null };
                                        setDraggingGroup(null);
                                    }}
                                    data-tour={!isComplete ? 'boton-abrir-categoria' : undefined}
                                >
                                    <div className={styles.groupHeader}>
                                        <h4 className={styles.groupName}>{t.groups && t.groups[group.name] ? t.groups[group.name] : group.name}</h4>
                                        <div className={styles.groupActions}>
                                            {isComplete ? (
                                                <button
                                                    type="button"
                                                    className={styles.resetGroupBtn}
                                                    onClick={(event) => handleGroupReset(event, group.name)}
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
                                                backgroundColor: progressColor
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
                </main>
            </div>
        </div>
    );
}

export default CategorySelector;
