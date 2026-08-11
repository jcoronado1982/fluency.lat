import {
    isCardFaceUp,
    isCardFlipped,
    isCatalogOpen,
    isCategorySelected,
    isFlashcardsModuleReady,
    isSidebarOpen,
    isStudyViewActive,
} from './onboardingUiAutomation';

const buildSteps = (locale) => {
    const es = locale === 'es';
    return [
        {
            id: 'menu-hamburguesa',
            selector: '[data-tour="menu-hamburguesa"]',
            performAction: 'openSidebar',
            compactHighlight: { width: 40, height: 40 },
            tooltipPlacement: 'bottom',
            tooltipPlacements: ['bottom', 'right', 'top'],
            tooltipGap: 10,
            label: es ? 'Abre el menú' : 'Open the menu',
            hint: es
                ? 'Toca el botón ☰ arriba a la izquierda o pulsa Siguiente para abrir el menú lateral.'
                : 'Tap the ☰ button in the top-left or press Next to open the side menu.',
            fallback: es
                ? 'Primero abre el menú lateral. Ahí aparecen los módulos que puedes usar.'
                : 'First open the side menu. That is where your available modules appear.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: isSidebarOpen,
        },
        {
            id: 'cargar-modulo-flashcards',
            selector: '[data-tour="flashcards-nav"]',
            markOptionsSelector: '[data-tour="flashcards-nav"]',
            performAction: 'navigateFlashcards',
            tooltipPlacement: 'right',
            tooltipPlacements: ['right', 'bottom', 'top'],
            tooltipGap: 10,
            label: es ? 'Carga el módulo Flashcards' : 'Load the Flashcards module',
            hint: es
                ? 'Toca esta opción del menú lateral o pulsa Siguiente para entrar al módulo de Flashcards.'
                : 'Tap this side-menu option or press Next to enter the Flashcards module.',
            fallback: es
                ? 'Esta es la opción que carga Flashcards. Cuando quieras estudiar palabras, entra por aquí.'
                : 'This is the option that loads Flashcards. Whenever you want to study words, enter here.',
            prep: { sidebar: true, floatingMenu: false, catalog: false },
            gate: isFlashcardsModuleReady,
            gateTimeoutMs: 15000,
        },
        {
            id: 'catalogo-categorias',
            selector: '[data-tour="catalogo-categorias"]',
            performAction: 'openCatalog',
            tooltipPlacement: 'left',
            tooltipPlacements: ['left', 'bottom', 'top'],
            tooltipGap: 10,
            gateTimeoutMs: 10000,
            label: es ? 'Catálogo de vocabulario' : 'Vocabulary catalog',
            hint: es
                ? 'Ahora toca «Categorías» para abrir el catálogo de vocabulario.'
                : 'Now tap «Categories» to open the vocabulary catalog.',
            fallback: es
                ? 'Aquí empieza la configuración de lo que vas a practicar: primero abres el catálogo de vocabulario.'
                : 'This is where you start choosing what to practice: first open the vocabulary catalog.',
            prep: { sidebar: false, floatingMenu: true, catalog: false },
            gate: isCatalogOpen,
        },
        {
            id: 'elegir-categoria',
            highlightMode: 'zone',
            selector: '[data-tour="panel-categorias"]',
            zoneSelector: '[data-tour="panel-categorias"]',
            sectionSelector: '[data-tour="panel-categorias"]',
            tapSelector: '[data-tour="categoria-item"]',
            markOptionsSelector: '[data-tour="categoria-item"]',
            label: es ? 'Elige una categoría' : 'Pick a category',
            hint: es
                ? 'Toca cualquier categoría: Pronombres, Verbos, Sustantivos, etc.'
                : 'Tap any category: Pronouns, Verbs, Nouns, etc.',
            fallback: es
                ? 'Todas las categorías están marcadas. Elige la que quieras estudiar: verbos, sustantivos, pronombres, conectores…'
                : 'All categories are marked. Pick what you want to study: verbs, nouns, pronouns, connectors…',
            prep: { sidebar: false, floatingMenu: false, catalog: true },
            gate: isCategorySelected,
        },
        {
            id: 'catalogo-nivel',
            selector: '[data-tour="catalogo-nivel"]',
            advanceWithoutAction: true,
            tooltipPlacement: 'bottom',
            label: es ? 'Niveles de vocabulario' : 'Vocabulary levels',
            hint: es
                ? 'En esta sección puedes cambiar el nivel. Cada mazo está especialmente configurado para Básico, Intermedio o Avanzado. La idea es ir de básico a avanzado para no saltar palabras: si ya la sabes, márcala como aprendida.'
                : 'In this section you can change the level. Each deck is specially configured for Basic, Intermediate, or Advanced. The idea is to progress from basic to advanced so you don\'t skip words—if you already know one, mark it as learned.',
            fallback: es
                ? 'Empieza por Básico y avanza cuando domines el vocabulario de cada nivel.'
                : 'Start with Basic and move up when you master each level\'s vocabulary.',
            prep: { sidebar: false, floatingMenu: false, catalog: true },
            gate: () => true,
        },
        {
            id: 'elegir-subtema',
            highlightMode: 'zone',
            selector: '[data-tour="catalogo-grid"]',
            zoneSelector: '[data-tour="catalogo-modal"]',
            sectionSelector: '[data-tour="catalogo-grid"]',
            tapSelector: '[data-tour="boton-abrir-categoria"]',
            markOptionsSelector: '[data-tour="boton-abrir-categoria"]',
            label: es ? 'Elige un tópico' : 'Pick a topic',
            hint: es
                ? 'Toca cualquier tópico disponible (Sujeto, Reflexivos, etc.) para empezar la lección.'
                : 'Tap any available topic (Subject, Reflexives, etc.) to start the lesson.',
            fallback: es
                ? 'Cada tarjeta es un bloque de palabras. Puedes elegir cualquiera de las opciones marcadas en rosa.'
                : 'Each card is a word block. You can pick any of the pink-marked options.',
            prep: { sidebar: false, floatingMenu: false, catalog: true },
            gate: isStudyViewActive,
            gateTimeoutMs: 15000,
        },
        {
            id: 'presentacion-tarjeta',
            enterAction: 'blurPhrases',
            selector: '[data-tour="flashcard-contenedor"]',
            advanceWithoutAction: true,
            tooltipPlacements: ['right', 'left', 'bottom'],
            label: es ? 'Tu tarjeta de estudio' : 'Your study card',
            hint: es
                ? 'Esta es tu tarjeta: aquí ves la palabra, su fonética y frases de uso común relacionadas con ella. Puedes reproducir cada frase con audio. La imagen está enfocada en la acción que se describe en la frase. En el siguiente paso aprenderás a voltearla para ver la traducción.'
                : 'This is your card: you see the word, its phonetics, and common example phrases related to it. You can play each phrase aloud. The image focuses on the action described in the phrase. In the next step you\'ll learn how to flip it to see the translation.',
            fallback: es
                ? 'Aquí practicas cada palabra del tópico que elegiste.'
                : 'Here you practice each word from the topic you picked.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: isStudyViewActive,
        },
        {
            id: 'boton-voltear-tarjeta',
            selector: '[data-tour="boton-voltear-tarjeta"]',
            performAction: 'flipCard',
            acceptKeyboard: true,
            keyboardKeys: ['ArrowUp', 'ArrowDown'],
            tooltipPlacements: ['right', 'left', 'bottom'],
            label: es ? 'Voltear tarjeta' : 'Flip card',
            hint: es
                ? 'Toca la tarjeta central o usa las teclas ↑ ↓ del teclado para voltearla y ver la traducción.'
                : 'Tap the center card or press ↑ ↓ on your keyboard to flip it and see the translation.',
            fallback: es
                ? 'Toca la tarjeta o usa ↑ ↓ para ver la traducción al otro lado. Atajos de teclado: ↑ ↓'
                : 'Tap the card or press ↑ ↓ to see the translation on the other side. Keyboard shortcuts: ↑ ↓',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: isCardFlipped,
            gateTimeoutMs: 8000,
            postGateDelayMs: 3000,
        },
        {
            id: 'reproducir-audio',
            enterAction: 'prepareReproducirAudioStep',
            selector: '[data-tour="boton-voltear-tarjeta"][data-flipped="false"] [data-tour="boton-reproducir-audio-frase"]',
            markOptionsSelector: '[data-tour="boton-reproducir-audio-frase"]',
            advanceWithoutAction: true,
            waitForTarget: true,
            waitForPhraseRevealed: true,
            tooltipPlacements: ['left', 'bottom', 'right'],
            tooltipGap: 10,
            targetSyncDelayMs: 980,
            maxSyncAttempts: 200,
            compactHighlight: { width: 56, height: 56 },
            requireStableTargetRect: true,
            requireVisibleTarget: true,
            label: es ? 'Reproducir audio' : 'Play audio',
            hint: es
                ? 'Toca el botón ▶ junto a la frase de ejemplo para escuchar la pronunciación.'
                : 'Tap the ▶ next to the example phrase to hear the pronunciation.',
            fallback: es
                ? 'Puedes reproducir la palabra principal o cualquier frase de ejemplo.'
                : 'You can play the main word or any example phrase.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: isCardFaceUp,
            gateTimeoutMs: 3000,
            exitAction: 'playPhrase',
            exitBlurAction: 'blurPhrases',
            exitDelayMs: 2000,
        },
        {
            id: 'boton-anterior-tarjeta',
            selector: '[data-tour="boton-anterior-tarjeta"]',
            performAction: 'prevCard',
            acceptKeyboard: true,
            keyboardKeys: ['ArrowLeft'],
            tooltipPlacement: 'top',
            label: es ? 'Tarjeta anterior ←' : 'Previous card ←',
            hint: es
                ? 'Toca la flecha izquierda o pulsa ← en el teclado para volver a la tarjeta anterior.'
                : 'Tap the left arrow or press ← on your keyboard to go to the previous card.',
            fallback: es
                ? 'Así retrocedes palabra por palabra dentro del bloque. Atajo de teclado: ←'
                : 'This is how you move back word by word in the block. Keyboard shortcut: ←',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: () => true,
        },
        {
            id: 'indicador-tarjetas',
            selector: '[data-tour="boton-contador-tarjetas"]',
            advanceWithoutAction: true,
            tooltipPlacement: 'top',
            label: es ? 'Indicador de progreso' : 'Progress indicator',
            hint: es
                ? 'Este contador muestra en qué tarjeta vas dentro del bloque actual (por ejemplo, 1 / 20).'
                : 'This counter shows which card you are on in the current block (for example, 1 / 20).',
            fallback: es
                ? 'Úsalo para orientarte mientras practicas el bloque.'
                : 'Use it to track your position while practicing the block.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: () => true,
        },
        {
            id: 'boton-marcar-aprendida',
            selector: '[data-tour="boton-marcar-aprendida"]',
            performAction: 'markLearned',
            tooltipPlacement: 'top',
            label: es ? 'Marcar aprendida ✓' : 'Mark learned ✓',
            hint: es
                ? 'Cuando domines la palabra, toca el botón de check ✓.'
                : 'When you know the word, tap the check ✓ button.',
            fallback: es
                ? 'El botón de check registra que ya aprendiste esta palabra. Solo con clic o toque; sin atajo de teclado.'
                : 'The check button records that you learned this word. Click or tap only; no keyboard shortcut.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: () => true,
        },
        {
            id: 'boton-siguiente-tarjeta',
            selector: '[data-tour="boton-siguiente-tarjeta"]',
            advanceWithoutAction: true,
            acceptKeyboard: true,
            keyboardKeys: ['ArrowRight'],
            tooltipPlacement: 'top',
            label: es ? 'Siguiente tarjeta →' : 'Next card →',
            hint: es
                ? 'Toca la flecha derecha o pulsa → en el teclado para pasar a la siguiente palabra.'
                : 'Tap the right arrow or press → on your keyboard to go to the next word.',
            fallback: es
                ? 'Así avanzas palabra por palabra en el bloque. Atajo de teclado: →'
                : 'This is how you move word by word through the block. Keyboard shortcut: →',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: () => true,
        },
        {
            id: 'boton-reiniciar-bloque',
            selector: '[data-tour="boton-reiniciar-bloque"]',
            advanceWithoutAction: true,
            tooltipPlacement: 'top',
            label: es ? 'Reiniciar mazo' : 'Reset deck',
            hint: es
                ? 'Este botón reinicia el mazo que estás estudiando sin cambiar de tópico.'
                : 'This button resets the deck you are studying without changing topic.',
            fallback: es
                ? 'Vuelves al inicio del mismo mazo y tópico. Solo con clic o toque; sin atajo de teclado.'
                : 'You return to the start of the same deck and topic. Click or tap only; no keyboard shortcut.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: () => true,
        },
    ];
};

