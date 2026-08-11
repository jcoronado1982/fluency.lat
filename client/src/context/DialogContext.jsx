import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from 'react';
import FluencyDialog from '../components/common/FluencyDialog/FluencyDialog';
import { useUIContext } from './UIContext';

const DialogContext = createContext(null);

const COPY = {
    es: { accept: 'Aceptar', cancel: 'Cancelar', confirm: 'Confirmar' },
    en: { accept: 'OK',      cancel: 'Cancel',   confirm: 'Confirm'  },
};

export const DialogProvider = ({ children }) => {
    const { language = 'en' } = useUIContext();
    const labels = COPY[language === 'es' ? 'es' : 'en'];
    const [dialog, setDialog] = useState(null);
    const resolverRef = useRef(null);

    const settle = useCallback((result) => {
        setDialog(null);
        const resolve = resolverRef.current;
        resolverRef.current = null;
        resolve?.(result);
    }, []);

    const alert = useCallback((options = {}) => new Promise((resolve) => {
        resolverRef.current = () => resolve(undefined);
        setDialog({
            type: 'alert',
            title: options.title ?? '',
            message: options.message ?? '',
            confirmLabel: options.confirmLabel ?? labels.accept,
            tone: options.tone ?? 'default',
        });
    }), [labels.accept]);

    const confirm = useCallback((options = {}) => new Promise((resolve) => {
        resolverRef.current = resolve;
        setDialog({
            type: 'confirm',
            title: options.title ?? '',
            message: options.message ?? '',
            confirmLabel: options.confirmLabel ?? labels.confirm,
            cancelLabel: options.cancelLabel ?? labels.cancel,
            tone: options.tone ?? 'default',
        });
    }), [labels.cancel, labels.confirm]);

    const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);

    return (
        <DialogContext.Provider value={value}>
            {children}
            <FluencyDialog
                open={Boolean(dialog)}
                type={dialog?.type ?? 'alert'}
                title={dialog?.title ?? ''}
                message={dialog?.message ?? ''}
                confirmLabel={dialog?.confirmLabel ?? labels.accept}
                cancelLabel={dialog?.cancelLabel ?? labels.cancel}
                tone={dialog?.tone ?? 'default'}
                onConfirm={() => settle(dialog?.type === 'confirm' ? true : undefined)}
                onCancel={() => settle(false)}
            />
        </DialogContext.Provider>
    );
};

export const useDialog = () => {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error('useDialog must be used within DialogProvider');
    }
    return context;
};
