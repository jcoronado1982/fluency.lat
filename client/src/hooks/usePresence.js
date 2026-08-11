import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { httpClient } from '../services/httpClient';
import { getClientInfo } from '../utils/clientInfo';

const HEARTBEAT_MS = 60_000;

export function usePresence() {
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        if (!isAuthenticated) return;

        const sendHeartbeat = () => {
            httpClient.post('/api/presence/heartbeat', getClientInfo()).catch(() => {});
        };

        // Enviar el primer heartbeat al montar
        sendHeartbeat();
        const interval = setInterval(sendHeartbeat, HEARTBEAT_MS);

        // Ya NO interceptamos beforeunload. 
        // Si el usuario recarga, el backend mantendrá la sesión abierta por 90s,
        // así que el nuevo heartbeat tras la recarga solo actualizará la sesión existente.
        // El logout explícito ya envía su propio /leave en AuthContext.
        
        return () => {
            clearInterval(interval);
        };
    }, [isAuthenticated]);
}

