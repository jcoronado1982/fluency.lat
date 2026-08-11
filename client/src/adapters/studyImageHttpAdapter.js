import { API_URL } from '../config/api';
import { buildGlobalImageStoragePath } from '../components/flashcardStudy/features/imageStorageIdentity.js';
import { normalizeCardImageUrl } from '../utils/mediaUrl.js';

export function createImageHttpAdapter(http) {
    const normalizeCourseDirection = (courseDirection) => {
        if (courseDirection === 'en_es') return 'en_es';
        if (courseDirection === 'es_de') return 'es_de';
        return 'es_en';
    };
    const imageAdapter = {
    // POST /api/resolve-image — capa personal (premium) o global (predeterminada), sin generar
    resolve: async ({ category, deck, index, defIndex, form, courseDirection, signal }) => {
        const data = await http.post('/api/resolve-image', {
            category,
            deck,
            index,
            def_index: defIndex,
            course_direction: normalizeCourseDirection(courseDirection),
            form: form && form !== 'v1' ? form : undefined,
        }, { signal });
        if (!data?.path) throw new Error('Sin ruta de imagen en la respuesta');
        return data;
    },

    // POST /api/generate-image — recupera imagen de GCS o genera una nueva con IA
    generate: async ({ category, deck, index, defIndex, form, courseDirection, prompt, meaning, usageExample, usageContext, alternativeExample, forceGeneration, legacyImagePath, sceneComplement, promptEngine, signal }) => {
        const data = await http.post('/api/generate-image', {
            category,
            deck,
            index,
            def_index: defIndex,
            course_direction: normalizeCourseDirection(courseDirection),
            form,
            prompt,
            meaning,
            usage_example: usageExample,
            usage_context: usageContext || undefined,
            alternative_example: alternativeExample || undefined,
            force_generation: forceGeneration,
            legacy_image_path: legacyImagePath || undefined,
            scene_complement: sceneComplement || undefined,
            prompt_engine: promptEngine || undefined,
        }, { signal });
        if (!data?.path) throw new Error('Sin ruta de imagen en la respuesta');
        return data;
    },

    // DELETE /api/delete-image — borra el archivo del bucket GCS
    delete: async ({ category, deck, index, defIndex, form, courseDirection }) => {
        try {
            return await http.delete('/api/delete-image', {
                category,
                deck,
                index,
                def_index: defIndex,
                form,
                course_direction: normalizeCourseDirection(courseDirection),
            });
        } catch (err) {
            throw new Error(err.message || 'Error en el servidor al eliminar', { cause: err });
        }
    },

    // POST /api/upload-image — sube imagen local al bucket GCS
    upload: async (file, { category, deck, cardIndex, defIndex, form, courseDirection }) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        formData.append('deck', deck);
        formData.append('card_index', cardIndex);
        formData.append('def_index', defIndex);
        formData.append('course_direction', normalizeCourseDirection(courseDirection));
        if (form) formData.append('form', form);

        const data = await http.upload('/api/upload-image', formData);
        if (!data?.path) throw new Error('Sin ruta de imagen en la respuesta de subida.');
        return data;
    },

    // Ruta AVIF global predeterminada (compartida por usuarios e idiomas).
    buildGlobalStoragePath: buildGlobalImageStoragePath,

    // Normaliza paths legacy: los JSON antiguos apuntaban a .jpg, pero los assets reales son AVIF.
    normalizeToAvif: (path) => {
        return normalizeCardImageUrl(path);
    },

    // Construye URL absoluta dado un path relativo de imagen.
    // forceCacheBust se usa solo al generar o subir una nueva imagen para saltar la caché.
    buildUrl: (path, forceCacheBust = false) => {
        if (!path) return null;
        const cleanPath = imageAdapter.normalizeToAvif(path);
        const base = cleanPath.startsWith('http') ? cleanPath : `${API_URL}${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;
        if (!forceCacheBust) return base;

        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}t=${Date.now()}`;
    },

    // Comprueba que la imagen es accesible vía same-origin (sin CORS cross-domain).
    verifyAccessible: async (path, forceCacheBust = false) => {
        try {
            await imageAdapter.preloadImage(path, forceCacheBust);
            return true;
        } catch {
            return false;
        }
    },

    // Preload completo (decodifica en memoria). Solo para subidas/regeneraciones explícitas.
    preloadImage: (path, forceCacheBust = false, { signal } = {}) => {
        const url = imageAdapter.buildUrl(path, forceCacheBust);
        if (!url) return Promise.reject(new Error('Ruta de imagen vacía'));

        return new Promise((resolve, reject) => {
            const img = new Image();
            let settled = false;
            const cleanup = () => signal?.removeEventListener('abort', onAbort);
            const finish = (callback) => {
                if (settled) return;
                settled = true;
                cleanup();
                callback();
            };
            const onAbort = () => {
                img.src = '';
                finish(() => reject(new DOMException('Aborted', 'AbortError')));
            };
            if (signal?.aborted) {
                onAbort();
                return;
            }
            signal?.addEventListener('abort', onAbort, { once: true });
            img.onload = () => finish(() => resolve(url));
            img.onerror = () => finish(() => reject(new Error(`No se pudo cargar: ${url}`)));
            img.src = url;
        });
    },

    /** Preload con reintentos tras generación (Oracle/CDN puede ir retrasado). */
    preloadImageWithRetry: async (path, forceCacheBust = false, { attempts = 4, delayMs = 700, signal } = {}) => {
        let lastErr;
        for (let i = 0; i < attempts; i += 1) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            try {
                return await imageAdapter.preloadImage(path, forceCacheBust || i > 0, { signal });
            } catch (err) {
                if (err?.name === 'AbortError') throw err;
                lastErr = err;
                if (i < attempts - 1) {
                    await new Promise((resolve) => { setTimeout(resolve, delayMs); });
                }
            }
        }
        throw lastErr ?? new Error('No se pudo precargar la imagen');
    },
    };

    return imageAdapter;
}
