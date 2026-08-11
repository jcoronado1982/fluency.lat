import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUIContext } from '../../context/UIContext';
import { useFlashcardUiContext } from './context/FlashcardUiContext';
import {
    applyStepPrep,
    ONBOARDING_NAV_PLAN,
} from './config/onboardingNavigationPlan';
import {
    isCatalogOpen,
    isFlashcardsModuleReady,
    measureTourTarget,
    queryTourTarget,
    waitForCondition,
} from './config/onboardingUiAutomation';
import { computeTooltipLayout, TOOLTIP_VISUAL_GAP, boxGapForPlacement } from './config/computeTooltipLayout';
import { invokeUiBridge } from './uiBridge';
import { preloadFlashcardStart } from './preload';
import styles from './FlashcardOnboardingTour.module.css';

const TOOLTIP_WIDTH = 340;
const TOOLTIP_WIDTH_MOBILE = 292;
const TOOLTIP_ESTIMATED_HEIGHT = 220;
const TOOLTIP_ESTIMATED_HEIGHT_MOBILE = 168;
const HIGHLIGHT_PADDING = 8;
const HIGHLIGHT_PADDING_MOBILE = 6;

const readViewportInsets = (viewportWidth) => {
    if (typeof window === 'undefined') {
        return { top: 0, right: 0, bottom: 0, left: 0, edge: 8 };
    }

    const probe = document.createElement('div');
    probe.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        'visibility:hidden',
        'pointer-events:none',
    ].join(';');
    document.body.appendChild(probe);
    const style = window.getComputedStyle(probe);
    const top = Number.parseFloat(style.paddingTop) || 0;
    const right = Number.parseFloat(style.paddingRight) || 0;
    const bottom = Number.parseFloat(style.paddingBottom) || 0;
    const left = Number.parseFloat(style.paddingLeft) || 0;
    probe.remove();

    const edge = viewportWidth <= 520 ? 12 : viewportWidth <= 768 ? 10 : 6;
    return { top, right, bottom, left, edge };
};

const getTooltipMetrics = (viewportWidth) => ({
    width: viewportWidth <= 520 ? TOOLTIP_WIDTH_MOBILE : TOOLTIP_WIDTH,
    height: viewportWidth <= 520 ? TOOLTIP_ESTIMATED_HEIGHT_MOBILE : TOOLTIP_ESTIMATED_HEIGHT,
});

const isSidebarTourStep = (step) => Boolean(
    step?.prep?.sidebar || step?.id === 'cargar-modulo-flashcards',
);

const isFloatingMenuTourStep = (step) => Boolean(step?.prep?.floatingMenu);

const isCatalogCategoryTourStep = (step) => step?.id === 'elegir-categoria';

const resolveTooltipPlacements = (step, viewport, anchorRect) => {
    const configured = step?.tooltipPlacements
        ?? (step?.tooltipPlacement ? [step.tooltipPlacement] : undefined);

    if (!anchorRect || viewport.width > 768) {
        return configured;
    }

    if (isFloatingMenuTourStep(step)) {
        const tail = (configured || []).filter((placement) => placement !== 'left' && placement !== 'right');
        return ['bottom', 'top', ...tail];
    }

    const inSidebarZone = anchorRect.right <= Math.min(280, viewport.width * 0.72);

    if (inSidebarZone || isSidebarTourStep(step)) {
        const tail = (configured || []).filter((placement) => placement !== 'right' && placement !== 'left');
        return ['bottom', 'top', ...tail];
    }

    return configured;
};

const shouldUseMobileSheet = (step, viewport, anchorRect) => {
    if (viewport.width > 768 || !anchorRect) return false;

    if (isFloatingMenuTourStep(step)) return true;

    if (isCatalogCategoryTourStep(step)) return true;

    return isSidebarTourStep(step)
        && anchorRect.right <= Math.min(300, viewport.width * 0.75);
};

const tooltipOverlapsAnchor = (layout, anchorRect, tooltipWidth, tooltipHeight) => {
    if (!layout || !anchorRect) return false;

    const top = layout.top;
    const left = layout.left;
    if (typeof top !== 'number' || typeof left !== 'number') return false;

    const gap = 10;
    const tooltipRect = {
        top,
        left,
        right: left + tooltipWidth,
        bottom: top + tooltipHeight,
    };

    return !(
        tooltipRect.right <= anchorRect.left - gap
        || tooltipRect.left >= anchorRect.right + gap
        || tooltipRect.bottom <= anchorRect.top - gap
        || tooltipRect.top >= anchorRect.bottom + gap
    );
};

