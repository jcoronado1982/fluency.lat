import assert from 'node:assert/strict';
import {
  applyLearnedStatus,
  computeFilteredAfterLearn,
  computeNextIndex,
  getGroupLearnedCards,
  resolveResumeCardIndex,
  resetGroupInDeck,
  updateCardImageInDeck,
  removeDefinitionFromDeck,
} from '../src/modules/flashcards/useCases/deckSessionUseCases.js';

const deck = [
  { id: 0, learned: false, group_name: 'A', definitions: [{ imagePath: null }, { imagePath: null }] },
  { id: 1, learned: false, group_name: 'A', definitions: [{ imagePath: '/img/old.avif' }] },
  { id: 2, learned: true, definitions: [{ imagePath: null }] }, // sin group_name ⇒ 'General'
];

// updateCardImageInDeck (v1): solo toca la definición pedida de la tarjeta pedida
const withImage = updateCardImageInDeck(deck, 0, '/img/new.avif', 1);
assert.equal(withImage[0].definitions[1].imagePath, '/img/new.avif');
assert.equal(withImage[0].definitions[0].imagePath, null);
assert.equal(withImage[1].definitions[0].imagePath, '/img/old.avif');
// Inmutable: el deck original no cambia
assert.equal(deck[0].definitions[1].imagePath, null);
// defIndex fuera de rango: no rompe ni altera nada
const outOfRange = updateCardImageInDeck(deck, 0, '/img/x.avif', 9);
assert.deepEqual(outOfRange[0].definitions.map((d) => d.imagePath), [null, null]);

// updateCardImageInDeck (v2/v3): escribe en el bloque irregular correcto
const irregularDeck = [{
  id: 0,
  definitions: [],
  irregular: {
    past: { definitions: [{ imagePath: null }] },
    participle: { usage_example: 'done' }, // sin definitions ⇒ imagePath directo
  },
}];
const v2 = updateCardImageInDeck(irregularDeck, 0, '/img/past.avif', 0, 'v2');
assert.equal(v2[0].irregular.past.definitions[0].imagePath, '/img/past.avif');
const v3 = updateCardImageInDeck(irregularDeck, 0, '/img/part.avif', 0, 'v3');
assert.equal(v3[0].irregular.participle.imagePath, '/img/part.avif');

// removeDefinitionFromDeck (v1): borra solo la definición pedida de la tarjeta pedida
const twoDefsDeck = [
  { id: 0, definitions: [{ meaning: 'correr' }, { meaning: 'dirigir' }] },
  { id: 1, definitions: [{ meaning: 'otra' }] },
];
const withoutFirst = removeDefinitionFromDeck(twoDefsDeck, 0, 0);
assert.deepEqual(withoutFirst[0].definitions.map((d) => d.meaning), ['dirigir']);
assert.deepEqual(withoutFirst[1].definitions.map((d) => d.meaning), ['otra']);
// Inmutable: el deck original no cambia
assert.equal(twoDefsDeck[0].definitions.length, 2);
// defIndex fuera de rango: no rompe ni altera nada
const removeOutOfRange = removeDefinitionFromDeck(twoDefsDeck, 0, 9);
assert.equal(removeOutOfRange[0].definitions.length, 2);

// removeDefinitionFromDeck (v2/v3): borra en el bloque irregular correcto
const irregularForDelete = [{
  id: 0,
  definitions: [],
  irregular: {
    past: { definitions: [{ meaning: 'a' }, { meaning: 'b' }] },
    participle: { definitions: [{ meaning: 'c' }] },
  },
}];
const removedV2 = removeDefinitionFromDeck(irregularForDelete, 0, 0, 'v2');
assert.deepEqual(removedV2[0].irregular.past.definitions.map((d) => d.meaning), ['b']);
const removedV3 = removeDefinitionFromDeck(irregularForDelete, 0, 0, 'v3');
assert.deepEqual(removedV3[0].irregular.participle.definitions.map((d) => d.meaning), []);

// applyLearnedStatus: cambia solo la tarjeta indicada
const learned = applyLearnedStatus(deck, 1, true);
assert.equal(learned[1].learned, true);
assert.equal(learned[0].learned, false);

// getGroupLearnedCards / resetGroupInDeck: group_name ausente cuenta como 'General'
assert.deepEqual(getGroupLearnedCards(deck, 'General').map((c) => c.id), [2]);
assert.deepEqual(getGroupLearnedCards(deck, 'A').map((c) => c.id), []);
const reset = resetGroupInDeck(deck, 'General');
assert.equal(reset[2].learned, false);
assert.equal(reset[0].learned, false); // grupo A intacto (ya era false)

// computeFilteredAfterLearn: marca, filtra restantes y detecta deck completado
const twoCards = [
  { id: 0, learned: false },
  { id: 1, learned: true },
];
const afterLearn = computeFilteredAfterLearn(twoCards, 0, null);
assert.equal(afterLearn.completed, true);
assert.equal(afterLearn.remaining.length, 0);
assert.equal(afterLearn.updated[0].learned, true);

const threeCards = [
  { id: 0, learned: false },
  { id: 1, learned: false },
];
const partial = computeFilteredAfterLearn(threeCards, 0, null);
assert.equal(partial.completed, false);
assert.deepEqual(partial.remaining.map((c) => c.id), [1]);

// computeNextIndex: mantiene posición si sigue en rango; retrocede al final si no
assert.equal(computeNextIndex(1, 3), 1);
assert.equal(computeNextIndex(2, 2), 1);  // se aprendió la última ⇒ apunta a la nueva última
assert.equal(computeNextIndex(0, 0), 0);  // deck vacío no da índice negativo

// La identidad semántica gana a un id posicional obsoleto tras reordenar el catálogo.
const reordered = [
  { id: 0, name: 'hand' },
  { id: 1, name: 'eye' },
];
assert.equal(resolveResumeCardIndex(reordered, {
  cardId: 1,
  cardIndex: 1,
  cardWord: 'hand',
}), 0);
// Si no hay identidad guardada, conserva compatibilidad con id e índice.
assert.equal(resolveResumeCardIndex(reordered, { cardId: 1 }), 1);
assert.equal(resolveResumeCardIndex(reordered, { cardIndex: 99 }), 1);

console.log('✅ test-deck-session-use-cases: todos los asserts pasaron');
