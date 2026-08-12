// Reusa el stylesheet de CategorySelector (mismo motivo que CategoryHelpPopover: las reglas
// `.categoryNav`/`.categoryBtn`/etc. están repartidas en varias `@media` queries no contiguas).
import styles from './CategorySelector.module.css';
import { useDragReorder } from '../hooks/useDragReorder';
import { categoryToTourSlug } from '../config/onboardingUiAutomation';

const formatName = (name, t) => {
    if (!name) return '';
    const clean = name.replace(/^\.\//, '');
    if (t && t.categories && t.categories[clean]) {
        return t.categories[clean];
    }
    return clean.replace(/[_-]/g, ' ').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

/**
 * Lista de categorías del sidebar, reordenable por arrastre. Componente de presentación puro:
 * no conoce `CategorySelector` ni el resto del catálogo — solo categorías/totales y dos
 * callbacks (click, reorden). Reemplaza `<nav className={styles.categoryNav}>` inline.
 */
function CategoryNav({
    categories,
    categoryTotals,
    areCategoryTotalsLoading,
    categoriesLoading,
    currentCategory,
    categoryColors,
    t,
    onCategoryClick,
    onReorder,
}) {
    const { draggingId: draggingCategory, getDragHandlers } = useDragReorder({
        items: categories,
        onReorder,
        logLabel: 'CategoryNav',
    });

    return (
        <nav className={styles.categoryNav} aria-busy={categoriesLoading || areCategoryTotalsLoading}>
            {categoriesLoading && categories.length === 0 && (
                <p className={styles.sidebarLoading}>{t.loadingCategories || '…'}</p>
            )}
            {categories.map((cat) => {
                const isActive = cat === currentCategory;
                const count = categoryTotals[cat];
                const isCountLoading = areCategoryTotalsLoading && count == null;
                const dotColor = categoryColors[cat] || '#ffffff';
                return (
                    <button
                        key={cat}
                        className={`${styles.categoryBtn} ${isActive ? styles.activeCategory : ''} ${draggingCategory === cat ? styles.isDragging : ''}`}
                        onClick={() => onCategoryClick(cat)}
                        {...getDragHandlers(cat)}
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
    );
}

export default CategoryNav;
