import { httpClient } from '../services/httpClient';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, clearSessionScopedStorage } from '../utils/sessionStorage';

class AuthRepository {
    async loginAsDevGuest() {
        return httpClient.post('/api/auth/dev-guest');
    }

    async loginWithGoogle(idToken) {
        try {
            return await httpClient.post('/api/auth/google', { id_token: idToken });
        } catch (error) {
            console.error('Error logging in with Google:', error);
            throw error;
        }
    }

    async loginWithApple(idToken, name) {
        try {
            return await httpClient.post('/api/auth/apple', { id_token: idToken, name });
        } catch (error) {
            console.error('Error logging in with Apple:', error);
            throw error;
        }
    }

    saveAuthData(data) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    }

    getAuthData() {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        const userStr = localStorage.getItem(AUTH_USER_KEY);
        if (token && userStr) {
            return { token, user: JSON.parse(userStr) };
        }
        return null;
    }

    /** Cierra la sesión: borra el token y todo lo demás con ámbito de sesión. */
    logout() {
        clearSessionScopedStorage();
    }
}

export const authRepository = new AuthRepository();
