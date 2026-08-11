import assert from 'node:assert/strict';
import {
  clearPrefetchedImages,
  getPrefetchedImagePath,
  hasPrefetchEntry,
  makePrefetchKey,
  setPrefetchedImagePath,
} from '../src/components/flashcardStudy/features/imagePrefetchCache.js';
import {
  clearPrefetchedAudio,
  deletePrefetchedAudio,
  getPrefetchedAudio,
  hasAudioPrefetchEntry,
  makeAudioPrefetchKey,
  setPrefetchedAudio,
} from '../src/components/flashcardStudy/features/audioPrefetchCache.js';

// La clave normaliza form ausente/'v1' al mismo valor (el prefetch guarda 'v1'
// y useImageGeneration puede consultar con undefined)
const base = { category: 'verbs', deck: '1-basic/action', cardId: 3, defIndex: 0 };
assert.equal(
  makePrefetchKey({ ...base, form: undefined }),
  makePrefetchKey({ ...base, form: 'v1' }),
);
// Formas verbales distintas NO colisionan
assert.notEqual(
  makePrefetchKey({ ...base, form: 'v2' }),
  makePrefetchKey({ ...base, form: 'v1' }),
);
// Las dos direcciones nunca comparten una entrada posicional de caché.
assert.notEqual(
  makePrefetchKey({ ...base, studyLanguage: 'en' }),
  makePrefetchKey({ ...base, studyLanguage: 'es' }),
);
// defIndex por defecto es 0
assert.equal(
  makePrefetchKey({ category: 'verbs', deck: 'd', cardId: 1 }),
  makePrefetchKey({ category: 'verbs', deck: 'd', cardId: 1, defIndex: 0, form: 'v1' }),
);

// set → get devuelve la ruta; la lectura NO consume (ensureImage hace pasadas dobles)
clearPrefetchedImages();
const key = makePrefetchKey(base);
setPrefetchedImagePath(key, '/card_images/verbs/1-basic/action/x.avif');
assert.equal(getPrefetchedImagePath(key), '/card_images/verbs/1-basic/action/x.avif');
assert.equal(getPrefetchedImagePath(key), '/card_images/verbs/1-basic/action/x.avif');
assert.equal(hasPrefetchEntry(key), true);

// Entrada negativa (404 del prefetch): existe para no reintentar,
// pero get devuelve null ⇒ el flujo on-view hace su resolve normal
const negKey = makePrefetchKey({ ...base, cardId: 4 });
setPrefetchedImagePath(negKey, null);
assert.equal(hasPrefetchEntry(negKey), true);
assert.equal(getPrefetchedImagePath(negKey), null);

// Clave inexistente ⇒ null y sin entrada
const missingKey = makePrefetchKey({ ...base, cardId: 999 });
assert.equal(getPrefetchedImagePath(missingKey), null);
assert.equal(hasPrefetchEntry(missingKey), false);

// clear() invalida todo (mutaciones de imagen: generar/subir/borrar)
clearPrefetchedImages();
assert.equal(hasPrefetchEntry(key), false);
assert.equal(getPrefetchedImagePath(key), null);

// El tope de entradas expulsa la más vieja (presupuesto de RAM acotado)
clearPrefetchedImages();
const firstKey = makePrefetchKey({ ...base, cardId: 0 });
setPrefetchedImagePath(firstKey, '/img/0.avif');
for (let i = 1; i <= 24; i += 1) {
  setPrefetchedImagePath(makePrefetchKey({ ...base, cardId: i }), `/img/${i}.avif`);
}
assert.equal(hasPrefetchEntry(firstKey), false, 'la entrada más vieja debe salir al llegar al tope');
assert.equal(
  getPrefetchedImagePath(makePrefetchKey({ ...base, cardId: 24 })),
  '/img/24.avif',
);

// Re-escribir una clave existente en el tope NO expulsa a otra
const lastKey = makePrefetchKey({ ...base, cardId: 24 });
setPrefetchedImagePath(lastKey, '/img/24-bis.avif');
assert.equal(getPrefetchedImagePath(lastKey), '/img/24-bis.avif');
assert.equal(getPrefetchedImagePath(makePrefetchKey({ ...base, cardId: 1 })), '/img/1.avif');

clearPrefetchedImages();

// Audio: metadatos versionados solamente; los bytes quedan en caché HTTP.
clearPrefetchedAudio();
const audioBase = {
  category: 'verbs',
  deck: '1-basic/action',
  text: 'run',
  lang: 'en',
  verbName: 'run',
  courseDirection: 'es_en',
};
const audioKey = makeAudioPrefetchKey(audioBase);
setPrefetchedAudio(audioKey, {
  resolvedUrl: '/card_audio/run.ogg?v=123-456',
  voiceName: 'Zephyr',
});
assert.deepEqual(getPrefetchedAudio(audioKey), {
  resolvedUrl: '/card_audio/run.ogg?v=123-456',
  voiceName: 'Zephyr',
});
assert.equal(hasAudioPrefetchEntry(audioKey), true);
assert.notEqual(
  audioKey,
  makeAudioPrefetchKey({ ...audioBase, courseDirection: 'en_es' }),
  'las direcciones de curso no deben compartir audio anticipado',
);

const missingAudioKey = makeAudioPrefetchKey({ ...audioBase, text: 'missing' });
setPrefetchedAudio(missingAudioKey, null);
assert.equal(hasAudioPrefetchEntry(missingAudioKey), true);
assert.equal(getPrefetchedAudio(missingAudioKey), null);

deletePrefetchedAudio(missingAudioKey);
assert.equal(hasAudioPrefetchEntry(missingAudioKey), false);

clearPrefetchedAudio();
assert.equal(hasAudioPrefetchEntry(audioKey), false);

console.log('✅ test-media-prefetch-cache: todos los asserts pasaron');
