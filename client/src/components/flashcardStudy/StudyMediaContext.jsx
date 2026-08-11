import { createContext, useContext, useMemo } from 'react';
import {
    STUDY_MEDIA_VARIANT_APP,
    isLandingDemoMediaVariant,
    LANDING_DEMO_MEDIA,
} from '../../contracts/studyMediaVariants';

const StudyMediaContext = createContext(null);

/**
 * @param {'app'|'landing-demo'} mediaVariant
 *   - `landing-demo`: demo público → backend usa ElevenLabs + Gemini (category landing-demo).
 *   - `app`: sesión autenticada → reglas normales de la app.
 */
export function StudyMediaProvider({
    audioPort,
    imagePort,
    imageCompressionService = null,
    mediaVariant = STUDY_MEDIA_VARIANT_APP,
    children,
}) {
    const value = useMemo(() => ({
        audioPort,
        imagePort,
        imageCompressionService,
        mediaVariant,
        isLandingDemoMedia: isLandingDemoMediaVariant(mediaVariant),
        landingDemoMedia: isLandingDemoMediaVariant(mediaVariant) ? LANDING_DEMO_MEDIA : null,
    }), [audioPort, imagePort, imageCompressionService, mediaVariant]);

    return (
        <StudyMediaContext.Provider value={value}>
            {children}
        </StudyMediaContext.Provider>
    );
}

export function useStudyMediaContext() {
    const ctx = useContext(StudyMediaContext);
    if (!ctx?.audioPort || !ctx?.imagePort) {
        throw new Error('StudyMediaProvider is required for flashcard study UI');
    }
    return ctx;
}
