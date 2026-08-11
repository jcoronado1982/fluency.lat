/**
 * Puente compartido para acciones UI del estudio de flashcards.
 * El registry invoca acciones; la tarjeta activa registra handlers.
 */
const handlers = new Map();

export function registerUiBridgeHandler(action, handler) {
    handlers.set(action, handler);
}

export function unregisterUiBridgeHandler(action) {
    handlers.delete(action);
}

export function invokeUiBridge(action, payload) {
    const handler = handlers.get(action);
    if (typeof handler === 'function') {
        handler(payload);
        return true;
    }
    return false;
}

export function clearUiBridgeHandlers() {
    handlers.clear();
}
