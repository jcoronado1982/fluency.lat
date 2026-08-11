import { API_URL } from '../config/api';

export function createAudioHttpAdapter(http) {
    const normalizeCourseDirection = (courseDirection) => {
        if (courseDirection === 'en_es') return 'en_es';
        if (courseDirection === 'es_de') return 'es_de';
        return 'es_en';
    };

    const buildUrl = (audioUrl, forceCacheBust = false) => {
        if (!audioUrl) return null;
        const base = audioUrl.startsWith('http') ? audioUrl : `${API_URL}${audioUrl.startsWith('/') ? audioUrl : '/' + audioUrl}`;
        if (!forceCacheBust) return base;

        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}t=${Date.now()}`;
    };

    return {
        resolve: async ({ category, deck, text, verbName, lang, courseDirection, signal }) => {
            const data = await http.post('/api/resolve-audio', {
                category,
                deck,
                text,
                voice_name: '',
                tone: '',
                verb_name: verbName,
                lang: lang || 'en',
                course_direction: normalizeCourseDirection(courseDirection),
            }, { signal });
            if (!data.audio_url) throw new Error('No audio_url in response');
            return data;
        },

        synthesize: async ({ category, deck, text, verbName, lang, excludeVoice, forceRegenerate, courseDirection, signal }) => {
            const data = await http.post('/api/synthesize-speech', {
                category,
                deck,
                text,
                voice_name: '',
                tone: '',
                verb_name: verbName,
                lang: lang || 'en',
                course_direction: normalizeCourseDirection(courseDirection),
                exclude_voice: excludeVoice || '',
                force_regenerate: !!forceRegenerate,
            }, { signal });
            if (!data.audio_url) throw new Error('No audio_url in response');
            return data;
        },

        rotate: async ({ category, deck, text, verbName, lang, courseDirection }) => {
            return http.post('/api/delete-audio', {
                category,
                deck,
                text,
                voice_name: '',
                tone: '',
                verb_name: verbName,
                lang: lang || 'en',
                course_direction: normalizeCourseDirection(courseDirection),
            });
        },

        buildUrl,

        // Descarga anticipada cancelable. Consume el stream por fragmentos y lo
        // descarta: los bytes quedan en la caché HTTP, no como un Blob retenido
        // por JavaScript.
        preload: async (audioUrl, { signal } = {}) => {
            const resolvedUrl = buildUrl(audioUrl, false);
            if (!resolvedUrl) throw new Error('Ruta de audio vacía');

            const response = await fetch(resolvedUrl, {
                credentials: 'include',
                signal,
                cache: 'force-cache',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const reader = response.body?.getReader();
            if (reader) {
                while (!(await reader.read()).done) {
                    // Consumir sin acumular los fragmentos en memoria JavaScript.
                }
            } else {
                await response.blob();
            }
            return resolvedUrl;
        },
    };
}
