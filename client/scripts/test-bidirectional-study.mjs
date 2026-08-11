import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCardTitle,
  getCleanSpanishTerm,
  getDefinitionStudyTerm,
  getMeaningConnector,
  getReferenceExampleText,
  getReferenceMeaning,
  getStudyExampleText,
} from '../src/components/flashcardStudy/features/cardLanguageUtils.js';
import { parseCardImageStorageIdentity } from '../src/components/flashcardStudy/features/imageStorageIdentity.js';

const englishTargetDefinition = {
  meaning: 'Electrodoméstico',
  usage_example: 'The kitchen has new appliances.',
  usage_example_es: 'La cocina tiene electrodomésticos nuevos.',
};
assert.equal(getMeaningConnector('en'), 'means');
assert.equal(getReferenceMeaning(englishTargetDefinition), 'Electrodoméstico');
assert.equal(getStudyExampleText(englishTargetDefinition, 'en'), 'The kitchen has new appliances.');
assert.equal(getReferenceExampleText(englishTargetDefinition, 'en'), 'La cocina tiene electrodomésticos nuevos.');

const spanishTargetDefinition = {
  meaning: 'appliance',
  target_meaning_es: 'Electrodoméstico',
  usage_example: 'La cocina tiene electrodomésticos nuevos.',
  usage_example_es: 'The kitchen has new appliances.',
};
assert.equal(getMeaningConnector('es'), 'significa');
assert.equal(getReferenceMeaning(spanishTargetDefinition), 'appliance');
assert.equal(getStudyExampleText(spanishTargetDefinition, 'es'), 'La cocina tiene electrodomésticos nuevos.');
assert.equal(getReferenceExampleText(spanishTargetDefinition, 'es'), 'The kitchen has new appliances.');
assert.equal(getDefinitionStudyTerm(spanishTargetDefinition, 'Aparato', 'es'), 'Electrodoméstico');
assert.equal(getDefinitionStudyTerm(spanishTargetDefinition, 'Aparato', 'en'), 'Aparato');
assert.equal(getDefinitionStudyTerm({ meaning: 'appliance' }, 'Aparato', 'es'), 'Aparato');
assert.equal(getCardTitle({ name: 'Vivir (residir)' }, 'es'), 'Vivir');
assert.equal(getCardTitle({ name: 'Live (reside)' }, 'en'), 'Live (reside)');
assert.equal(getCleanSpanishTerm('Facturar (equipaje) / Pagar (la cuenta)'), 'Facturar / Pagar');
assert.equal(getCleanSpanishTerm('Suficiente(s)'), 'Suficiente');

const actionCards = JSON.parse(readFileSync(
  new URL('../../json/en_es/verbs/1-basic/action.json', import.meta.url),
  'utf8',
));
const sleepCard = actionCards.find((card) => card.definitions?.some((definition) => (
  definition.usage_example_es === 'This tent sleeps four people.'
)));
const accommodateDefinition = sleepCard?.definitions.find((definition) => (
  definition.usage_example_es === 'This tent sleeps four people.'
));
assert.ok(sleepCard, 'Debe existir la tarjeta real de sleep en el catálogo en_es');
assert.equal(
  getDefinitionStudyTerm(accommodateDefinition, sleepCard.name, 'es'),
  'Alojar',
);
assert.notEqual(
  getDefinitionStudyTerm(accommodateDefinition, sleepCard.name, 'es'),
  sleepCard.name,
  'Una acepción secundaria no debe reutilizar una traducción española incorrecta',
);

const beingStateCards = JSON.parse(readFileSync(
  new URL('../../json/en_es/verbs/1-basic/being_state.json', import.meta.url),
  'utf8',
));
const liveCard = beingStateCards.find((card) => card.definitions?.some((definition) => (
  definition.meaning === 'live'
)));
assert.equal(liveCard?.name, 'Vivir');
assert.equal(liveCard?.definitions[0]?.target_meaning_es, 'Vivir');

const enEsCatalogRoot = fileURLToPath(new URL('../../json/en_es/', import.meta.url));
const collectJsonFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap(
  (entry) => entry.isDirectory()
    ? collectJsonFiles(path.join(directory, entry.name))
    : entry.name.endsWith('.json') ? [path.join(directory, entry.name)] : [],
);

for (const jsonFile of collectJsonFiles(enEsCatalogRoot)) {
  const cards = JSON.parse(readFileSync(jsonFile, 'utf8'));
  for (const card of cards) {
    assert.doesNotMatch(getCardTitle(card, 'es'), /[()]/);
    for (const definition of card.definitions || []) {
      assert.doesNotMatch(
        getDefinitionStudyTerm(definition, getCardTitle(card, 'es'), 'es'),
        /[()]/,
      );
    }
  }
}

assert.deepEqual(
  parseCardImageStorageIdentity('/card_images/adverbs/1-basic/manner/manner_card_11_def0.avif'),
  { category: 'adverbs', deck: '1-basic/manner', index: 11, defIndex: 0, form: 'v1' },
);
assert.deepEqual(
  parseCardImageStorageIdentity('/card_images/users/u123/verbs/1-basic/action/action_card_4_def1_v2.avif?v=7'),
  { category: 'verbs', deck: '1-basic/action', index: 4, defIndex: 1, form: 'v2' },
);
assert.deepEqual(
  parseCardImageStorageIdentity('/card_images/es_en/verbs/1-basic/action/action_card_4_def1.avif'),
  { category: 'verbs', deck: '1-basic/action', courseDirection: 'es_en', index: 4, defIndex: 1, form: 'v1' },
);
assert.deepEqual(
  parseCardImageStorageIdentity('/card_images/users/u123/en_es/verbs/1-basic/action/action_card_4_def1_v2.avif'),
  { category: 'verbs', deck: '1-basic/action', courseDirection: 'en_es', index: 4, defIndex: 1, form: 'v2' },
);

console.log('bidirectionalStudy: OK');
