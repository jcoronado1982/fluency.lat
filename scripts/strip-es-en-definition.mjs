// Complemento de renumber-es-en-deck.mjs para el mismo tipo de problema pero
// a nivel de UNA tarjeta: borra una `definitions[n]` redundante (misma
// duplicación posicional de imagen que a nivel de tarjeta, pero aquí es
// `_defN` en vez de `_cardN`) y renumera las definiciones que quedan de esa
// misma tarjeta. No toca ninguna otra tarjeta del archivo.
//
// Uso: node scripts/strip-es-en-definition.mjs <archivo.json> <posicionTarjeta> <defIndexABorrar>
//   node scripts/strip-es-en-definition.mjs pronouns/1-basic/quantifier_pronouns.json 1 0

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const jsonRoot = path.join(repoRoot, 'json', 'es_en');
const imagesRoot = path.join(repoRoot, 'card_images');

const [, , relativeFileArg, cardPositionArg, defIndexArg] = process.argv;
if (!relativeFileArg || cardPositionArg === undefined || defIndexArg === undefined) {
    console.error('Uso: node scripts/strip-es-en-definition.mjs <archivo.json> <posicionTarjeta> <defIndexABorrar>');
    process.exit(1);
}

const cardPosition = Number(cardPositionArg);
const removeDefIndex = Number(defIndexArg);
const absJsonPath = path.join(jsonRoot, relativeFileArg);
const [category, level, fileName] = relativeFileArg.split('/');
const deckBasename = fileName.replace(/\.json$/, '');
const deckFilePrefix = `${level}_${deckBasename}`;
const imagesDir = path.join(imagesRoot, category, level, deckBasename);

const data = JSON.parse(fs.readFileSync(absJsonPath, 'utf8'));
const card = data[cardPosition];
if (!card) {
    console.error(`No existe tarjeta en la posición ${cardPosition} (archivo tiene ${data.length})`);
    process.exit(1);
}
const definitions = card.definitions || [];
if (removeDefIndex < 0 || removeDefIndex >= definitions.length) {
    console.error(`defIndex fuera de rango: ${removeDefIndex} (la tarjeta tiene ${definitions.length} definiciones)`);
    process.exit(1);
}

const oldToNew = new Map();
let shift = 0;
definitions.forEach((_, oldIndex) => {
    if (oldIndex === removeDefIndex) {
        shift += 1;
        return;
    }
    oldToNew.set(oldIndex, oldIndex - shift);
});

const removedMeaning = definitions[removeDefIndex].meaning;

// Renombrar imágenes de esta tarjeta (solo defN, mismo cardPosition) a temporal y luego al nuevo nombre.
const moves = [];
if (fs.existsSync(imagesDir)) {
    const cardFileRe = new RegExp(`^${deckFilePrefix}_card_${cardPosition}_def(\\d+)(.*)\\.avif$`);
    for (const file of fs.readdirSync(imagesDir)) {
        const match = file.match(cardFileRe);
        if (!match) continue;
        const oldDefIndex = Number(match[1]);
        if (oldDefIndex === removeDefIndex) continue; // imagen de la definición borrada: queda huérfana
        const newDefIndex = oldToNew.get(oldDefIndex);
        if (newDefIndex === undefined || newDefIndex === oldDefIndex) continue;
        const suffix = match[2];
        const newFile = `${deckFilePrefix}_card_${cardPosition}_def${newDefIndex}${suffix}.avif`;
        moves.push({
            from: path.join(imagesDir, file),
            to: path.join(imagesDir, newFile),
            tmp: path.join(imagesDir, `.migrating-${file}`),
        });
    }
}
for (const move of moves) fs.renameSync(move.from, move.tmp);
for (const move of moves) fs.renameSync(move.tmp, move.to);

const imagePathRe = new RegExp(`(${deckFilePrefix}_card_${cardPosition}_def)(\\d+)(.*)`);
const newDefinitions = [];
definitions.forEach((definition, oldIndex) => {
    if (oldIndex === removeDefIndex) return;
    const newIndex = oldToNew.get(oldIndex);
    if (typeof definition.imagePath === 'string') {
        definition.imagePath = definition.imagePath.replace(
            imagePathRe,
            (_match, prefix, _oldIdx, suffix) => `${prefix}${newIndex}${suffix}`,
        );
    }
    newDefinitions.push(definition);
});
card.definitions = newDefinitions;

fs.writeFileSync(absJsonPath, `${JSON.stringify(data, null, 2)}\n`);

console.log(JSON.stringify({
    file: relativeFileArg,
    cardName: card.name,
    cardPosition,
    removedDefinition: removedMeaning,
    remainingDefinitions: newDefinitions.length,
    imagesRenamed: moves.length,
}, null, 2));
