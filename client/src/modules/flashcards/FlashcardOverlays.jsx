import React from 'react';
import IpaModal from './features/IpaModal';
import PhonicsModal from './features/PhonicsModal';
import { useFlashcardUiContext } from './context/FlashcardUiContext';

/** Modales globales que no dependen del contexto de flashcards. CategorySelector vive en FlashcardPage (dentro de providers). */
export default function FlashcardOverlays() {
    const {
        isIpaModalOpen,
        isPhonicsModalOpen,
        setIsIpaModalOpen,
    } = useFlashcardUiContext();

    return (
        <>
            {isIpaModalOpen && <IpaModal onClose={() => setIsIpaModalOpen(false)} />}
            {isPhonicsModalOpen && <PhonicsModal />}
        </>
    );
}
