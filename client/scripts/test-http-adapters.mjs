import assert from 'node:assert/strict';
import { createFlashcardHttpAdapter } from '../src/modules/flashcards/adapters/flashcardHttpAdapter.js';
import { createSrsHttpAdapter } from '../src/modules/flashcards/adapters/srsHttpAdapter.js';
import { createDeckPreviewHttpAdapter } from '../src/modules/dashboard/adapters/deckPreviewHttpAdapter.js';
import { createLearningStatsHttpAdapter } from '../src/modules/dashboard/adapters/learningStatsHttpAdapter.js';
import { createReviewSuggestionHttpAdapter } from '../src/modules/dashboard/adapters/reviewSuggestionHttpAdapter.js';
import { createCheckoutHttpAdapter } from '../src/modules/pricing/adapters/checkoutHttpAdapter.js';

// Fija el contrato HTTP (método + URL + body) de cada adapter de módulo — el único
// lugar de cada capa que debe conocer rutas de API. Sin estos tests, un typo en una
// URL o un cambio accidental de query param solo se detectaría en producción.

function fakeHttp() {
  const calls = [];
  return {
    calls,
    get: async (url) => { calls.push({ method: 'GET', url }); return { ok: true, url }; },
    post: async (url, body) => { calls.push({ method: 'POST', url, body }); return { ok: true, url, body }; },
    delete: async (url, body) => { calls.push({ method: 'DELETE', url, body }); return { ok: true, url, body }; },
  };
}

// --- flashcardHttpAdapter -----------------------------------------------------

{
  const http = fakeHttp();
  const adapter = createFlashcardHttpAdapter(http);

  await adapter.fetchCategories('en_es');
  assert.equal(http.calls.at(-1).url, '/api/categories?course_direction=en_es&include_counts=true');

  await adapter.fetchCategories('invalid-direction');
  assert.equal(
    http.calls.at(-1).url,
    '/api/categories?course_direction=es_en&include_counts=true',
    'direcciones desconocidas caen a es_en por defecto',
  );

  await adapter.fetchDecksForCategory('verbs', 'es_de');
  assert.equal(
    http.calls.at(-1).url,
    '/api/available-flashcards-files?category=verbs&course_direction=es_de',
  );

  await adapter.fetchDeckSummaries('nouns');
  assert.equal(http.calls.at(-1).url, '/api/deck-summaries?category=nouns&course_direction=es_en');

  await adapter.fetchDeckData('u1', 'verbs', '1-basic/action', 'en_es');
  assert.equal(
    http.calls.at(-1).url,
    '/api/flashcards-data?user_id=u1&category=verbs&deck=1-basic%2Faction&course_direction=en_es',
  );

  await adapter.updateCardStatus('u1', 'verbs', '1-basic/action', 3, true, 'en_es');
  assert.deepEqual(http.calls.at(-1), {
    method: 'POST',
    url: '/api/update-status',
    body: { user_id: 'u1', category: 'verbs', deck: '1-basic/action', index: 3, learned: true, course_direction: 'en_es' },
  });

  await adapter.updateCardsBatch('u1', 'verbs', '1-basic/action', [{ index: 0, learned: true }]);
  assert.deepEqual(http.calls.at(-1), {
    method: 'POST',
    url: '/api/update-batch',
    body: { user_id: 'u1', category: 'verbs', deck: '1-basic/action', cards: [{ index: 0, learned: true }], course_direction: 'es_en' },
  });

  await adapter.resetCategoryStatus('u1', 'verbs');
  assert.deepEqual(http.calls.at(-1).body, {
    user_id: 'u1', category: 'verbs', deck: '*', scope: 'category', confirm: true, course_direction: 'es_en',
  });

  await adapter.fetchLearningStats('en_es');
  assert.equal(http.calls.at(-1).url, '/api/learning-stats?course_direction=en_es');

  await adapter.touchStudyDay();
  assert.deepEqual(http.calls.at(-1), { method: 'POST', url: '/api/study/touch', body: undefined });

  await adapter.fetchPhonicsData();
  assert.equal(http.calls.at(-1).url, '/api/phonics-data');

  await adapter.deleteDefinition({ category: 'verbs', deck: '1-basic/action', index: 3, defIndex: 1, form: 'v1', courseDirection: 'en_es' });
  assert.deepEqual(http.calls.at(-1), {
    method: 'DELETE',
    url: '/api/delete-definition',
    body: { category: 'verbs', deck: '1-basic/action', index: 3, def_index: 1, form: 'v1', course_direction: 'en_es' },
  });

  console.log('✅ flashcardHttpAdapter: contrato HTTP verificado');
}

