import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './FluencyDialog.module.css';

export default function FluencyDialog({
    open,
    type = 'alert',
    title,
    message,
    confirmLabel,
    cancelLabel,
    tone = 'default',
    onConfirm,
    onCancel,
}) {
    const confirmRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        requestAnimationFrame(() => {
            confirmRef.current?.focus();
        });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                if (type === 'confirm') onCancel?.();
                else onConfirm?.();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, type, onCancel, onConfirm]);

    if (!open) return null;

    const isDanger = tone === 'danger';

    return createPortal(
        <div
            className={styles.overlay}
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    if (type === 'confirm') onCancel?.();
                    else onConfirm?.();
                }
            }}
        >
            <div
                className={styles.card}
                role={type === 'confirm' ? 'alertdialog' : 'dialog'}
                aria-modal="true"
                aria-labelledby="fluency-dialog-title"
                aria-describedby={message ? 'fluency-dialog-message' : undefined}
            >
                <div className={`${styles.accentBar} ${isDanger ? '' : styles.accentBarDefault}`} />

                <div className={styles.body}>
                    <h2 id="fluency-dialog-title" className={styles.title}>
                        {title}
                    </h2>
                    {message && (
                        <p id="fluency-dialog-message" className={styles.message}>
                            {message}
                        </p>
                    )}
                </div>

                <div className={styles.actions}>
                    {type === 'confirm' && (
                        <button
                            type="button"
                            className={`${styles.button} ${styles.buttonCancel}`}
                            onClick={onCancel}
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        ref={confirmRef}
                        type="button"
                        className={`${styles.button} ${isDanger ? styles.buttonDanger : styles.buttonConfirm}`}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
