import { useRef, useState } from 'react';

/**
 * Reordenamiento por arrastre (HTML5 Drag & Drop) genérico. Reemplaza 3 copias casi idénticas que
 * antes vivían inline en `CategorySelector.jsx` (categorías del sidebar, mazos anidados, grupos).
 * Cada instancia queda scopeada a UNA lista — antes las 3 compartían un único `dragStateRef` con
 * un campo `type` para no interferir entre sí; acá ni hace falta: al ser estado LOCAL de cada
 * instancia del hook, arrastrar un ítem de una lista nunca puede "verse" desde el `onDragOver`/
 * `onDrop` de otra lista (su `dragIdRef` propio nunca se pobló).
 *
 * @param {object} options
 * @param {string[]} options.items - ids en el orden actual visible; se usa para resolver índices al soltar.
 * @param {(fromIndex: number, toIndex: number) => void} options.onReorder
 * @param {string} [options.logLabel] - prefijo de los console.log de depuración (paridad con el comportamiento previo).
 */
export function useDragReorder({ items, onReorder, logLabel = 'DragReorder' }) {
    const dragIdRef = useRef(null);
    const [draggingId, setDraggingId] = useState(null);

    const getDragHandlers = (id, { disabled = false } = {}) => ({
        draggable: !disabled,
        onDragStart: (event) => {
            if (disabled) return;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', id);
            dragIdRef.current = id;
            setDraggingId(id);
        },
        onDragOver: (event) => {
            if (disabled || dragIdRef.current == null) return;
            event.preventDefault();
        },
        onDrop: (event) => {
            event.preventDefault();
            if (disabled || dragIdRef.current == null) return;
            const sourceId = dragIdRef.current;
            if (sourceId && sourceId !== id) {
                const fromIndex = items.indexOf(sourceId);
                const toIndex = items.indexOf(id);
                if (fromIndex !== -1 && toIndex !== -1) {
                    console.log(`[${logLabel}] 🔄 Reordenando "${sourceId}" de índice ${fromIndex} a ${toIndex} (sobre "${id}")`);
                    onReorder(fromIndex, toIndex);
                }
            }
        },
        onDragEnd: () => {
            dragIdRef.current = null;
            setDraggingId(null);
        },
    });

    return { draggingId, getDragHandlers };
}
