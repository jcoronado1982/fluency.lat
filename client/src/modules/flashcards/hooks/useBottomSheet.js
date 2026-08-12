import { useEffect, useRef, useState } from 'react';

/**
 * Mecánica de bottom sheet nativa (solo PWA standalone): arrastre desde la franja superior (asa)
 * con seguimiento del dedo y cierre animado deslizando hacia abajo. Fuera de standalone, cerrar
 * es instantáneo (`setIsCatalogVisible(false)` directo) — no hay gesto que capturar. Aislado de
 * `CategorySelector.jsx` porque es pura mecánica de gesto/animación, sin nada específico del
 * catálogo (SRP).
 */
export function useBottomSheet(setIsCatalogVisible) {
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

    return {
        sheetRef,
        isSheetDismissing,
        sheetMotionStyle,
        dismissSheet,
        handleSheetTouchStart,
        handleSheetTouchMove,
        handleSheetTouchEnd,
    };
}
