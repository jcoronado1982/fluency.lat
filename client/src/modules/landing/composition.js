import {
    createAudioHttpAdapter,
    createImageHttpAdapter,
    createAudioPort,
    createImagePort,
} from '../../adapters';
import { httpClient } from '../../services/httpClient';
import { LANDING_DEMO_MEDIA } from '../../contracts/studyMediaVariants';
import { createDemoFeedbackHttpAdapter } from './adapters/demoFeedbackHttpAdapter';
import { createDemoFeedbackPort } from './ports/demoFeedbackPort';

/**
 * Composition root del landing demo.
 * Los adapters HTTP de audio/imagen son los compartidos del kit de estudio
 * (`src/adapters`, ver client/CLAUDE.md §4: un solo <Flashcard/>, dos consumidores);
 * la variante ElevenLabs + Gemini la activa el backend cuando `category === landing-demo`
 * (ver LANDING_DEMO_MEDIA). El feedback del demo tiene su propio ports/adapters (§3 de
 * docs/ARQUITECTURA_MODULAR.md), igual que el resto de módulos.
 */
export const demoAudioPort = createAudioPort(createAudioHttpAdapter(httpClient));
export const demoImagePort = createImagePort(createImageHttpAdapter(httpClient));

export const demoFeedbackPort = createDemoFeedbackPort(createDemoFeedbackHttpAdapter(httpClient));

export { LANDING_DEMO_MEDIA };
