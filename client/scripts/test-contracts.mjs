import assert from 'node:assert/strict';
import {
  LANDING_DEMO_CARD_LIMIT,
  LANDING_DEMO_CATEGORY,
  LANDING_DEMO_DECK,
  buildLandingDemoImagePath,
  isLandingDemoCategory,
} from '../src/contracts/landingDemoNamespace.js';
import {
  LANDING_DEMO_MEDIA,
  STUDY_MEDIA_VARIANT_APP,
  STUDY_MEDIA_VARIANT_LANDING_DEMO,
  isLandingDemoMediaVariant,
  resolveStudyMediaNamespace,
} from '../src/contracts/studyMediaVariants.js';
import { buildGlobalImageStoragePath } from '../src/components/flashcardStudy/features/imageStorageIdentity.js';
import { normalizeCardImageUrl } from '../src/utils/mediaUrl.js';
import { createFlashcardHttpAdapter } from '../src/modules/flashcards/adapters/flashcardHttpAdapter.js';
import { formatDeckCategoryName, getDeckCategoryName, sortDeckNames } from '../src/contracts/deckOrder.js';
import { DECK_GROUP_TRANSLATIONS_ES } from '../src/contracts/deckGroupTranslations.js';

// Estos valores son CONTRATO entre módulos y con el backend (mod_flashcards
// enruta proveedores TTS/imagen por category): si cambian, debe ser a propósito.
assert.equal(LANDING_DEMO_CATEGORY, 'landing-demo');
assert.equal(LANDING_DEMO_DECK, 'verbs-essentials');
assert.equal(typeof LANDING_DEMO_CARD_LIMIT, 'number');
assert.ok(LANDING_DEMO_CARD_LIMIT > 0);

assert.equal(isLandingDemoCategory('landing-demo'), true);
assert.equal(isLandingDemoCategory('verbs'), false);
assert.equal(isLandingDemoCategory(undefined), false);

// Ruta de imagen del demo: formato exacto que el backend escribe en disco
assert.equal(
  buildLandingDemoImagePath(0, 0),
  '/card_images/landing-demo/verbs-essentials/verbs-essentials_card_0_def0.avif',
);
// v1 no lleva sufijo; otras formas sí
assert.equal(buildLandingDemoImagePath(2, 1, 'v1'), buildLandingDemoImagePath(2, 1));
assert.equal(
  buildLandingDemoImagePath(2, 1, 'v2'),
  '/card_images/landing-demo/verbs-essentials/verbs-essentials_card_2_def1_v2.avif',
);

// Variantes de media del kit de estudio
assert.equal(STUDY_MEDIA_VARIANT_APP, 'app');
assert.equal(STUDY_MEDIA_VARIANT_LANDING_DEMO, 'landing-demo');
assert.equal(isLandingDemoMediaVariant(STUDY_MEDIA_VARIANT_LANDING_DEMO), true);
assert.equal(isLandingDemoMediaVariant(STUDY_MEDIA_VARIANT_APP), false);

// LANDING_DEMO_MEDIA está congelado y coherente con el namespace
assert.ok(Object.isFrozen(LANDING_DEMO_MEDIA));
assert.equal(LANDING_DEMO_MEDIA.category, LANDING_DEMO_CATEGORY);
assert.equal(LANDING_DEMO_MEDIA.deck, LANDING_DEMO_DECK);

// resolveStudyMediaNamespace: el demo fuerza su namespace; la app usa el contexto
assert.deepEqual(
  resolveStudyMediaNamespace(STUDY_MEDIA_VARIANT_LANDING_DEMO, 'verbs', '1-basic'),
  { category: LANDING_DEMO_CATEGORY, deck: LANDING_DEMO_DECK },
);

assert.equal(
  buildGlobalImageStoragePath({
    category: 'verbs',
    deck: '1-basic/action',
    index: 4,
    defIndex: 1,
    form: 'v1',
    courseDirection: 'es_en',
  }),
  '/card_images/verbs/1-basic/action/1-basic_action_card_4_def1.avif',
);
assert.equal(
  buildGlobalImageStoragePath({
    category: LANDING_DEMO_CATEGORY,
    deck: LANDING_DEMO_DECK,
    index: 0,
    defIndex: 0,
    courseDirection: 'es_en',
  }),
  '/card_images/landing-demo/verbs-essentials/verbs-essentials_card_0_def0.avif',
);
assert.deepEqual(
  resolveStudyMediaNamespace(STUDY_MEDIA_VARIANT_APP, 'verbs', '1-basic/action'),
  { category: 'verbs', deck: '1-basic/action' },
);

// El cache-buster es contrato: normalizar formatos legacy nunca puede borrar ?v=.
assert.equal(
  normalizeCardImageUrl('/card_images/verbs/card.png?v=abc123'),
  '/card_images/verbs/card.avif?v=abc123',
);
assert.equal(
  normalizeCardImageUrl('https://cdn.test/card_images/card.webp?v=7#preview'),
  'https://cdn.test/card_images/card.avif?v=7#preview',
);
assert.equal(
  normalizeCardImageUrl('/unrelated/file.png?v=keep'),
  '/unrelated/file.png?v=keep',
);

// El reset de un bloque debe conservar el alcance exacto usuario/categoría/deck.
// En particular, no puede enviar scope=category porque borraría los otros tópicos.
const requests = [];
const flashcardAdapter = createFlashcardHttpAdapter({
  post: async (url, body) => {
    requests.push({ url, body });
    return { success: true };
  },
});
await flashcardAdapter.resetDeckStatus(
  'student@example.com',
  'verbs',
  '1-basic/actions',
  'en_es',
);
assert.deepEqual(requests, [{
  url: '/api/reset-all',
  body: {
    user_id: 'student@example.com',
    category: 'verbs',
    deck: '1-basic/actions',
    confirm: true,
    course_direction: 'en_es',
  },
}]);

// contracts/deckOrder.js: formatDeckCategoryName debe ser pura (sin i18n propio) — cada
// módulo (flashcards, dashboard) inyecta su propio diccionario de traducción. Fija el
// contrato usado para desacoplar dashboard→flashcards (client/CLAUDE.md §9, deuda #6).
assert.equal(getDeckCategoryName('1-basic/being_state.json'), 'being_state');
assert.equal(formatDeckCategoryName('1-basic/being_state.json'), 'Being State');
assert.equal(
  formatDeckCategoryName('1-basic/being_state.json', DECK_GROUP_TRANSLATIONS_ES),
  'Ser y Estado',
);
assert.equal(
  formatDeckCategoryName('1-basic/unknown_slug.json', DECK_GROUP_TRANSLATIONS_ES),
  'Unknown Slug',
  'sin traducción conocida, cae al label formateado desde el slug',
);
assert.deepEqual(
  sortDeckNames(['3-advanced.json', '1-basic.json', '2-intermediate.json']),
  ['1-basic', '2-intermediate', '3-advanced'],
);

console.log('✅ test-contracts: todos los asserts pasaron');
