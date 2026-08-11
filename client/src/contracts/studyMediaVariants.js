/**
 * Variantes de media para la UI compartida de estudio (shell flashcardStudy).
 *
 * El backend enruta por `category` en el body HTTP:
 * - `landing-demo` → audio ElevenLabs (premade) + imágenes Gemini (ver mod_flashcards).
 * - Resto (app) → Google TTS / routing TTS + ComfyUI/Flux (premium) u otras reglas de rol.
 */
import {
    LANDING_DEMO_CATEGORY,
    LANDING_DEMO_DECK,
} from './landingDemoNamespace.js';

export const STUDY_MEDIA_VARIANT_APP = 'app';
export const STUDY_MEDIA_VARIANT_LANDING_DEMO = 'landing-demo';

export const LANDING_DEMO_MEDIA = Object.freeze({
    variant: STUDY_MEDIA_VARIANT_LANDING_DEMO,
    category: LANDING_DEMO_CATEGORY,
    deck: LANDING_DEMO_DECK,
    /** Backend: ElevenLabsTtsProvider + landing_demo_audio_gen */
    audioProvider: 'elevenlabs-premade-v1',
    /** Backend: GeminiInteractionsImageProvider + landing_demo_image_gen */
    imageProvider: 'gemini',
});

export function isLandingDemoMediaVariant(variant) {
    return variant === STUDY_MEDIA_VARIANT_LANDING_DEMO;
}

export function resolveStudyMediaNamespace(variant, contextCategory, contextDeck) {
    if (isLandingDemoMediaVariant(variant)) {
        return {
            category: LANDING_DEMO_MEDIA.category,
            deck: LANDING_DEMO_MEDIA.deck,
        };
    }
    return {
        category: contextCategory,
        deck: contextDeck,
    };
}
