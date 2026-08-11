/**
 * Outbox local del módulo SRS.
 *
 * IndexedDB es asíncrono: nunca serializa toda la cola en el hilo principal.
 * El servidor sigue siendo la fuente de verdad; aquí solo quedan cambios que
 * todavía no recibieron confirmación del POST /api/update-batch.
 */
const DB_NAME = 'flashcards-client';
const DB_VERSION = 1;
const STORE_NAME = 'srs-pending-batches';
const LEGACY_STORAGE_KEY = 'flashcards_srs_pending_batches_v1';

let databasePromise;

const batchKey = ({ userId, courseDirection, category, deck }) => (
    `${userId}::${courseDirection}::${category}::${deck}`
);

const getDatabase = () => {
    if (databasePromise) return databasePromise;
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('IndexedDB no está disponible en este navegador'));
    }

    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB'));
    });
    return databasePromise;
};

const withStore = async (mode, operation) => {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error('No se pudo actualizar la cola SRS'));
        transaction.onabort = () => reject(transaction.error || new Error('La cola SRS fue cancelada'));
        operation(store, (value) => { result = value; }, reject);
    });
};

const normalizeCards = (cards) => {
    const byIndex = new Map();
    (Array.isArray(cards) ? cards : []).forEach((card) => {
        if (Number.isInteger(card?.index)) byIndex.set(card.index, card);
    });
    return Array.from(byIndex.values());
};

async function migrateLegacyLocalStorage() {
    // Migración única desde la implementación anterior. Después no se vuelve a usar localStorage.
    let batches;
    try {
        batches = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
    } catch {
        return;
    }
    if (!Array.isArray(batches) || batches.length === 0) return;

    for (const batch of batches) {
        if (batch?.userId && batch?.category && batch?.deck) {
            await queueSrsBatch(batch, batch.cards);
        }
    }
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

let legacyMigrationPromise;
const ensureLegacyMigration = () => {
    if (!legacyMigrationPromise) legacyMigrationPromise = migrateLegacyLocalStorage().catch(() => {});
    return legacyMigrationPromise;
};

export async function listSrsBatches() {
    await ensureLegacyMigration();
    return withStore('readonly', (store, setResult, reject) => {
        const request = store.getAll();
        request.onsuccess = () => setResult(request.result.map(({ key: _key, ...batch }) => batch));
        request.onerror = () => reject(request.error);
    });
}

export async function queueSrsBatch(context, cards) {
    if (!context?.userId || !context?.category || !context?.deck) return;
    const key = batchKey(context);
    const normalizedCards = normalizeCards(cards);
    if (normalizedCards.length === 0) return;

    return withStore('readwrite', (store, setResult, reject) => {
        const getRequest = store.get(key);
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
            const existing = getRequest.result?.cards || [];
            const merged = normalizeCards([...existing, ...normalizedCards]);
            const putRequest = store.put({ key, ...context, cards: merged, updatedAt: Date.now() });
            putRequest.onsuccess = () => setResult(undefined);
            putRequest.onerror = () => reject(putRequest.error);
        };
    });
}

export async function removeSrsBatch(context) {
    if (!context?.userId || !context?.category || !context?.deck) return;
    const key = batchKey(context);
    return withStore('readwrite', (store, setResult, reject) => {
        const request = store.delete(key);
        request.onsuccess = () => setResult(undefined);
        request.onerror = () => reject(request.error);
    });
}
