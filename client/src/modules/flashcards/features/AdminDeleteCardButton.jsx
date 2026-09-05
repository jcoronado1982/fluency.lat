import React, { useCallback, useState } from 'react';
import { LuTrash2 } from 'react-icons/lu';
import { useDialog } from '../../../context/DialogContext';
import styles from './AdminDeleteCardButton.module.css';

/**
 * Botón de curaduría del admin: elimina del catálogo GENERAL la tarjeta que se está viendo
 * (no es "ocultarla en mi perfil" — deja de existir para todos los usuarios de esa dirección
 * de curso). Vive FUERA de la tarjeta a propósito: el kit compartido `components/flashcardStudy`
 * lo renderiza también la demo pública del landing, y esta acción no puede existir ahí.
 */
const COPY = {
    es: {
        label: 'Eliminar tarjeta del catálogo',
        short: 'Eliminar tarjeta',
        title: '¿Eliminar esta tarjeta del catálogo?',
        confirm: 'Eliminar',
        cancel: 'Cancelar',
        message: (word) => `«${word}» dejará de aparecer para todos los usuarios en esta dirección de curso. `
            + 'El progreso y las imágenes de las demás tarjetas del mazo no se tocan.',
    },
    en: {
        label: 'Delete card from the catalog',
        short: 'Delete card',
        title: 'Delete this card from the catalog?',
        confirm: 'Delete',
        cancel: 'Cancel',
        message: (word) => `“${word}” will stop appearing for every user in this course direction. `
            + 'Progress and images of the other cards in the deck are left untouched.',
    },
};

export default function AdminDeleteCardButton({ word, language = 'en', onConfirmDelete }) {
    const { confirm } = useDialog();
    const [isDeleting, setIsDeleting] = useState(false);
    const t = COPY[language === 'es' ? 'es' : 'en'];

    const handleClick = useCallback(async () => {
        if (isDeleting) return;
        const confirmed = await confirm({
            title: t.title,
            message: t.message(word || '—'),
            confirmLabel: t.confirm,
            cancelLabel: t.cancel,
            tone: 'danger',
        });
        if (!confirmed) return;

        setIsDeleting(true);
        try {
            await onConfirmDelete();
        } finally {
            // El componente puede desmontarse si el mazo quedó vacío; React 19 ignora el set
            // sobre un componente desmontado, así que no hace falta un ref de "montado".
            setIsDeleting(false);
        }
    }, [confirm, isDeleting, onConfirmDelete, t, word]);

    return (
        <div className={styles.adminCardTools}>
            <button
                type="button"
                className={styles.deleteButton}
                onClick={handleClick}
                disabled={isDeleting}
                aria-label={t.label}
                title={t.label}
                data-testid="admin-delete-card"
            >
                <LuTrash2 aria-hidden="true" />
                <span className={styles.buttonLabel}>{t.short}</span>
            </button>
        </div>
    );
}
