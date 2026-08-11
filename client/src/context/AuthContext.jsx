import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import config from '../config';
import { getPublicEntryPathForConfig, notifyAuthUserSynced, notifyAuthLogout } from '../modules';
import { authRepository } from '../repositories/AuthRepository';
import { httpClient } from '../services/httpClient';
import { usePresence } from '../hooks/usePresence';
import { shouldShowOnboarding, resolveOnboardingCompleted } from '../utils/onboardingStorage';
import { normalizeStudyLanguage } from '../utils/browserLanguage';
import {
    clearPendingPremium,
    isPendingPremiumActive,
    markPendingPremium,
} from '../utils/pendingPremiumStorage';

const AuthContext = createContext();

/** Cada cuánto se reconsulta el rol real mientras el pago está pendiente de confirmación. */
const PENDING_PREMIUM_CONFIRM_INTERVAL_MS = 15000;

function PresenceTracker() {
    usePresence();
    return null;
}

export const AuthProvider = ({ children }) => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingStage, setLoadingStage] = useState('restoring_session');
    const onboardingRequired = shouldShowOnboarding(user);

    useEffect(() => {
        const authData = authRepository.getAuthData();
        if (!authData) {
            setLoadingStage(null);
            setLoading(false);
            return;
        }

        setUser({
            ...authData.user,
            onboarding_completed: authData.user.onboarding_completed === true,
            catalog_preferences: null,
        });
        setLoadingStage('syncing_session');

        httpClient.get('/api/auth/me')
            .then((me) => {
                const onboardingCompleted = resolveOnboardingCompleted(
                    authData.user,
                    me.onboarding_completed === true,
                );
                const nextUser = {
                    ...authData.user,
                    role: me.effective_role || authData.user.role,
                    picture: me.picture || authData.user.picture || null,
                    onboarding_completed: onboardingCompleted,
                    catalog_preferences: me.catalog_preferences ?? null,
                    study_language: me.study_language ?? authData.user.study_language ?? null,
                };
                notifyAuthUserSynced(config, nextUser);
                authRepository.saveAuthData({ token: authData.token, user: nextUser });
                setUser(nextUser);

            })
            .catch((err) => console.warn('No se pudo sincronizar rol desde /api/auth/me:', err))
            .finally(() => {
                setLoadingStage(null);
                setLoading(false);
            });
    }, []);

    const login = async (idToken) => {
        const data = await authRepository.loginWithGoogle(idToken);
        if (!data.success) return data;

        authRepository.saveAuthData(data);
        setUser(data.user);

        try {
            const me = await httpClient.get('/api/auth/me');
            const syncedUser = {
                ...data.user,
                role: me.effective_role || data.user.role,
                picture: me.picture || data.user.picture || null,
                onboarding_completed: resolveOnboardingCompleted(
                    data.user,
                    me.onboarding_completed === true,
                ),
                catalog_preferences: me.catalog_preferences ?? null,
                study_language: me.study_language ?? data.user.study_language ?? null,
            };
            notifyAuthUserSynced(config, syncedUser);
            const next = { ...data, user: syncedUser };
            authRepository.saveAuthData(next);
            setUser(syncedUser);
            return next;
        } catch (err) {
            console.warn('No se pudo sincronizar onboarding desde /api/auth/me:', err);
            return data;
        }
    };

    const loginWithApple = async (idToken, name) => {
        const data = await authRepository.loginWithApple(idToken, name);
        if (!data.success) return data;

        authRepository.saveAuthData(data);
        setUser(data.user);

        try {
            const me = await httpClient.get('/api/auth/me');
            const syncedUser = {
                ...data.user,
                role: me.effective_role || data.user.role,
                picture: me.picture || data.user.picture || null,
                onboarding_completed: resolveOnboardingCompleted(
                    data.user,
                    me.onboarding_completed === true,
                ),
                catalog_preferences: me.catalog_preferences ?? null,
                study_language: me.study_language ?? data.user.study_language ?? null,
            };
            notifyAuthUserSynced(config, syncedUser);
            const next = { ...data, user: syncedUser };
            authRepository.saveAuthData(next);
            setUser(syncedUser);
            return next;
        } catch (err) {
            console.warn('No se pudo sincronizar onboarding desde /api/auth/me:', err);
            return data;
        }
    };

    const loginAsGuest = async () => {
        if (!import.meta.env.DEV) {
            console.warn('Guest login is only available in development mode.');
            return;
        }
        try {
            const data = await authRepository.loginAsDevGuest();
            if (data.success) {
                const guestData = {
                    ...data,
                    user: { ...data.user, catalog_preferences: null },
                };
                notifyAuthUserSynced(config, guestData.user);
                authRepository.saveAuthData(guestData);
                setUser(guestData.user);
            }
            return data;
        } catch (err) {
            console.error('Dev guest login failed:', err);
            return null;
        }
    };

    const logout = () => {
        httpClient.post('/api/presence/leave', {}).catch(() => {});
        authRepository.logout();   // borra token + todo lo de ámbito de sesión (premium optimista incluido)
        setPendingPremium(false);
        notifyAuthLogout(config);
        setUser(null);
        navigate(getPublicEntryPathForConfig(config), { replace: true });
    };

    const completeOnboarding = async () => {
        if (!user?.email) return null;

        const authData = authRepository.getAuthData();

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                await httpClient.post('/api/auth/onboarding', { completed: true });
                const me = await httpClient.get('/api/auth/me');
                const syncedUser = {
                    ...user,
                    role: me.effective_role || user.role,
                    picture: me.picture || user.picture || null,
                    onboarding_completed: me.onboarding_completed === true,
                    catalog_preferences: me.catalog_preferences ?? user.catalog_preferences ?? null,
                    study_language: me.study_language ?? user.study_language ?? null,
                };

                if (syncedUser.onboarding_completed === true) {
                    if (authData?.token) {
                        authRepository.saveAuthData({ token: authData.token, user: syncedUser });
                    }
                    setUser(syncedUser);
                    return syncedUser;
                }

                throw new Error('El servidor no confirmó onboarding_completed=true');
            } catch (err) {
                if (attempt === 3) {
                    console.warn('No se pudo sincronizar onboarding con el servidor:', err);
                    return null;
                }
                await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
            }
        }
    };

    const updateCatalogPreferences = useCallback(async (catalogPreferences) => {
        if (!user?.email) return null;

        const authData = authRepository.getAuthData();
        const normalizedPreferences = catalogPreferences ?? null;
        const optimisticUser = { ...user, catalog_preferences: normalizedPreferences };
        notifyAuthUserSynced(config, optimisticUser);
        if (authData?.token) {
            authRepository.saveAuthData({ token: authData.token, user: optimisticUser });
        }
        setUser(optimisticUser);

        try {
            const response = await httpClient.post('/api/auth/catalog-preferences', {
                catalog_preferences: normalizedPreferences,
            });
            const syncedUser = response?.user
                ? { ...optimisticUser, ...response.user }
                : optimisticUser;
            notifyAuthUserSynced(config, { ...syncedUser, email: syncedUser.email || user.email });
            if (authData?.token) {
                authRepository.saveAuthData({ token: authData.token, user: syncedUser });
            }
            setUser(syncedUser);
            return syncedUser;
        } catch (err) {
            console.warn('No se pudo sincronizar catalog_preferences con el servidor:', err);
            return optimisticUser;
        }
    }, [user]);

    const updateStudyLanguage = useCallback(async (studyLanguage) => {
        if (!user?.email) return null;

        const normalized = normalizeStudyLanguage(studyLanguage);
        const authData = authRepository.getAuthData();
        const optimisticUser = { ...user, study_language: normalized };
        if (authData?.token) {
            authRepository.saveAuthData({ token: authData.token, user: optimisticUser });
        }
        setUser(optimisticUser);

        try {
            const response = await httpClient.post('/api/auth/study-language', {
                study_language: normalized,
            });
            const syncedUser = response?.user
                ? { ...optimisticUser, ...response.user, study_language: normalized }
                : optimisticUser;
            if (authData?.token) {
                authRepository.saveAuthData({ token: authData.token, user: syncedUser });
            }
            setUser(syncedUser);
            return syncedUser;
        } catch (err) {
            console.warn('No se pudo sincronizar study_language con el servidor:', err);
            return optimisticUser;
        }
    }, [user]);

    // Espejo del usuario vigente para que `refreshUser` NO dependa de `user`: si dependiera,
    // cada refresco cambiaría su identidad y los efectos que la observan (el polling de
    // activación del checkout) se reiniciarían en bucle sin llegar nunca a su corte.
    const userRef = useRef(user);
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    /** Relee el rol/suscripción reales del servidor (`/api/auth/me`) y actualiza la sesión. */
    const refreshUser = useCallback(async () => {
        const authData = authRepository.getAuthData();
        if (!authData?.token) return null;
        const current = userRef.current || authData.user;
        try {
            const me = await httpClient.get('/api/auth/me');
            const syncedUser = {
                ...current,
                role: me.effective_role || current.role,
                picture: me.picture || current.picture || null,
                onboarding_completed: resolveOnboardingCompleted(
                    current,
                    me.onboarding_completed === true,
                ),
                catalog_preferences: me.catalog_preferences ?? null,
                study_language: me.study_language ?? current.study_language ?? null,
                subscription: me.subscription ?? null,
            };
            notifyAuthUserSynced(config, syncedUser);
            authRepository.saveAuthData({ token: authData.token, user: syncedUser });
            setUser(syncedUser);
            return syncedUser;
        } catch (err) {
            console.warn('No se pudo sincronizar usuario desde /api/auth/me:', err);
            return current;
        }
    }, []);

    /* ── Pago recién hecho: premium optimista mientras llega la confirmación ─────────────
       El checkout marca `pendingPremium` al volver del pago. Durante esa ventana (momentánea,
       ver `pendingPremiumStorage.js`) el usuario entra ya como premium (el backend sigue
       validando de verdad) y el rol real se reconsulta en segundo plano: si el webhook
       confirma, manda el servidor; si la ventana caduca sin confirmación, la marca se borra
       sola y los permisos vuelven atrás. Atada al email de la cuenta y borrada en todo logout
       (`logout()` más abajo): nunca debe sobrevivir a un cierre de sesión ni cruzarse con otra
       cuenta que inicie sesión después en el mismo navegador. */
    const [pendingPremium, setPendingPremium] = useState(false);

    // Restaura el optimismo tras un reload durante la ventana (p. ej. el usuario recarga la
    // pantalla de éxito), pero solo UNA vez por sesión — `markPremiumPending` ya cubre el resto.
    const pendingPremiumRestoredRef = useRef(false);
    useEffect(() => {
        if (pendingPremiumRestoredRef.current || !user?.email) return;
        pendingPremiumRestoredRef.current = true;
        if (isPendingPremiumActive(user.email)) {
            setPendingPremium(true);
        }
    }, [user]);

    const markPremiumPending = useCallback(() => {
        const email = userRef.current?.email;
        if (!email) return;
        markPendingPremium(email);
        setPendingPremium(true);
    }, []);

    const serverRole = user?.role ?? 'viewer';
    const serverIsPremium = serverRole === 'premium' || serverRole === 'admin';

    useEffect(() => {
        if (!pendingPremium) return undefined;
        if (serverIsPremium) {
            clearPendingPremium();
            setPendingPremium(false);
            return undefined;
        }

        let cancelled = false;
        const timerId = setInterval(async () => {
            if (!isPendingPremiumActive(userRef.current?.email)) {
                if (!cancelled) setPendingPremium(false);
                return;
            }
            const synced = await refreshUser();
            if (cancelled) return;
            if (synced?.role === 'premium' || synced?.role === 'admin') {
                clearPendingPremium();
                setPendingPremium(false);
            }
        }, PENDING_PREMIUM_CONFIRM_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(timerId);
        };
    }, [pendingPremium, serverIsPremium, refreshUser]);

    const role = !serverIsPremium && pendingPremium ? 'premium' : serverRole;
    const isPremium = role === 'premium' || role === 'admin';
    const isAdmin = role === 'admin';
    const subscription = user?.subscription ?? null;
    // Vista optimista del usuario: lo guardado en localStorage conserva el rol real del servidor.
    const effectiveUser = user && role !== serverRole ? { ...user, role } : user;

    const value = {
        user: effectiveUser,
        loading,
        loadingStage,
        login,
        loginWithApple,
        loginAsGuest,
        logout,
        refreshUser,
        markPremiumPending,
        isAuthenticated: !!user,
        role,
        isPremium,
        isAdmin,
        subscription,
        canCustomizeImages: isPremium,
        onboardingRequired,
        completeOnboarding,
        updateCatalogPreferences,
        updateStudyLanguage,
        shouldShowOnboarding,
    };

    return (
        <AuthContext.Provider value={value}>
            <PresenceTracker />
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
