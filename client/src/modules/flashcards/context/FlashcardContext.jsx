import React, { useContext } from 'react';
import { FlashcardContext as StudyFlashcardContext } from '../../../components/flashcardStudy/context/flashcardStudyContext';
import { useDeckSession } from '../hooks/useDeckSession';
import { useSrsDeckSession } from '../hooks/useSrsDeckSession';

export const FlashcardContext = StudyFlashcardContext;
export const useFlashcardContext = () => useContext(FlashcardContext);

const FreeStudyProvider = ({ children, resumeSession }) => {
    const value = useDeckSession(resumeSession);
    return <FlashcardContext.Provider value={value}>{children}</FlashcardContext.Provider>;
};

const SrsStudyProvider = ({ children }) => {
    const value = useSrsDeckSession();
    return <FlashcardContext.Provider value={value}>{children}</FlashcardContext.Provider>;
};

export const FlashcardProvider = ({ children, resumeSession = null, mode = 'free' }) => (
    mode === 'srs'
        ? <SrsStudyProvider>{children}</SrsStudyProvider>
        : <FreeStudyProvider resumeSession={resumeSession}>{children}</FreeStudyProvider>
);