const buildMobileSheetLayout = (viewport, layoutMargin = 14) => {
    const insets = readViewportInsets(viewport.width);
    const bottomOffset = layoutMargin + insets.bottom;
    return {
        style: {
            top: 'auto',
            left: insets.left + layoutMargin,
            bottom: bottomOffset,
            width: `calc(100vw - ${insets.left + insets.right + layoutMargin * 2}px)`,
            transform: 'none',
            '--arrow-x': '50%',
        },
        placement: null,
        arrowOffset: 0,
        mobileSheet: true,
    };
};

const MOBILE_SHEET_RESERVE_PX = 210;

const scrollSidebarTourTarget = (target, viewport) => {
    if (!(target instanceof Element) || viewport.width > 768) {
        target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        return;
    }

    const categoryPanel = target.closest('[data-tour="panel-categorias"]');
    const categoryScroller = categoryPanel?.querySelector('[data-tour="categoria-item"]')?.parentElement;
    if (categoryScroller instanceof HTMLElement && categoryScroller.contains(target)) {
        const scrollerRect = categoryScroller.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const visibleBottom = Math.min(scrollerRect.bottom, viewport.height - MOBILE_SHEET_RESERVE_PX - 12);
        const desiredTop = Math.min(
            targetRect.top,
            visibleBottom - targetRect.height,
        );
        const delta = targetRect.top - Math.max(scrollerRect.top + 8, desiredTop);
        if (Math.abs(delta) > 6) {
            categoryScroller.scrollTop += delta;
        }
        return;
    }

    const sidebarNav = target.closest('.app-sidebar nav');
    if (sidebarNav instanceof HTMLElement) {
        const navRect = sidebarNav.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const idealTop = Math.min(
            navRect.top + 20,
            viewport.height - MOBILE_SHEET_RESERVE_PX - targetRect.height - 16,
        );
        const delta = targetRect.top - idealTop;
        if (Math.abs(delta) > 6) {
            sidebarNav.scrollTop += delta;
        }
        return;
    }

    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
};
const SIDEBAR_TRANSITION_MS = 420;
const CONTROLS_TRANSITION_MS = 320;
const WRONG_TAP_COOLDOWN_MS = 2200;
const GATE_TIMEOUT_MS = 5000;
const NAV_TAP_ADVANCE_DELAY_MS = 180;
const KEYBOARD_ADVANCE_DELAY_MS = 160;

const getTourTargetMeasureOptions = (step) => ({
    compactHighlight: step?.compactHighlight,
    requireStableRect: Boolean(step?.requireStableTargetRect),
    requireVisible: Boolean(step?.requireVisibleTarget),
    requirePhraseRevealed: Boolean(step?.waitForPhraseRevealed),
});

const measureStepTarget = (selector, step) => {
    if (!selector) return { target: null, rect: null };
    return measureTourTarget(selector, getTourTargetMeasureOptions(step));
};

const UI_BRIDGE_ACTIONS = new Set([
    'nextCard',
    'prevCard',
    'markLearned',
    'resetDeck',
    'flipCard',
]);