// --- srsHttpAdapter ------------------------------------------------------------

{
  const http = fakeHttp();
  const adapter = createSrsHttpAdapter(http);

  await adapter.fetchDueCards('es_de');
  assert.equal(http.calls.at(-1).url, '/api/srs/due?course_direction=es_de');

  await adapter.fetchDueCards();
  assert.equal(http.calls.at(-1).url, '/api/srs/due?course_direction=es_en', 'default es es_en');

  console.log('✅ srsHttpAdapter: contrato HTTP verificado');
}

// --- dashboard: deckPreviewHttpAdapter ------------------------------------------

{
  const http = fakeHttp();
  const adapter = createDeckPreviewHttpAdapter(http);

  await adapter.fetchDeckData('u1', 'verbs', '1-basic/action.json', 'en_es');
  assert.equal(
    http.calls.at(-1).url,
    '/api/flashcards-data?user_id=u1&category=verbs&deck=1-basic%2Faction&course_direction=en_es',
    'la extensión .json se recorta antes de mandarla al backend',
  );

  assert.equal(
    adapter.normalizeImagePath('/card_images/verbs/action.webp?v=3'),
    '/card_images/verbs/action.avif?v=3',
  );

  console.log('✅ dashboard/deckPreviewHttpAdapter: contrato HTTP verificado');
}

// --- dashboard: learningStatsHttpAdapter ----------------------------------------

{
  const http = fakeHttp();
  const adapter = createLearningStatsHttpAdapter(http);

  await adapter.fetchLearningStats('en_es');
  assert.equal(http.calls.at(-1).url, '/api/learning-stats?course_direction=en_es');

  await adapter.touchStudyDay();
  assert.equal(http.calls.at(-1).url, '/api/study/touch');

  console.log('✅ dashboard/learningStatsHttpAdapter: contrato HTTP verificado');
}

// --- dashboard: reviewSuggestionHttpAdapter -------------------------------------

{
  const http = fakeHttp();
  const adapter = createReviewSuggestionHttpAdapter(http);

  await adapter.fetchDueCards('es_en', 10);
  assert.equal(http.calls.at(-1).url, '/api/srs/due?course_direction=es_en&limit=10');

  await adapter.fetchDueCards('es_en', 999_999);
  assert.equal(
    http.calls.at(-1).url,
    '/api/srs/due?course_direction=es_en&limit=5000',
    'el límite se recorta a 5000 aunque pidan más',
  );

  await adapter.fetchDueCards('es_en', -5);
  assert.equal(
    http.calls.at(-1).url,
    '/api/srs/due?course_direction=es_en&limit=1',
    'el límite nunca baja de 1',
  );

  console.log('✅ dashboard/reviewSuggestionHttpAdapter: contrato HTTP verificado');
}

// --- pricing: checkoutHttpAdapter ------------------------------------------------

{
  const http = fakeHttp();
  const adapter = createCheckoutHttpAdapter(http);

  const result = await adapter.createCheckoutSession('annual');
  assert.deepEqual(http.calls.at(-1), {
    method: 'POST',
    url: '/api/checkout/session',
    body: { plan: 'annual' },
  });
  assert.deepEqual(result, { ok: true, url: '/api/checkout/session', body: { plan: 'annual' } });

  console.log('✅ pricing/checkoutHttpAdapter: contrato HTTP verificado');
}

console.log('✅ test-http-adapters: todos los asserts pasaron');
