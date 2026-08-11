import { useState, useCallback, useRef } from 'react';
import { useStudyMediaContext } from '../StudyMediaContext';
import { resolveStudyMediaNamespace } from '../../../contracts/studyMediaVariants';
import { useUIContext } from '../../../context/UIContext';
import { getCourseDirectionFromStudyLanguage } from '../../../contracts/courseDirection.js';
import {
    clearPrefetchedAudio,
    deletePrefetchedAudio,
    getPrefetchedAudio,
    makeAudioPrefetchKey,
    setPrefetchedAudio,
} from './audioPrefetchCache';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY  = 5000;

const audioPlayer = new Audio();

function getPlaybackDuration(player) {
    const duration = player.duration;
    if (Number.isFinite(duration) && duration > 0) return duration;
    for (const range of [player.seekable, player.buffered]) {
        if (range?.length > 0) {
            const end = range.end(range.length - 1);
            if (Number.isFinite(end) && end > 0) return end;
        }
    }
    return null;
}

function resolveWordIndex(currentTime, duration, wordIntervals, offset = 0.02) {
    if (!duration || wordIntervals.length === 0) return 0;
    const currentFraction = (currentTime + offset) / duration;
    let idx = 0;
    for (let i = 0; i < wordIntervals.length; i++) {
        if (currentFraction >= wordIntervals[i].start && currentFraction < wordIntervals[i].end) {
            return i;
        }
        if (i === wordIntervals.length - 1 && currentFraction >= wordIntervals[i].start) {
            idx = i;
        }
    }
    return idx;
}

function buildWordIntervals(originalText) {
    const words = originalText.trim().split(/\s+/);
    const wordLengths = words.map(w => w.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '').length || 1);
    const totalChars = wordLengths.reduce((a, b) => a + b, 0);
    const wordIntervals = [];
    let cumulativeFraction = 0;
    for (let i = 0; i < words.length; i++) {
        const weight = (wordLengths[i] + 1.2) / (totalChars + words.length * 1.2);
        const start = cumulativeFraction;
        const end = cumulativeFraction + weight;
        wordIntervals.push({ start, end });
        cumulativeFraction = end;
    }
    return { words, wordIntervals };
}

function waitForAudioReady(player) {
    return new Promise((resolve, reject) => {
        if (player.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            resolve();
            return;
        }

        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            cleanup();
            ok ? resolve() : reject(new Error('No se pudo cargar el audio'));
        };

        const cleanup = () => {
            player.removeEventListener('canplay', onReady);
            player.removeEventListener('loadeddata', onReady);
            player.removeEventListener('error', onError);
        };

        const onReady = () => finish(true);
        const onError = () => finish(false);

        player.addEventListener('canplay', onReady);
        player.addEventListener('loadeddata', onReady);
        player.addEventListener('error', onError);
        player.load();
    });
}

function waitForRetry(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });
}

function shouldRetryAudioError(err) {
    if (err?.name === 'AbortError') return false;
    const status = Number(String(err?.message || '').match(/HTTP\s+(\d{3})/)?.[1]);
    return !status || status >= 500;
}