const CONTROL_STEP_IDS = new Set([
    'boton-voltear-tarjeta',
    'boton-anterior-tarjeta',
    'indicador-tarjetas',
    'boton-marcar-aprendida',
    'boton-siguiente-tarjeta',
    'boton-reiniciar-bloque',
]);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function FlashcardOnboardingTour() {
    const { language = 'en', setIsSidebarOpen, setIsFloatingMenuOpen } = useUIContext();
    const { completeOnboarding, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { setIsCatalogVisible } = useFlashcardUiContext();
    const isOnboardingTour = new URLSearchParams(location.search).get('onboarding_tour') === 'flashcards';
    const { studyLanguage = 'en' } = useUIContext();
    const locale = language === 'es' ? 'es' : 'en';
    const copy = ONBOARDING_NAV_PLAN[locale];

    const [stepIndex, setStepIndex] = useState(0);
    const [stepFeedback, setStepFeedback] = useState('enter');
    const [targetRect, setTargetRect] = useState(null);
    const [targetMissing, setTargetMissing] = useState(false);
    const [isAdvancing, setIsAdvancing] = useState(false);
    const [isAssistantPaused, setIsAssistantPaused] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const [, setPositionVersion] = useState(0);
    const tooltipRef = useRef(null);
    const wrongTapCooldownRef = useRef(0);
    const stepIndexRef = useRef(0);
    const navGenerationRef = useRef(0);
    const navBusyRef = useRef(false);
    const pendingTimersRef = useRef(new Set());

    const clearPendingTimers = useCallback(() => {
        pendingTimersRef.current.forEach((timerId) => {
            window.clearTimeout(timerId);
        });
        pendingTimersRef.current.clear();
    }, []);

    const scheduleTourTask = useCallback((task, delay = 0) => {
        const generation = navGenerationRef.current;
        const timerId = window.setTimeout(() => {
            pendingTimersRef.current.delete(timerId);
            if (navGenerationRef.current !== generation) return;
            task();
        }, delay);
        pendingTimersRef.current.add(timerId);
        return timerId;
    }, []);

    const invalidatePendingNavigation = useCallback(() => {
        navGenerationRef.current += 1;
        clearPendingTimers();
    }, [clearPendingTimers]);

    const commitStepIndex = useCallback((nextIndex, { navigationLock = false } = {}) => {
        const clamped = clamp(nextIndex, 0, copy.steps.length);
        if (clamped === stepIndexRef.current) return false;

        invalidatePendingNavigation();
        setIsAssistantPaused(false);
        stepIndexRef.current = clamped;
        setIsAdvancing(false);
        setStepFeedback('enter');
        setTargetMissing(false);
        setStepIndex(clamped);

        if (navigationLock) {
            navBusyRef.current = true;
            window.setTimeout(() => {
                navBusyRef.current = false;
            }, 320);
        }

        return true;
    }, [copy.steps.length, invalidatePendingNavigation]);

    useEffect(() => {
        stepIndexRef.current = stepIndex;
        setTargetRect(null);
        setTargetMissing(false);
    }, [stepIndex]);

    useEffect(() => () => clearPendingTimers(), [clearPendingTimers]);

    useEffect(() => {
        if (!isOnboardingTour || !user?.email) return undefined;
        void preloadFlashcardStart(user.email, null, studyLanguage);
        return undefined;
    }, [isOnboardingTour, studyLanguage, user?.email]);

    const [viewport, setViewport] = useState({
        width: typeof window === 'undefined' ? 1280 : window.innerWidth,
        height: typeof window === 'undefined' ? 720 : window.innerHeight,
    });

    const isFinalStep = isOnboardingTour && stepIndex >= copy.steps.length;
    const activeStep = isOnboardingTour && !isFinalStep ? copy.steps[stepIndex] : null;
    const finalSyncStartedRef = useRef(false);
    const isZoneStep = activeStep?.highlightMode === 'zone';
    const stepCounterText = isFinalStep
        ? `${copy.steps.length} / ${copy.steps.length}`
        : `${stepIndex + 1} / ${copy.steps.length}`;
    const bodyText = useMemo(() => {
        if (isFinalStep) return copy.finalBody;
        if (targetMissing) return copy.elementMissing;
        if (stepFeedback === 'wrong_tap') return copy.wrongTap;
        if (stepFeedback === 'gate_timeout') return copy.stateTimeout;
        if (stepFeedback === 'tap_required') return copy.tapRequired;
        return activeStep?.hint || activeStep?.fallback || '';
    }, [activeStep, copy, isFinalStep, stepFeedback, targetMissing]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const frameId = window.requestAnimationFrame(() => {
            setPositionVersion((current) => current + 1);
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [bodyText, targetMissing]);

    useEffect(() => {
        const el = tooltipRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => {
            setPositionVersion((v) => v + 1);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [isAssistantPaused]);

    useEffect(() => {
        if (!isOnboardingTour) return undefined;
        if (!activeStep) {
            setIsCatalogVisible(false);
            setIsSidebarOpen(false);
            setIsFloatingMenuOpen(false);
            return;
        }

        applyStepPrep(activeStep, {
            setIsSidebarOpen,
            setIsFloatingMenuOpen,
            setIsCatalogVisible,
        });
    }, [activeStep, isOnboardingTour, setIsCatalogVisible, setIsFloatingMenuOpen, setIsSidebarOpen]);

    useEffect(() => {
        if (!isOnboardingTour || !activeStep?.enterAction) return undefined;
        invokeUiBridge(activeStep.enterAction);
    }, [activeStep?.enterAction, activeStep?.id, isOnboardingTour]);

    useEffect(() => {
        if (!isAssistantPaused) return undefined;

        document.querySelectorAll('[data-tour-active], [data-tour-zone-active], [data-tour-marked], [data-tour-section-active]').forEach((node) => {
            node.removeAttribute('data-tour-active');
            node.removeAttribute('data-tour-zone-active');
            node.removeAttribute('data-tour-marked');
            node.removeAttribute('data-tour-section-active');
        });
    }, [isAssistantPaused]);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;

        document.querySelectorAll('[data-tour-marked]').forEach((node) => {
            node.removeAttribute('data-tour-marked');
        });
        document.querySelectorAll('[data-tour-zone-active]').forEach((node) => {
            node.removeAttribute('data-tour-zone-active');
        });
        document.querySelectorAll('[data-tour-section-active]').forEach((node) => {
            node.removeAttribute('data-tour-section-active');
        });

        if (isAssistantPaused) return undefined;

        if (activeStep?.waitForTarget) {
            const { target } = measureStepTarget(activeStep.selector, activeStep);
            if (!target) return undefined;
        }

        if (activeStep?.sectionSelector) {
            const section = document.querySelector(activeStep.sectionSelector);
            section?.setAttribute('data-tour-section-active', 'true');
        }

        if (!activeStep?.markOptionsSelector) return undefined;

        document.querySelectorAll(activeStep.markOptionsSelector).forEach((node) => {
            node.setAttribute('data-tour-marked', 'true');
        });

        return () => {
            document.querySelectorAll('[data-tour-marked]').forEach((node) => {
                node.removeAttribute('data-tour-marked');
            });
            document.querySelectorAll('[data-tour-section-active]').forEach((node) => {
                node.removeAttribute('data-tour-section-active');
            });
        };
    }, [activeStep, isAssistantPaused, stepIndex, targetRect]);

    useEffect(() => {
        if (typeof window === 'undefined' || isAssistantPaused) return undefined;

        const updateViewport = () => {
            setViewport({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };

        updateViewport();
        window.addEventListener('resize', updateViewport);
        return () => window.removeEventListener('resize', updateViewport);
    }, [isAssistantPaused]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        let frameId = 0;
        let attempts = 0;
        let activeTarget = null;
        let transitionTimer = 0;

        const syncRect = () => {
            if (!activeStep) {
                setTargetRect(null);
                setTargetMissing(false);
                return;
            }

            const highlightSelector = activeStep.zoneSelector || activeStep.selector;
            const { target, rect } = measureStepTarget(highlightSelector, activeStep);
            if (target && rect) {
                if (activeTarget !== target) {
                    activeTarget?.removeAttribute('data-tour-active');
                    activeTarget?.removeAttribute('data-tour-zone-active');
                    activeTarget = target;
                    if (isZoneStep) {
                        activeTarget.setAttribute('data-tour-zone-active', 'true');
                    } else {
                        activeTarget.setAttribute('data-tour-active', 'true');
                    }
                    if (!isZoneStep) {
                        scrollSidebarTourTarget(target, viewport);
                    }
                }

                const sheetReserve = shouldUseMobileSheet(activeStep, viewport, rect)
                    ? MOBILE_SHEET_RESERVE_PX
                    : 0;
                const isVisible = rect.width > 0
                    && rect.height > 0
                    && rect.bottom > 0
                    && rect.right > 0
                    && rect.top < viewport.height
                    && rect.left < viewport.width
                    && rect.bottom <= viewport.height - sheetReserve;

                if (isVisible) {
                    setTargetRect(rect);
                    setTargetMissing(false);
                    return;
                }
            }

            const maxAttempts = activeStep?.maxSyncAttempts
                ?? (activeStep?.targetSyncDelayMs ? 140 : 80);

            if (attempts < maxAttempts) {
                attempts += 1;
                frameId = window.requestAnimationFrame(syncRect);
                return;
            }

            setTargetRect(null);
            setTargetMissing(true);
        };

        const delay = activeStep?.targetSyncDelayMs ?? (
            activeStep?.id === 'menu-hamburguesa'
            || activeStep?.id === 'cargar-modulo-flashcards'
            || activeStep?.id === 'catalogo-categorias'
        ) ? SIDEBAR_TRANSITION_MS
            : (CONTROL_STEP_IDS.has(activeStep?.id) ? CONTROLS_TRANSITION_MS : 100);
        transitionTimer = window.setTimeout(syncRect, delay);
        window.addEventListener('scroll', syncRect, true);
        window.addEventListener('resize', syncRect);

        return () => {
            activeTarget?.removeAttribute('data-tour-active');
            activeTarget?.removeAttribute('data-tour-zone-active');
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(transitionTimer);
            window.removeEventListener('scroll', syncRect, true);
            window.removeEventListener('resize', syncRect);
        };
    }, [activeStep, isAssistantPaused, isZoneStep, stepIndex, viewport]);

    useEffect(() => {
        if (typeof window === 'undefined' || activeStep?.id !== 'reproducir-audio') return undefined;

        const cardRoot = document.querySelector('[data-tour="flashcard-contenedor"]');
        if (!(cardRoot instanceof HTMLElement)) return undefined;

        const remeasurePhraseButton = () => {
            const { target, rect } = measureStepTarget(activeStep.selector, activeStep);
            if (!target || !rect) return;
            setTargetRect(rect);
            setTargetMissing(false);
            setPositionVersion((current) => current + 1);
        };

        const observer = new MutationObserver(() => {
            window.requestAnimationFrame(remeasurePhraseButton);
        });
        observer.observe(cardRoot, {
            attributes: true,
            attributeFilter: ['data-flipped', 'data-phrase-revealed'],
            subtree: true,
            childList: true,
        });
        return () => observer.disconnect();
    }, [activeStep]);

    const performTargetClick = useCallback(() => {
        if (!activeStep) return false;

        if (activeStep.performAction === 'openCatalog') {
            setIsCatalogVisible(true);
            return true;
        }

        if (activeStep.performAction === 'openSidebar') {
            setIsSidebarOpen(true);
            return true;
        }

        if (activeStep.performAction === 'navigateFlashcards') {
            const nav = queryTourTarget('[data-tour="flashcards-nav"]');
            if (nav instanceof HTMLElement) {
                nav.click();
                return true;
            }
            const target = '/flashcard?onboarding_tour=flashcards';
            if (`${location.pathname}${location.search}` !== target) {
                navigate(target);
            }
            return true;
        }

        if (activeStep.performAction && UI_BRIDGE_ACTIONS.has(activeStep.performAction)) {
            return invokeUiBridge(activeStep.performAction);
        }

        const tapSelector = activeStep.tapSelector || activeStep.selector;
        const target = queryTourTarget(tapSelector);
        if (target instanceof HTMLElement) {
            target.click();
            return true;
        }

        if (isZoneStep && activeStep.markOptionsSelector) {
            const firstOption = document.querySelector(activeStep.markOptionsSelector);
            if (firstOption instanceof HTMLElement) {
                firstOption.click();
                return true;
            }
        }

        return false;
    }, [activeStep, isZoneStep, location.pathname, location.search, navigate, setIsCatalogVisible, setIsSidebarOpen]);

    const advanceStep = useCallback(async ({ skipClick = false } = {}) => {
        if (!activeStep || isAdvancing) return;

        const generation = navGenerationRef.current;
        const fromStep = stepIndexRef.current;

        setIsAdvancing(true);
        if (!skipClick) {
            performTargetClick();
            if (
                activeStep.performAction === 'openCatalog'
                || activeStep.performAction === 'openSidebar'
                || activeStep.performAction === 'navigateFlashcards'
                || activeStep.performAction === 'flipCard'
            ) {
                await new Promise((resolve) => {
                    window.requestAnimationFrame(() => {
                        window.requestAnimationFrame(resolve);
                    });
                });
            }
        }

        if (navGenerationRef.current !== generation || stepIndexRef.current !== fromStep) {
            setIsAdvancing(false);
            return;
        }

        const gateFn = typeof activeStep.gate === 'function' ? activeStep.gate : () => true;
        const gateTimeout = activeStep.gateTimeoutMs ?? GATE_TIMEOUT_MS;
        const passed = await waitForCondition(gateFn, { timeout: gateTimeout });

        if (navGenerationRef.current !== generation || stepIndexRef.current !== fromStep) {
            setIsAdvancing(false);
            return;
        }

        if (passed) {
            if (activeStep.exitAction) {
                invokeUiBridge(activeStep.exitAction);
            }

            const exitDelay = activeStep.exitDelayMs ?? 0;
            if (exitDelay > 0) {
                setIsAssistantPaused(true);
                const exitDeadline = Date.now() + exitDelay;
                while (Date.now() < exitDeadline) {
                    if (navGenerationRef.current !== generation || stepIndexRef.current !== fromStep) {
                        setIsAssistantPaused(false);
                        setIsAdvancing(false);
                        return;
                    }
                    await new Promise((resolve) => window.setTimeout(resolve, 50));
                }
            }

            const postDelay = activeStep.postGateDelayMs ?? 0;
            if (postDelay > 0) {
                setIsAssistantPaused(true);
                const deadline = Date.now() + postDelay;
                while (Date.now() < deadline) {
                    if (navGenerationRef.current !== generation || stepIndexRef.current !== fromStep) {
                        setIsAssistantPaused(false);
                        setIsAdvancing(false);
                        return;
                    }
                    await new Promise((resolve) => window.setTimeout(resolve, 50));
                }
            }

            if (navGenerationRef.current !== generation || stepIndexRef.current !== fromStep) {
                setIsAssistantPaused(false);
                setIsAdvancing(false);
                return;
            }

            if (activeStep.exitBlurAction) {
                invokeUiBridge(activeStep.exitBlurAction);
            }

            if (postDelay > 0 || exitDelay > 0) {
                setIsAssistantPaused(false);
            }

            commitStepIndex(fromStep + 1);
            setTargetMissing(false);
        } else {
            setStepFeedback('gate_timeout');
        }
        setIsAdvancing(false);
    }, [activeStep, commitStepIndex, isAdvancing, performTargetClick]);

    useEffect(() => {
        if (activeStep?.id !== 'cargar-modulo-flashcards' || isAdvancing) return undefined;
        if (stepFeedback !== 'gate_timeout') return undefined;
        if (!isFlashcardsModuleReady()) return undefined;

        const timerId = scheduleTourTask(() => {
            advanceStep({ skipClick: true });
        }, 120);

        return () => window.clearTimeout(timerId);
    }, [activeStep, advanceStep, isAdvancing, location.pathname, scheduleTourTask, stepFeedback]);

    useEffect(() => {
        if (activeStep?.id !== 'catalogo-categorias' || isAdvancing) return undefined;
        if (stepFeedback !== 'gate_timeout') return undefined;
        if (!isCatalogOpen()) return undefined;

        const timerId = scheduleTourTask(() => {
            advanceStep({ skipClick: true });
        }, 120);

        return () => window.clearTimeout(timerId);
    }, [activeStep, advanceStep, isAdvancing, scheduleTourTask, stepFeedback]);

    const handleNext = useCallback((event) => {
        event?.stopPropagation();
        if (isAdvancing || navBusyRef.current) return;
        if (activeStep?.advanceOnTapOnly) {
            setStepFeedback('tap_required');
            return;
        }
        if (activeStep?.advanceWithoutAction) {
            advanceStep({ skipClick: true });
            return;
        }
        advanceStep({ skipClick: false });
    }, [activeStep, advanceStep, isAdvancing]);

    useEffect(() => {
        if (typeof window === 'undefined' || !activeStep?.acceptKeyboard || isAdvancing) return undefined;

        const allowedKeys = activeStep.keyboardKeys || [];
        if (!allowedKeys.length) return undefined;

        const handleKeyDown = (event) => {
            const tag = event.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
            if (tooltipRef.current?.contains(event.target)) return;
            if (!allowedKeys.includes(event.key)) return;

            scheduleTourTask(() => {
                advanceStep({ skipClick: true });
            }, KEYBOARD_ADVANCE_DELAY_MS);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeStep, advanceStep, isAdvancing, scheduleTourTask]);

    useEffect(() => {
        if (typeof window === 'undefined' || !activeStep || targetMissing) return undefined;

        const handleTap = (event) => {
            if (tooltipRef.current?.contains(event.target) || isAdvancing) return;

            const tapSelector = activeStep.tapSelector || activeStep.selector;
            const highlightSelector = activeStep.zoneSelector || activeStep.selector;
            const expected = queryTourTarget(highlightSelector);

            if (!expected && !queryTourTarget(tapSelector)) {
                setTargetMissing(true);
                return;
            }

            const tappedOption = event.target.closest(tapSelector);
            if (tappedOption && event.isTrusted) {
                if (activeStep.id === 'elegir-subtema') {
                    setIsCatalogVisible(false);
                }
                if (activeStep.advanceOnTapOnly) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (activeStep.performAction === 'openCatalog') {
                        setIsCatalogVisible(true);
                    } else if (activeStep.performAction && UI_BRIDGE_ACTIONS.has(activeStep.performAction)) {
                        invokeUiBridge(activeStep.performAction);
                    } else if (tappedOption instanceof HTMLElement) {
                        tappedOption.click();
                    }
                } else if (activeStep.performAction === 'openCatalog') {
                    setIsCatalogVisible(true);
                }
                const tapDelay = activeStep.id === 'cargar-modulo-flashcards'
                    ? NAV_TAP_ADVANCE_DELAY_MS
                    : 80;
                scheduleTourTask(() => {
                    advanceStep({ skipClick: true });
                }, tapDelay);
                return;
            }

            if (isZoneStep && event.target.closest(highlightSelector)) {
                return;
            }

            const now = Date.now();
            if (now - wrongTapCooldownRef.current < WRONG_TAP_COOLDOWN_MS) return;
            wrongTapCooldownRef.current = now;
            setStepFeedback('wrong_tap');
        };

        document.addEventListener('click', handleTap, true);
        return () => document.removeEventListener('click', handleTap, true);
    }, [activeStep, advanceStep, isAdvancing, isZoneStep, scheduleTourTask, setIsCatalogVisible, targetMissing]);

    const anchorRect = useMemo(() => {
        if (!targetRect) return null;
        if (typeof document === 'undefined') return targetRect;

        if (isZoneStep && activeStep?.sectionSelector) {
            const section = queryTourTarget(activeStep.sectionSelector);
            if (section) return section.getBoundingClientRect();
        }

        const tapSelector = activeStep?.tapSelector || activeStep?.selector;
        if (!isZoneStep && tapSelector) {
            const { rect } = measureStepTarget(tapSelector, activeStep);
            if (rect) return rect;
        }

        return targetRect;
    }, [activeStep, isZoneStep, targetRect]);

    const focusBox = useMemo(() => {
        if (!targetRect || isFinalStep) return null;

        const insets = readViewportInsets(viewport.width);
        const pad = viewport.width <= 520 ? HIGHLIGHT_PADDING_MOBILE : HIGHLIGHT_PADDING;
        const minTop = insets.top + insets.edge;
        const minLeft = insets.left + insets.edge;
        const maxRight = viewport.width - insets.right - insets.edge;
        const maxBottom = viewport.height - insets.bottom - insets.edge;

        const top = clamp(targetRect.top - pad, minTop, maxBottom);
        const left = clamp(targetRect.left - pad, minLeft, maxRight);
        const right = clamp(targetRect.right + pad, minLeft, maxRight);
        const bottom = clamp(targetRect.bottom + pad, minTop, maxBottom);

        return {
            top,
            left,
            right,
            bottom,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
        };
    }, [isFinalStep, targetRect, viewport.height, viewport.width]);

    const tooltipLayout = useMemo(() => {
        const tooltipMetrics = getTooltipMetrics(viewport.width);
        const layoutMargin = viewport.width <= 520 ? 14 : 12;
        const tooltipWidth = tooltipRef.current?.offsetWidth || tooltipMetrics.width;
        const tooltipHeight = tooltipRef.current?.offsetHeight || tooltipMetrics.height;
        const layoutAnchor = anchorRect;

        if (!layoutAnchor) {
            return {
                style: {
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    '--arrow-x': '50%',
                },
                placement: null,
                arrowOffset: 0,
                mobileSheet: false,
            };
        }

        if (shouldUseMobileSheet(activeStep, viewport, layoutAnchor)) {
            return buildMobileSheetLayout(viewport, layoutMargin);
        }

        const preferredPlacements = resolveTooltipPlacements(activeStep, viewport, layoutAnchor);

        const layout = computeTooltipLayout({
            anchorRect: layoutAnchor,
            viewport,
            tooltipWidth,
            tooltipHeight,
            gap: activeStep?.tooltipGap,
            margin: layoutMargin,
            preferredPlacements,
        });

        const fallbackLeft = clamp(
            layoutAnchor.left + layoutAnchor.width / 2 - tooltipWidth / 2,
            layoutMargin,
            viewport.width - tooltipWidth - layoutMargin,
        );
        const fallbackLayout = layout ?? {
            top: clamp(
                layoutAnchor.bottom + boxGapForPlacement('bottom', activeStep?.tooltipGap ?? TOOLTIP_VISUAL_GAP),
                layoutMargin,
                viewport.height - tooltipHeight - layoutMargin,
            ),
            left: fallbackLeft,
            placement: 'bottom',
            arrowOffset: layoutAnchor.left + layoutAnchor.width / 2 - fallbackLeft,
        };

        if (
            viewport.width <= 768
            && tooltipOverlapsAnchor(fallbackLayout, layoutAnchor, tooltipWidth, tooltipHeight)
        ) {
            return buildMobileSheetLayout(viewport, layoutMargin);
        }

        return {
            style: {
                top: fallbackLayout.top,
                left: fallbackLayout.left,
                '--arrow-x': `${fallbackLayout.arrowOffset}px`,
            },
            placement: fallbackLayout.placement,
            arrowOffset: fallbackLayout.arrowOffset,
            mobileSheet: false,
        };
    }, [
        activeStep,
        anchorRect,
        viewport,
    ]);

    // Cerrar/terminar la guía nunca debe quedarse "colgado" esperando al servidor: se oculta
    // de inmediato (isDismissed) y el `?onboarding_tour=` se retira solo si el servidor confirma
    // a tiempo. Si `completeOnboarding` falla, el usuario ya salió de la guía igual — el intento
    // de sincronizar sigue en segundo plano y, si nunca confirma, la próxima carga completa
    // vuelve a preguntar (mejor que quedar atrapado en el popup dentro de la misma sesión).
    const handleFinish = async () => {
        setIsDismissed(true);
        const completedUser = await completeOnboarding();
        if (!completedUser?.onboarding_completed) return;
        navigate(location.pathname, { replace: true });
    };

    useEffect(() => {
        if (!isOnboardingTour || !isFinalStep || finalSyncStartedRef.current) return;
        finalSyncStartedRef.current = true;
        void completeOnboarding();
    }, [completeOnboarding, isFinalStep, isOnboardingTour]);

    const handleBack = useCallback((event) => {
        event?.stopPropagation();
        event?.preventDefault();
        if (stepIndexRef.current === 0 || isAdvancing || navBusyRef.current) return;
        commitStepIndex(stepIndexRef.current - 1, { navigationLock: true });
    }, [commitStepIndex, isAdvancing]);

    // Cerrar la guía a mitad de un paso que la había forzado abierta (p.ej. `elegir-categoria`,
    // `catalogo-nivel` o `elegir-subtema`, todos con `prep.catalog: true`) no debe dejar el
    // catálogo/sidebar/menú flotante huérfanos en pantalla: el efecto de `prep` (línea ~349) solo
    // los cierra cuando `activeStep` pasa a null, y `isDismissed` oculta la guía sin tocar
    // `activeStep` — bug real reportado por usuario (ago 2026): "abro categorías, cierro la guía,
    // el catálogo se queda abierto para siempre". Se replica el mismo cierre aquí.
    const handleClose = async () => {
        setIsDismissed(true);
        setIsCatalogVisible(false);
        setIsSidebarOpen(false);
        setIsFloatingMenuOpen(false);
        const completedUser = await completeOnboarding();
        if (!completedUser?.onboarding_completed) return;
        navigate(location.pathname, { replace: true });
    };

    if (!isOnboardingTour || isAssistantPaused || isDismissed) return null;

    const shouldHoldTourForTarget = Boolean(
        activeStep?.waitForTarget && !targetRect && !targetMissing,
    );
    if (shouldHoldTourForTarget) return null;

    const tourUi = (
        <div className={styles.overlay}>
            {focusBox ? (
                <>
                    <div className={`${styles.scrimBlock} ${isZoneStep ? styles.scrimBlockZone : ''}`} style={{ top: 0, left: 0, width: '100%', height: focusBox.top }} />
                    <div className={`${styles.scrimBlock} ${isZoneStep ? styles.scrimBlockZone : ''}`} style={{ top: focusBox.bottom, left: 0, width: '100%', height: viewport.height - focusBox.bottom }} />
                    <div className={`${styles.scrimBlock} ${isZoneStep ? styles.scrimBlockZone : ''}`} style={{ top: focusBox.top, left: 0, width: focusBox.left, height: focusBox.height }} />
                    <div className={`${styles.scrimBlock} ${isZoneStep ? styles.scrimBlockZone : ''}`} style={{ top: focusBox.top, left: focusBox.right, width: viewport.width - focusBox.right, height: focusBox.height }} />
                </>
            ) : (
                <div className={styles.scrim} />
            )}
            {focusBox && (
                <div
                    className={`${styles.highlight} ${isZoneStep ? styles.highlightZone : ''}`}
                    style={{
                        top: focusBox.top,
                        left: focusBox.left,
                        width: focusBox.width,
                        height: focusBox.height,
                    }}
                />
            )}

            <section
                ref={tooltipRef}
                className={styles.tooltip}
                data-tour-step={activeStep?.id || 'final'}
                data-tour-step-index={stepIndex}
                data-placement={tooltipLayout.placement || undefined}
                data-mobile-sheet={tooltipLayout.mobileSheet ? 'true' : undefined}
                style={tooltipLayout.style}
            >
                <header className={styles.tooltipHeader}>
                    <span className={styles.stepBadge}>{stepCounterText}</span>
                    <button type="button" className={styles.closeButton} onClick={handleClose} aria-label={copy.close}>
                        <span aria-hidden="true">×</span>
                    </button>
                </header>
                <p className={styles.eyebrow}>{copy.coach}</p>
                {isFinalStep ? (
                    <h2 className={styles.title}>{copy.finalTitle}</h2>
                ) : (
                    activeStep?.label && <h2 className={styles.title}>{activeStep.label}</h2>
                )}
                <p className={styles.body}>{bodyText}</p>

                <div className={styles.actions}>
                    {stepIndex > 0 && (
                        <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={handleBack}
                            disabled={isAdvancing}
                        >
                            {copy.back}
                        </button>
                    )}
                    {!isFinalStep ? (
                        <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={handleNext}
                            disabled={isAdvancing || activeStep?.advanceOnTapOnly}
                            title={activeStep?.advanceOnTapOnly ? copy.tapRequired : undefined}
                        >
                            {copy.next}
                        </button>
                    ) : (
                        <button type="button" className={styles.primaryButton} onClick={handleFinish}>
                            {copy.finish}
                        </button>
                    )}
                </div>
            </section>
        </div>
    );

    if (typeof document === 'undefined') return tourUi;

    return createPortal(tourUi, document.body);
}
