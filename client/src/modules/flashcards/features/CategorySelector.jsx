import { useState } from 'react';
import { LuPlus } from 'react-icons/lu';
import styles from './CategorySelector.module.css';
import CreateWordModal from './CreateWordModal';
import CatalogSearch from './CatalogSearch';
import CategoryHelpPopover from './CategoryHelpPopover';
import CategoryNav from './CategoryNav';
import DeckGrid from './DeckGrid';
import { personalWordPort } from '../composition';
import { useAuth } from '../../../context/AuthContext';
import { useUIContext } from '../../../context/UIContext';
import { useDialog } from '../../../context/AppContext';
import { useFlashcardUiContext } from '../context/FlashcardUiContext';
import { useFlashcardContext } from '../context/FlashcardContext';
import { useCategoryContext } from '../context/CategoryContext';
import { useBottomSheet } from '../hooks/useBottomSheet';
import { useLocalCatalogOrder } from '../hooks/useLocalCatalogOrder';
import { getFlashcardTranslations } from '../config/translations';
import { getCourseDirectionFromStudyLanguage } from '../../../contracts/courseDirection';
import { getDeckCategoryName, formatDeckCategoryName, getLevelFromDeckName, usesNestedLevelDecks } from '../useCases/deckUseCases';

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

/**
 * Orquestador del modal de catálogo. NO implementa las secciones visuales — cada una es su
 * propio componente (SRP, ver client/CLAUDE.md §7): buscador (`CatalogSearch`), lista de
 * categorías (`CategoryNav`), ayuda gramatical (`CategoryHelpPopover`), grilla de mazos/grupos
 * (`DeckGrid`). Este archivo solo conecta contexto ↔ hooks de aplicación ↔ esas piezas, y retiene
 * la mecánica de bottom sheet (`useBottomSheet`) y el orden local persistido
 * (`useLocalCatalogOrder`) porque son transversales a más de una sección.
 */
function CategorySelector() {
    const { user, updateCatalogPreferences } = useAuth();
    const { language = 'en', studyLanguage = 'en', setAppMessage } = useUIContext();
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
    const [isCreateWordOpen, setIsCreateWordOpen] = useState(false);
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);

    const {
        deckNames, deckSummaries, currentDeckName, changeDeck, masterData, setSelectedGroup, resetDeckByName, resetGroup, refreshPersonalWords
    } = useFlashcardContext();

    const {
        sheetRef,
        isSheetDismissing,
        sheetMotionStyle,
        dismissSheet,
        handleSheetTouchStart,
        handleSheetTouchMove,
        handleSheetTouchEnd,
    } = useBottomSheet(setIsCatalogVisible);

    const handleSelectSearchResult = (result) => {
        if (!result) return;
        const cleanDeck = result.deck ? result.deck.replace(/\.json$/, '') : result.deck;
        changeCategory(result.category);
        changeDeck(cleanDeck, result.card_index, result.category, { word: result.name });
        dismissSheet();
    };

    const isNestedCatalog = usesNestedLevelDecks(currentCategory);
    const activeLevel = getLevelFromDeckName(currentDeckName);

    const nestedDeckNames = isNestedCatalog
        ? deckNames.filter((name) => getLevelFromDeckName(name) === activeLevel)
        : [];

    const levelTotals = nestedDeckNames.reduce((acc, deckName) => {
        const summary = deckSummaries[deckName];
        acc.total += summary?.total ?? 0;
        acc.learned += summary?.learned ?? 0;
        return acc;
    }, { total: 0, learned: 0 });

    const totalCards = isNestedCatalog && nestedDeckNames.length > 0
        ? levelTotals.total
        : masterData.length;
    const learnedCards = isNestedCatalog && nestedDeckNames.length > 0
        ? levelTotals.learned
        : masterData.filter(c => c.learned).length;

    const { visibleGroups, visibleNestedDecks, moveLocalGroup, moveLocalNestedDeck } = useLocalCatalogOrder({
        user,
        updateCatalogPreferences,
        currentCategory,
        currentDeckName,
        masterData,
        nestedDeckNames,
        deckSummaries,
        recentlyFinishedDecks,
        activeLevel,
    });

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

    // Renombrar un mazo personal ("Crear palabra") directo desde su tarjeta en la grilla — antes
    // solo se podía ponerle nombre justo al crearlo (ver CreateWordModal). `deckName` siempre es
    // el sentinel `<nivel>/my_words`; el nivel crudo que pide el endpoint es su primer segmento.
    const handleRenameTopic = async (deckName, topicName) => {
        try {
            await personalWordPort.renamePersonalDeck({
                category: currentCategory,
                level: deckName.split('/')[0],
                topicName,
                courseDirection,
            });
            refreshPersonalWords?.();
        } catch (err) {
            setAppMessage({ text: err?.message || 'No se pudo guardar el nombre.', isError: true });
        }
    };

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
                    <div className={styles.sidebarTitleRow}>
                        <h3 className={styles.sidebarTitle}>{t.categoryTitle}</h3>
                        <button
                            type="button"
                            className={styles.createWordBtn}
                            onClick={() => setIsCreateWordOpen(true)}
                            aria-label={t.createWordButtonLabel}
                            title={t.createWordButtonLabel}
                            data-tour="crear-palabra-btn"
                        >
                            <LuPlus size={16} />
                        </button>
                    </div>

                    <CatalogSearch
                        courseDirection={courseDirection}
                        categoryColors={categoryColors}
                        categoryLabels={t?.categories}
                        studyLanguage={studyLanguage}
                        onSelectResult={handleSelectSearchResult}
                    >
                        <CategoryNav
                            categories={categories}
                            categoryTotals={categoryTotals}
                            areCategoryTotalsLoading={areCategoryTotalsLoading}
                            categoriesLoading={categoriesLoading}
                            currentCategory={currentCategory}
                            categoryColors={categoryColors}
                            t={t}
                            onCategoryClick={handleCategoryClick}
                            onReorder={moveCategory}
                        />
                    </CatalogSearch>
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
                                <CategoryHelpPopover
                                    category={currentCategory}
                                    language={language}
                                    studyLanguage={studyLanguage}
                                    courseDirection={courseDirection}
                                />
                            </div>
                        </div>

                        <div className={styles.stats}>
                            <span className={styles.statTotal}>{totalCards} {t.cardsInLevel}</span>
                            <span className={styles.statSeparator}>·</span>
                            <span className={styles.statLearned}>{learnedCards} {t.learned}</span>
                        </div>
                    </div>

                    <DeckGrid
                        isNestedCatalog={isNestedCatalog}
                        visibleNestedDecks={visibleNestedDecks}
                        visibleGroups={visibleGroups}
                        deckSummaries={deckSummaries}
                        currentDeckName={currentDeckName}
                        currentCategory={currentCategory}
                        language={language}
                        t={t}
                        categoryColors={categoryColors}
                        onDeckClick={handleVerbDeckClick}
                        onGroupClick={handleGroupClick}
                        onDeckReset={handleNestedDeckReset}
                        onGroupReset={handleGroupReset}
                        onReorderNestedDecks={moveLocalNestedDeck}
                        onReorderGroups={moveLocalGroup}
                        onRenameTopic={handleRenameTopic}
                    />
                </main>
            </div>
            {isCreateWordOpen && <CreateWordModal onClose={() => setIsCreateWordOpen(false)} />}
        </div>
    );
}

export default CategorySelector;
