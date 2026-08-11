import React, { useState, useCallback, useContext } from 'react';
import { FlashcardUiContext as StudyFlashcardUiContext } from '../../../components/flashcardStudy/context/flashcardStudyContext';

export const FlashcardUiContext = StudyFlashcardUiContext;

export const FlashcardUiProvider = ({ children }) => {
    const [isCatalogVisible, setIsCatalogVisible] = useState(false);
    const [isIpaModalOpen, setIsIpaModalOpen] = useState(false);
    const [isPhonicsModalOpen, setIsPhonicsModalOpen] = useState(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isImageLoading, setIsImageLoading] = useState(true);

    const openCatalog = useCallback(() => setIsCatalogVisible(true), []);
    const openIpa = useCallback(() => setIsIpaModalOpen(true), []);
    const openPhonics = useCallback(() => setIsPhonicsModalOpen(true), []);

    return (
        <FlashcardUiContext.Provider value={{
            isCatalogVisible, setIsCatalogVisible,
            isIpaModalOpen, setIsIpaModalOpen,
            isPhonicsModalOpen, setIsPhonicsModalOpen,
            isAudioLoading, setIsAudioLoading,
            isImageLoading, setIsImageLoading,
            openCatalog, openIpa, openPhonics,
        }}>
            {children}
        </FlashcardUiContext.Provider>
    );
};

export const useFlashcardUiContext = () => useContext(FlashcardUiContext);
