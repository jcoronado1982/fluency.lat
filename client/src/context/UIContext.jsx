import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
    getInitialInterfaceLanguage,
    getInitialStudyLanguage,
    normalizeStudyLanguage,
    persistInterfaceLanguage,
    persistStudyLanguage,
} from '../utils/browserLanguage';

// Estado de UI global del shell (sin estado de módulos de negocio)
const UIContext = createContext();

export const UIProvider = ({ children, preferredStudyLanguage = null }) => {
    const [appMessageState, setAppMessageState] = useState({ text: '', isError: false });

    const setAppMessage = useCallback((msg) => {
        if (msg?.isError) {
            console.error(`[App Error]: ${msg.text}`);
        }
        setAppMessageState(msg);
    }, []);

    const appMessage = appMessageState;
    const [language, setLanguageState] = useState(() => getInitialInterfaceLanguage());
    const [studyLanguageState, setStudyLanguageState] = useState(() => getInitialStudyLanguage());
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isFloatingMenuOpen, setIsFloatingMenuOpen] = useState(false);
    const [isHeaderManualOpen] = useState(true);
    const [isHeaderSuppressed, setIsHeaderSuppressed] = useState(false);

    const setLanguage = useCallback((nextLanguage) => {
        const normalized = nextLanguage === 'es' ? 'es' : 'en';
        setLanguageState(normalized);
        persistInterfaceLanguage(normalized);
    }, []);

    const setStudyLanguage = useCallback((nextLanguage) => {
        const normalized = normalizeStudyLanguage(nextLanguage);
        setStudyLanguageState(normalized);
        persistStudyLanguage(normalized);
    }, []);

    useEffect(() => {
        if (preferredStudyLanguage !== 'en' && preferredStudyLanguage !== 'es' && preferredStudyLanguage !== 'de') return;
        setStudyLanguageState(preferredStudyLanguage);
        persistStudyLanguage(preferredStudyLanguage);
    }, [preferredStudyLanguage]);

    return (
        <UIContext.Provider value={{
            appMessage, setAppMessage,
            language, setLanguage,
            studyLanguage: studyLanguageState,
            setStudyLanguage,
            isSidebarOpen, setIsSidebarOpen,
            isFloatingMenuOpen, setIsFloatingMenuOpen,
            isHeaderManualOpen,
            isHeaderSuppressed, setIsHeaderSuppressed,
        }}>
            {children}
        </UIContext.Provider>
    );
};

export const useUIContext = () => useContext(UIContext);
