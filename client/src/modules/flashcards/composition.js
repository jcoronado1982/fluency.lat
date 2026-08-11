import { httpClient } from '../../services/httpClient';
import { createFlashcardPort } from './ports/flashcardPort';
import { createFlashcardHttpAdapter } from './adapters/flashcardHttpAdapter';
import { createAudioHttpAdapter, createImageHttpAdapter, createAudioPort, createImagePort } from '../../adapters';
import { imageCompressionService } from './services/imageCompressionService';
import { createSrsPort } from './ports/srsPort';
import { createSrsHttpAdapter } from './adapters/srsHttpAdapter';
import { createStaticDeckHttpAdapter } from './adapters/staticDeckHttpAdapter';

/** Composition root del módulo flashcards (equivalente a wiring en `api_main`). */
export const flashcardPort = createFlashcardPort(createFlashcardHttpAdapter(httpClient));
export const srsPort = createSrsPort(createSrsHttpAdapter(httpClient));
export const staticDeckPort = Object.freeze(createStaticDeckHttpAdapter({ fallbackPort: flashcardPort }));
export const audioPort = createAudioPort(createAudioHttpAdapter(httpClient));
export const imagePort = createImagePort(createImageHttpAdapter(httpClient));
export { imageCompressionService };
