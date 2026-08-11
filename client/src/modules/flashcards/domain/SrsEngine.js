/**
 * Re-export del motor SRS canónico. Vive en `contracts/srsEngine.js` porque
 * dashboard también lo consume; este shim evita tocar a los consumidores
 * internos de flashcards (useDeckSession, useSrsDeckSession, SrsControls).
 */
export * from '../../../contracts/srsEngine.js';
