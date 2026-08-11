import React from 'react';
import { UIProvider, useUIContext } from './UIContext';
import { DialogProvider } from './DialogContext';
import { useAuth } from './AuthContext';

export { UIProvider, useUIContext } from './UIContext';
export { useDialog } from './DialogContext';

export const useAppContext = () => useUIContext();

export const AppProvider = ({ children }) => {
    const { user } = useAuth();
    return (
        <UIProvider preferredStudyLanguage={user?.study_language}>
            <DialogProvider>
                {children}
            </DialogProvider>
        </UIProvider>
    );
};
