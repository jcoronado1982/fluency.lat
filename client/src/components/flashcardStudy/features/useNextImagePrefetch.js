import { useEffect } from 'react';
import {
    hasPrefetchEntry,
    makePrefetchKey,
    setPrefetchedImagePath,
} from './imagePrefetchCache';
import { parseCardImageStorageIdentity } from './imageStorageIdentity.js';

// Un margen corto cancela clics ultrarrápidos, pero permite que la única
// consulta de metadatos termine mientras el usuario estudia la tarjeta actual.
// Con 600 ms el prefetch empezaba demasiado tarde al usar Oracle remoto.
const PREFETCH_DELAY_MS = 100;

/**
 * Precarga en segundo plano la imagen de la SIGUIENTE tarjeta (def 0, forma
 * v1) para que al avanzar ya esté en la caché HTTP del navegador y la
 * resolución no pague el viaje a /api/resolve-image.
 *
 * Guardas de concurrencia/RAM (servidor de 1 GB, ~100 usuarios):
 * - una sola tarjeta por delante, una sola petición en vuelo;
 * - debounce de {@link PREFETCH_DELAY_MS}: navegar rápido cancela, no acumula;
 * - sin reintentos: un 404 se cachea como negativo y no se vuelve a pedir;
 * - no corre con la pestaña oculta;
 * - una resolución ligera por tarjeta como máximo; el resolve on-view se ahorra
 *   vía caché y nunca dispara generación de imágenes.
 */
export function useNextImagePrefetch({ imagePort, card, category, deckName, studyLanguage = 'en', enabled = true }) {
    const cardId = card?.id;
    const forceGeneration = Boolean(card?.force_generation);

    useEffect(() => {
        if (!enabled || !imagePort || !category || !deckName) return undefined;
        if (cardId === undefined || cardId === null || forceGeneration) return undefined;

        const preferredPath = card?.definitions?.[0]?.imagePath || null;
        const key = makePrefetchKey({
            category,
            deck: deckName,
            cardId,
            defIndex: 0,
            form: 'v1',
            studyLanguage,
        });
        if (hasPrefetchEntry(key)) return undefined;

        let cancelled = false;
        const abortController = new AbortController();
        const timer = setTimeout(async () => {
            if (cancelled || document.visibilityState === 'hidden') return;
            try {
                if (preferredPath) {
                    // El JSON persiste una ruta sin versión. Resolver su
                    // identidad conserva la asociación semántica y precalienta
                    // la misma URL ?v= que mostrará la tarjeta.
                    const identity = parseCardImageStorageIdentity(preferredPath);
                    if (!identity) {
                        setPrefetchedImagePath(key, null);
                        return;
                    }
                    const data = await imagePort.resolve({
                        category: identity.category,
                        deck: identity.deck,
                        index: identity.index,
                        defIndex: identity.defIndex,
                        form: identity.form !== 'v1' ? identity.form : undefined,
                        courseDirection: identity.courseDirection || (studyLanguage === 'es' ? 'en_es' : 'es_en'),
                        signal: abortController.signal,
                    });
                    if (cancelled || !data?.path) {
                        setPrefetchedImagePath(key, data?.path ?? null);
                        return;
                    }
                    setPrefetchedImagePath(key, data.path);
                    imagePort.preloadImage(data.path, false, { signal: abortController.signal }).catch(() => {});
                    return;
                }
                // Nunca resolver en_es por índice: los mazos inversos no tienen
                // garantizado el mismo orden que es_en.
                if (studyLanguage === 'es') {
                    setPrefetchedImagePath(key, null);
                    return;
                }
                const data = await imagePort.resolve({
                    category,
                    deck: deckName,
                    index: cardId,
                    defIndex: 0,
                    courseDirection: studyLanguage === 'es' ? 'en_es' : 'es_en',
                    signal: abortController.signal,
                });
                if (cancelled || !data?.path) {
                    setPrefetchedImagePath(key, data?.path ?? null);
                    return;
                }
                setPrefetchedImagePath(key, data.path);
                // Calienta la caché HTTP con la misma URL versionada que usará
                // la vista; los bytes quedan en el navegador.
                imagePort.preloadImage(data.path, false, { signal: abortController.signal }).catch(() => {});
            } catch {
                // 404 o red: negativo, sin reintentos.
                setPrefetchedImagePath(key, null);
            }
        }, PREFETCH_DELAY_MS);

        return () => {
            cancelled = true;
            abortController.abort();
            clearTimeout(timer);
        };
    }, [enabled, imagePort, category, deckName, card, cardId, forceGeneration, studyLanguage]);
}
