import assert from 'node:assert/strict';

// resolvePersistedChoice lee localStorage dentro de la función: shim mínimo
// ANTES de importar el módulo (Node no trae localStorage).
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const {
  filterUnlearned,
  getCourseDirectionFromStudyLanguage,
  getDeckCategoryName,
  getLevelFromDeckName,
  normalizeCard,
  normalizeDeckResponse,
  parseCategoriesResponse,
  resolvePersistedChoice,
  sortDeckNames,
  usesNestedLevelDecks,
} = await import('../src/modules/flashcards/useCases/deckUseCases.js');

// Dirección del curso: estudiar 'es' ⇒ en_es; cualquier otra cosa ⇒ es_en (default)
assert.equal(getCourseDirectionFromStudyLanguage('es'), 'en_es');
assert.equal(getCourseDirectionFromStudyLanguage('en'), 'es_en');
assert.equal(getCourseDirectionFromStudyLanguage(undefined), 'es_en');

// Nivel a partir del nombre del deck (fallback: basic)
assert.equal(getLevelFromDeckName('1-basic/action'), 'basic');
assert.equal(getLevelFromDeckName('2-intermediate'), 'intermediate');
assert.equal(getLevelFromDeckName('3-advanced/foo'), 'advanced');
assert.equal(getLevelFromDeckName(null), 'basic');
assert.equal(getLevelFromDeckName('cualquier-cosa'), 'basic');

// Nombre de categoría del deck (con y sin nivel anidado, con y sin .json)
assert.equal(getDeckCategoryName('1-basic/action.json'), 'action');
assert.equal(getDeckCategoryName('1-basic.json'), '1-basic');
assert.equal(getDeckCategoryName(''), '');

// normalizeCard: id posicional, learned false por defecto, imagePath null si falta
const card = normalizeCard({ definitions: [{ meaning: 'x' }], extra: { hint: 'h' } }, 7);
assert.equal(card.id, 7);
assert.equal(card.learned, false);
assert.equal(card.hint, 'h');
assert.equal(card.definitions[0].imagePath, null);

// normalizeCard: bloque irregular sin array definitions se sintetiza desde usage_example
const irregularCard = normalizeCard({
  definitions: [],
  irregular: { past: { usage_example: 'went home', meaning: 'ir' } },
}, 0);
assert.equal(irregularCard.irregular.past.definitions.length, 1);
assert.equal(irregularCard.irregular.past.definitions[0].usage_example, 'went home');
assert.equal(irregularCard.irregular.past.definitions[0].imagePath, null);

// normalizeDeckResponse acepta array directo, {flashcards: []} y objeto suelto
assert.equal(normalizeDeckResponse([{ definitions: [] }, { definitions: [] }]).length, 2);
assert.equal(normalizeDeckResponse({ flashcards: [{ definitions: [] }] }).length, 1);
assert.equal(normalizeDeckResponse({ definitions: [] }).length, 1);
// Los ids son posicionales
assert.deepEqual(
  normalizeDeckResponse([{ definitions: [] }, { definitions: [] }]).map((c) => c.id),
  [0, 1],
);

// filterUnlearned: descarta aprendidas y respeta el filtro de grupo
const cards = [
  { id: 0, learned: false, group_name: 'A' },
  { id: 1, learned: true, group_name: 'A' },
  { id: 2, learned: false, group_name: 'B' },
];
assert.deepEqual(filterUnlearned(cards).map((c) => c.id), [0, 2]);
assert.deepEqual(filterUnlearned(cards, 'A').map((c) => c.id), [0]);

// parseCategoriesResponse: acepta array plano u objeto {success, categories},
// excluye landing-demo y arma totales solo para objetos con name
const parsedFlat = parseCategoriesResponse(['verbs', 'landing-demo', 'nouns']);
assert.deepEqual(parsedFlat.names, ['verbs', 'nouns']);
const parsedRich = parseCategoriesResponse({
  success: true,
  categories: [{ name: 'verbs', total: 10 }, { name: 'landing-demo', total: 5 }],
});
assert.deepEqual(parsedRich.names, ['verbs']);
assert.deepEqual(parsedRich.totals, { verbs: 10 });
assert.deepEqual(parseCategoriesResponse(null), { names: [], totals: {} });

// sortDeckNames: ordena por nivel (basic < intermediate < advanced) y quita .json
assert.deepEqual(
  sortDeckNames(['3-advanced.json', '1-basic.json', '2-intermediate.json']),
  ['1-basic', '2-intermediate', '3-advanced'],
);

// usesNestedLevelDecks: verbs/nouns anidan; landing-demo no
assert.equal(usesNestedLevelDecks('verbs'), true);
assert.equal(usesNestedLevelDecks('landing-demo'), false);

// resolvePersistedChoice: usa lo guardado solo si sigue siendo una opción válida
storage.set('k', 'b');
assert.equal(resolvePersistedChoice('k', ['a', 'b'], 'a'), 'b');
storage.set('k', 'zz');
assert.equal(resolvePersistedChoice('k', ['a', 'b'], 'a'), 'a');
storage.delete('k');
assert.equal(resolvePersistedChoice('k', ['a', 'b'], 'a'), 'a');

console.log('✅ test-deck-use-cases: todos los asserts pasaron');