export function useAudioPlayback({
    setAppMessage,
    setIsAudioLoading,
    currentCategory: categoryFromContext,
    currentDeckName: deckFromContext,
    verbName,
}) {
    const { audioPort, mediaVariant, isLandingDemoMedia } = useStudyMediaContext();
    const { studyLanguage = 'en' } = useUIContext();
    const { category: currentCategory, deck: currentDeckName } = resolveStudyMediaNamespace(
        mediaVariant,
        categoryFromContext,
        deckFromContext,
    );
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [activeAudioText, setActiveAudioText] = useState(null);
    const [activeVoiceName, setActiveVoiceName] = useState(null);
    const [highlightedWordIndex, setHighlightedWordIndex] = useState(-1);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const playbackRequestIdRef = useRef(0);
    const playbackAbortControllerRef = useRef(null);
    const invalidateCacheEntry = useCallback((key) => {
        deletePrefetchedAudio(key);
    }, []);

    const stopAudio = useCallback(() => {
        playbackAbortControllerRef.current?.abort();
        playbackAbortControllerRef.current = null;
        playbackRequestIdRef.current += 1;
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        audioPlayer.removeAttribute('src');
        while (audioPlayer.firstChild) {
            audioPlayer.removeChild(audioPlayer.firstChild);
        }
        audioPlayer.load();
        audioPlayer.ontimeupdate = null;
        audioPlayer.onplay = null;
        audioPlayer.onpause = null;
        audioPlayer.onended = null;
        setIsAudioPlaying(false);
        setActiveAudioText(null);
        setActiveVoiceName(null);
        setHighlightedWordIndex(-1);
        setIsAudioLoading(false);
        setIsGeneratingAudio(false);
    }, [setIsAudioLoading]);

    const resolveAudioSource = useCallback(async ({
        key,
        originalText,
        lang,
        finalVerbName,
        excludeVoice,
        forceRegenerate,
        signal,
        silent = false,
    }) => {
        if (!forceRegenerate) {
            const prefetched = getPrefetchedAudio(key);
            if (prefetched?.resolvedUrl) {
                return {
                    playbackUrl: prefetched.resolvedUrl,
                    voiceName: prefetched.voiceName,
                    fromCache: true,
                };
            }
        } else {
            invalidateCacheEntry(key);
        }

        let data;
        const fetchResolved = async () => {
            if (forceRegenerate) {
                return audioPort.synthesize({
                    category: currentCategory,
                    deck: currentDeckName,
                    text: originalText,
                    verbName: finalVerbName,
                    lang,
                    courseDirection,
                    excludeVoice,
                    forceRegenerate: true,
                    signal,
                });
            }

            try {
                return await audioPort.resolve({
                    category: currentCategory,
                    deck: currentDeckName,
                    text: originalText,
                    verbName: finalVerbName,
                    lang,
                    courseDirection,
                    signal,
                });
            } catch (err) {
                const is404 = String(err?.message || '').includes('404');
                if (!is404) throw err;
                return audioPort.synthesize({
                    category: currentCategory,
                    deck: currentDeckName,
                    text: originalText,
                    verbName: finalVerbName,
                    lang,
                    courseDirection,
                    excludeVoice,
                    forceRegenerate: false,
                    signal,
                });
            }
        };

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                if (!silent) {
                    setAppMessage({
                        text: forceRegenerate
                            ? `⏳ Generando audio... (${attempt}/${MAX_ATTEMPTS})`
                            : `⏳ Cargando audio... (${attempt}/${MAX_ATTEMPTS})`,
                        isError: false,
                    });
                }

                data = await fetchResolved();
                break;
            } catch (err) {
                if (attempt === MAX_ATTEMPTS || !shouldRetryAudioError(err)) throw err;
                if (!silent) {
                    setAppMessage({ text: `Reintentando audio... (${attempt}/${MAX_ATTEMPTS})`, isError: true });
                }
                await waitForRetry(RETRY_DELAY, signal);
            }
        }

        const voiceName = data.voice_name || '—';
        const resolvedUrl = audioPort.buildUrl(data.audio_url, forceRegenerate || !data.from_cache);
        setPrefetchedAudio(key, { resolvedUrl, voiceName });

        return { playbackUrl: resolvedUrl, voiceName, fromCache: !!data.from_cache };
    }, [audioPort, courseDirection, currentCategory, currentDeckName, invalidateCacheEntry, setAppMessage]);

    const startPlayback = useCallback(async (originalText, playbackUrl, voiceLabel, playbackRequestId) => {
        const { wordIntervals } = buildWordIntervals(originalText);

        audioPlayer.pause();
        audioPlayer.removeAttribute('src');
        while (audioPlayer.firstChild) {
            audioPlayer.removeChild(audioPlayer.firstChild);
        }
        audioPlayer.load();

        // Dejar que el navegador use el Content-Type real de la respuesta.
        // Forzar audio/ogg rompía los MP3 del landing.
        audioPlayer.src = playbackUrl;

        await waitForAudioReady(audioPlayer);
        if (playbackRequestIdRef.current !== playbackRequestId) return false;

        let animationFrameId = null;
        let cachedDuration = getPlaybackDuration(audioPlayer);
        let maxSeenTime = 0;
        const estimatedDuration = Math.max(0.8, wordIntervals.length * 0.42);

        const syncDurationFromMetadata = () => {
            const d = getPlaybackDuration(audioPlayer);
            if (d) cachedDuration = d;
        };

        const cleanupDurationListeners = () => {
            audioPlayer.removeEventListener('durationchange', syncDurationFromMetadata);
            audioPlayer.removeEventListener('loadedmetadata', syncDurationFromMetadata);
            audioPlayer.removeEventListener('progress', syncDurationFromMetadata);
        };

        audioPlayer.addEventListener('durationchange', syncDurationFromMetadata);
        audioPlayer.addEventListener('loadedmetadata', syncDurationFromMetadata);
        audioPlayer.addEventListener('progress', syncDurationFromMetadata);

        const resolveDuration = () => {
            cachedDuration = getPlaybackDuration(audioPlayer) ?? cachedDuration;
            maxSeenTime = Math.max(maxSeenTime, audioPlayer.currentTime || 0);
            return cachedDuration ?? Math.max(maxSeenTime * 1.08, estimatedDuration);
        };

        const updateHighlight = () => {
            const duration = resolveDuration();
            if (!duration || duration <= 0) return;
            const idx = resolveWordIndex(audioPlayer.currentTime, duration, wordIntervals, 0.02);
            setHighlightedWordIndex((p) => (p !== idx ? idx : p));
        };

        const trackHighlight = () => {
            if (!audioPlayer.paused) {
                updateHighlight();
                animationFrameId = requestAnimationFrame(trackHighlight);
            }
        };

        audioPlayer.onplay = () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(trackHighlight);
        };

        audioPlayer.onpause = () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        };

        audioPlayer.onended = () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            cleanupDurationListeners();
            audioPlayer.ontimeupdate = null;
            setIsAudioPlaying(false);
            setAppMessage({ text: 'Audio finalizado.', isError: false });
            setHighlightedWordIndex(-1);
            setActiveAudioText(null);
            setIsAudioLoading(false);
        };

        audioPlayer.ontimeupdate = updateHighlight;

        await audioPlayer.play();
        if (playbackRequestIdRef.current !== playbackRequestId) {
            cleanupDurationListeners();
            return false;
        }
        // A partir de aquí el audio ya está listo y reproduciéndose. El estado
        // loading no debe durar hasta onended: permite anticipar la tarjeta
        // siguiente mientras el usuario escucha la actual.
        setIsAudioLoading(false);

        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(trackHighlight);
        setAppMessage({
            text: isLandingDemoMedia
                ? `▶️ ElevenLabs (voz: ${voiceLabel})...`
                : `▶️ Reproduciendo (voz: ${voiceLabel})...`,
            isError: false,
        });
        return true;
    }, [setAppMessage, setIsAudioLoading, isLandingDemoMedia]);

    const playAudio = useCallback(async (originalText, lang = 'en', excludeVoice = null, forceRegenerate = false) => {
        if (!originalText || !currentCategory) return;

        const finalVerbName = currentDeckName === 'phonics' ? originalText : verbName;
        const key = makeAudioPrefetchKey({
            category: currentCategory,
            deck: currentDeckName,
            text: originalText,
            lang,
            verbName: finalVerbName,
            courseDirection,
        });

        stopAudio();
        const playbackRequestId = playbackRequestIdRef.current;
        const abortController = new AbortController();
        playbackAbortControllerRef.current = abortController;

        setHighlightedWordIndex(-1);
        setActiveAudioText(originalText);
        setIsAudioPlaying(true);
        setIsAudioLoading(true);
        setIsGeneratingAudio(true);

        try {
            const { playbackUrl, voiceName, fromCache } = await resolveAudioSource({
                key,
                originalText,
                lang,
                finalVerbName,
                excludeVoice,
                forceRegenerate,
                signal: abortController.signal,
            });

            if (playbackRequestIdRef.current !== playbackRequestId) return;

            setActiveVoiceName(voiceName);

            if (fromCache) {
                setAppMessage({ text: '▶️ Reproduciendo audio...', isError: false });
            }

            const played = await startPlayback(originalText, playbackUrl, voiceName, playbackRequestId);
            if (!played) stopAudio();
        } catch (err) {
            if (playbackRequestIdRef.current !== playbackRequestId) return;
            if (err?.name === 'AbortError') return;
            console.error('Error en playAudio:', err);
            audioPlayer.ontimeupdate = null;
            setAppMessage({ text: `Error: ${err.message}`, isError: true });
            setIsAudioPlaying(false);
            setActiveAudioText(null);
            setActiveVoiceName(null);
            setHighlightedWordIndex(-1);
            setIsAudioLoading(false);
        } finally {
            if (playbackRequestIdRef.current === playbackRequestId) {
                if (playbackAbortControllerRef.current === abortController) {
                    playbackAbortControllerRef.current = null;
                }
                setIsGeneratingAudio(false);
            }
        }
    }, [
        currentCategory,
        currentDeckName,
        verbName,
        stopAudio,
        resolveAudioSource,
        startPlayback,
        setAppMessage,
        setIsAudioLoading,
        courseDirection,
    ]);

    const deleteAudio = useCallback(async (textToDelete, lang = 'en') => {
        if (!textToDelete || !currentCategory) return;

        const finalVerbName = currentDeckName === 'phonics' ? textToDelete : verbName;
        const key = makeAudioPrefetchKey({
            category: currentCategory,
            deck: currentDeckName,
            text: textToDelete,
            lang,
            verbName: finalVerbName,
            courseDirection,
        });

        try {
            setAppMessage({ text: '⏳ Actualizando voz (archivando audio anterior)...', isError: false });

            let previousVoice = null;
            try {
                const rotateResult = await audioPort.rotate({
                    category: currentCategory,
                    deck: currentDeckName,
                    text: textToDelete,
                    verbName: finalVerbName,
                    lang,
                    courseDirection,
                });
                previousVoice = rotateResult?.previous_voice || null;
            } catch (rotateErr) {
                const msg = rotateErr?.message || '';
                if (!msg.includes('404')) throw rotateErr;
            }

            invalidateCacheEntry(key);
            clearPrefetchedAudio();
            setActiveVoiceName(null);
            setAppMessage({ text: '🎲 Generando nueva voz aleatoria...', isError: false });
            await playAudio(textToDelete, lang, previousVoice, true);
        } catch (err) {
            console.error('Error rotating audio:', err);
            setAppMessage({ text: `Error al actualizar voz: ${err.message}`, isError: true });
        }
    }, [audioPort, courseDirection, currentCategory, currentDeckName, verbName, setAppMessage, playAudio, invalidateCacheEntry]);

    return {
        playAudio,
        stopAudio,
        deleteAudio,
        isAudioPlaying,
        activeAudioText,
        activeVoiceName,
        highlightedWordIndex,
        isGeneratingAudio,
    };
}
