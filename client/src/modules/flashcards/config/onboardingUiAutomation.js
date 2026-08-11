/** Slugs semánticos para data-categoria (automatización / IA). */
export const CATEGORY_TOUR_SLUGS = {
    nouns: 'sustantivos',
    verbs: 'verbos',
    adjectives: 'adjetivos',
    adverbs: 'adverbios',
    preposition: 'preposiciones',
    pronouns: 'pronombres',
    connectors: 'conectores',
    determinant: 'determinantes',
    phrasal_verbs: 'phrasal_verbs',
};

export const DEFAULT_TOUR_CATEGORY = 'pronombres';

export function categoryToTourSlug(categoryId) {
    return CATEGORY_TOUR_SLUGS[categoryId] || categoryId;
}

export function isSidebarOpen() {
    return Boolean(document.querySelector('.app-sidebar.open'));
}

export function isFloatingMenuOpen() {
    return Boolean(document.querySelector('.floatingOptions.show'));
}

export function isCatalogOpen() {
    return Boolean(document.querySelector('[data-tour="catalogo-modal"]'));
}

export function isCategorySelected() {
    return Boolean(document.querySelector('[data-tour="categoria-item"][aria-current="true"]'));
}

/** @deprecated use isCategorySelected */
export function isCategoryActive() {
    return isCategorySelected();
}

export function isStudyViewActive() {
    return Boolean(
        document.querySelector('[data-tour="flashcard-contenedor"]')
        && !isCatalogOpen(),
    );
}

export function isFlashcardsModuleRoute() {
    if (typeof window === 'undefined') return false;
    const { pathname } = window.location;
    return pathname === '/' || pathname === '/flashcard' || pathname.startsWith('/flashcard/');
}

/** Vista de estudio lista: módulo cargado (aunque aún no haya tarjeta activa). */
export function isFlashcardsModuleReady() {
    return isFlashcardsModuleRoute() && Boolean(
        document.querySelector('[data-tour="flashcard-contenedor"]')
        || document.querySelector('.flashcard-page-wrapper')
        || document.querySelector('.flashcard-main-area'),
    );
}

export function isCardFlipped() {
    const card = document.querySelector('[data-tour="boton-voltear-tarjeta"]');
    return card?.getAttribute('data-flipped') === 'true';
}

export function isCardFaceUp() {
    return !isCardFlipped();
}

export function queryTourTarget(selector) {
    return document.querySelector(selector);
}

export function isTourTargetRectStable(rect, { minSize = 40, maxAspectRatio = 1.35 } = {}) {
    if (!rect || rect.width < minSize || rect.height < minSize) return false;
    const ratio = Math.max(rect.width, rect.height) / Math.min(rect.width, rect.height);
    return ratio <= maxAspectRatio;
}

export function normalizeCompactTourRect(rect, { width = 56, height = 56 } = {}) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return {
        top: cy - height / 2,
        left: cx - width / 2,
        right: cx + width / 2,
        bottom: cy + height / 2,
        width,
        height,
    };
}

export function measureTourTarget(selector, {
    compactHighlight,
    requireStableRect = false,
    requireVisible = false,
    requirePhraseRevealed = false,
} = {}) {
    const target = document.querySelector(selector);
    if (!(target instanceof Element)) return { target: null, rect: null };
    if (requireVisible && !isTourElementVisible(target)) return { target: null, rect: null };
    if (requirePhraseRevealed && !isPhraseExampleRevealed(target)) {
        return { target: null, rect: null };
    }

    const rawRect = target.getBoundingClientRect();
    if (requireStableRect && !isTourTargetRectStable(rawRect)) {
        return { target: null, rect: null };
    }

    const rect = compactHighlight
        ? normalizeCompactTourRect(rawRect, compactHighlight)
        : rawRect;

    return { target, rect };
}

export function isTourElementVisible(element) {
    if (!(element instanceof Element)) return false;

    let node = element;
    while (node instanceof Element) {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
        }
        node = node.parentElement;
    }

    return true;
}

export function isPhraseExampleRevealed(playButton) {
    if (!(playButton instanceof Element)) return false;
    const row = playButton.closest('li');
    if (!row) return false;
    return Boolean(row.querySelector('[data-phrase-revealed="true"]'));
}

export function isPhraseAudioTourTargetReady(selector, options = {}) {
    const { target, rect } = measureTourTarget(selector, {
        requireVisible: true,
        requireStableRect: true,
        requirePhraseRevealed: true,
        compactHighlight: { width: 56, height: 56 },
        ...options,
    });
    return Boolean(target && rect);
}

export function readUiSnapshot() {
    const visibleTargets = Array.from(document.querySelectorAll('[data-tour]'))
        .map((node) => {
            const rect = node.getBoundingClientRect();
            const isVisible = rect.width > 0
                && rect.height > 0
                && rect.bottom > 0
                && rect.right > 0
                && rect.top < window.innerHeight
                && rect.left < window.innerWidth;

            if (!isVisible) return null;

            const text = (node.getAttribute('aria-label') || node.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 80);

            return {
                tour: node.getAttribute('data-tour'),
                categoria: node.getAttribute('data-categoria') || null,
                aria_current: node.getAttribute('aria-current') || null,
                aria_expanded: node.getAttribute('aria-expanded') || null,
                text,
            };
        })
        .filter(Boolean)
        .slice(0, 40);

    return {
        sidebar_open: isSidebarOpen(),
        floating_menu_open: isFloatingMenuOpen(),
        catalog_open: isCatalogOpen(),
        study_view: isStudyViewActive(),
        card_flipped: isCardFlipped(),
        visible_targets: visibleTargets,
        path: typeof window !== 'undefined' ? window.location.pathname : '',
    };
}

export function waitForCondition(checkFn, { timeout = 5000, interval = 120 } = {}) {
    return new Promise((resolve) => {
        const started = Date.now();

        const tick = () => {
            if (checkFn()) {
                resolve(true);
                return;
            }
            if (Date.now() - started >= timeout) {
                resolve(false);
                return;
            }
            window.setTimeout(tick, interval);
        };

        tick();
    });
}

export function getTapAutomationLabel(element) {
    if (!(element instanceof Element)) return 'desconocido';
    const tourNode = element.closest('[data-tour]');
    if (tourNode) {
        const tour = tourNode.getAttribute('data-tour');
        const categoria = tourNode.getAttribute('data-categoria');
        return categoria ? `${tour}[${categoria}]` : tour;
    }
    const aria = element.getAttribute('aria-label');
    if (aria) return aria;
    return element.tagName.toLowerCase();
}
