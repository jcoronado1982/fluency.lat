import { useEffect } from 'react';
import { getAudioLang, getCardTitle } from './cardLanguageUtils';
import {
    hasAudioPrefetchEntry,
    makeAudioPrefetchKey,
    setPrefetchedAudio,
} from './audioPrefetchCache';

const PREFETCH_DELAY_MS = 100;

/**
 * Descarga silenciosamente el audio ya existente de la siguiente tarjeta.
 * Nunca llama al endpoint de síntesis. Al navegar rápido, el timer o la
 * descarga en curso se abortan para no acumular trabajo de tarjetas saltadas.
 */
export function useNextAudioPrefetch({
    audioPort,
    card,
    category,
    deckName,
    studyLanguage = 'en',
    enabled = true,
}) {
    const cardId = card?.id;
    const title = getCardTitle(card || {}, studyLanguage);
    const lang = getAudioLang(studyLanguage);
    const courseDirection = studyLanguage === 'es' ? 'en_es' : 'es_en';
    const verbName = deckName === 'phonics' ? title : card?.name;

    useEffect(() => {
        if (!enabled || !audioPort || !category || !deckName || !title) return undefined;

        const key = makeAudioPrefetchKey({
            category,
            deck: deckName,
            text: title,
            lang,
            verbName,
            courseDirection,
        });
        if (hasAudioPrefetchEntry(key)) return undefined;

        let cancelled = false;
        const abortController = new AbortController();
        const timer = setTimeout(async () => {
            if (cancelled || document.visibilityState === 'hidden') return;
            try {
                const data = await audioPort.resolve({
                    category,
                    deck: deckName,
                    text: title,
                    verbName,
                    lang,
                    courseDirection,
                    signal: abortController.signal,
                });
                if (cancelled || !data?.audio_url) return;

                const resolvedUrl = await audioPort.preload(data.audio_url, {
                    signal: abortController.signal,
                });
                if (cancelled) return;

                setPrefetchedAudio(key, {
                    resolvedUrl,
                    voiceName: data.voice_name || '—',
                });
            } catch (err) {
                if (err?.name !== 'AbortError') {
                    // 404/red: no sintetizar, no reintentar durante este efecto.
                    setPrefetchedAudio(key, null);
                }
            }
        }, PREFETCH_DELAY_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            abortController.abort();
        };
    }, [
        audioPort,
        cardId,
        category,
        courseDirection,
        deckName,
        enabled,
        lang,
        title,
        verbName,
    ]);
}