export const ONBOARDING_NAV_PLAN = {
    es: {
        coach: 'Guía interactiva · Fluency',
        routeLabel: 'Paso',
        back: 'Atrás',
        finish: 'Comenzar a aprender',
        close: 'Cerrar',
        hint: 'Siguiente',
        next: 'Siguiente',
        waiting: 'Esperando a que aparezca este componente en pantalla…',
        elementMissing: 'Este elemento aún no está en pantalla. Pulsa Siguiente cuando esté listo o toca la opción marcada.',
        wrongTap: 'Toca la opción resaltada para continuar con el recorrido.',
        tapRequired: 'Toca la opción resaltada para avanzar. El botón Siguiente no aplica en este paso.',
        stateTimeout: 'La pantalla no cambió como esperábamos. Intenta tocar de nuevo la opción marcada.',
        finalTitle: '¡Recorrido completado!',
        finalBody: 'Terminaste la guía con éxito. Ya puedes comenzar a practicar.',
        steps: buildSteps('es'),
    },
    en: {
        coach: 'Interactive Guide · Fluency',
        routeLabel: 'Step',
        back: 'Back',
        finish: 'Start learning',
        close: 'Close',
        hint: 'Next',
        next: 'Next',
        waiting: 'Waiting for this component to appear on screen…',
        elementMissing: 'This element is not on screen yet. Press Next when ready or tap the marked option.',
        wrongTap: 'Tap the highlighted option to continue the tour.',
        tapRequired: 'Tap the highlighted option to continue. The Next button does not apply on this step.',
        stateTimeout: 'The screen did not change as expected. Try tapping a marked option again.',
        finalTitle: 'Tour complete!',
        finalBody: 'You finished the guide successfully. You can start practicing now.',
        steps: buildSteps('en'),
    },
};

export function applyStepPrep(step, { setIsSidebarOpen, setIsFloatingMenuOpen, setIsCatalogVisible }) {
    if (!step?.prep) return;
    setIsSidebarOpen(Boolean(step.prep.sidebar));
    setIsFloatingMenuOpen(Boolean(step.prep.floatingMenu));
    setIsCatalogVisible(Boolean(step.prep.catalog));
}
