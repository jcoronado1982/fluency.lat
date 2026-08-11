// Herramienta de uso puntual para la pasada dedicada de
// docs/ES_EN_VOCAB_CONSISTENCY_AUDIT.md §6 ("Renumeración segura"). Borra
// tarjetas de un mazo es_en y renumera/renombra las imágenes de las tarjetas
// que quedan, para que su posición en el array siga coincidiendo con el
// nombre de archivo que el backend espera
// (`global_image_base` en backend/mod_flashcards/src/image_use_cases.rs
// arma la ruta desde {categoria}/{deck}_card_{index}_def{n} usando la
// posición ACTUAL del array, no un id estable).
//
// El audio NO se toca: su nombre de archivo depende del contenido del texto
// (ver `legacy_audio_prefixes` en audio_use_cases.rs), no de la posición, así
// que no se ve afectado por esta renumeración.
//
// No toca SurrealDB (card_progress también está indexado por posición) — si
// estos mazos ya tienen progreso de usuarios reales en producción, esa tabla
// queda desalineada para las tarjetas que cambiaron de posición hasta que se
// sincronice una migración aparte; ver nota en el informe.
//
// Uso: node scripts/renumber-es-en-deck.mjs <archivo.json relativo a json/es_en> <posicion,posicion,...>
//   node scripts/renumber-es-en-deck.mjs nouns/2-intermediate/health.json 0,3,4

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const jsonRoot = path.join(repoRoot, 'json', 'es_en');
const imagesRoot = path.join(repoRoot, 'card_images');

const [, , relativeFileArg, positionsArg] = process.argv;
if (!relativeFileArg || !positionsArg) {
    console.error('Uso: node scripts/renumber-es-en-deck.mjs <archivo.json> <posiciones separadas por coma>');
    process.exit(1);
}

const removePositions = new Set(positionsArg.split(',').map((value) => Number(value.trim())));
const absJsonPath = path.join(jsonRoot, relativeFileArg);
const [category, level, fileName] = relativeFileArg.split('/');
const deckBasename = fileName.replace(/\.json$/, '');
const deckFilePrefix = `${level}_${deckBasename}`;
const imagesDir = path.join(imagesRoot, category, level, deckBasename);

const data = JSON.parse(fs.readFileSync(absJsonPath, 'utf8'));

for (const position of removePositions) {
    if (position < 0 || position >= data.length) {
        console.error(`Posición fuera de rango: ${position} (el archivo tiene ${data.length} tarjetas)`);
        process.exit(1);
    }
}

// Mapa oldIndex -> newIndex para las tarjetas que se conservan.
const oldToNew = new Map();
let shift = 0;
data.forEach((_, oldIndex) => {
    if (removePositions.has(oldIndex)) {
        shift += 1;
        return;
    }
    oldToNew.set(oldIndex, oldIndex - shift);
});

const removedNames = [...removePositions].sort((a, b) => a - b).map((pos) => data[pos].name);

// --- Paso 1: renombrar imágenes a nombres temporales (evita colisiones) ---
const moves = []; // { from, to }
if (fs.existsSync(imagesDir)) {
    const filesOnDisk = fs.readdirSync(imagesDir);
    const cardFileRe = new RegExp(`^${deckFilePrefix}_card_(\\d+)_def(\\d+)(.*)\\.avif$`);
    for (const file of filesOnDisk) {
        const match = file.match(cardFileRe);
        if (!match) continue;
        const oldIndex = Number(match[1]);
        if (removePositions.has(oldIndex)) continue; // tarjeta borrada: la imagen queda huérfana, no se toca
        const newIndex = oldToNew.get(oldIndex);
        if (newIndex === undefined || newIndex === oldIndex) continue; // no cambia de posición
        const defIndex = match[2];
        const suffix = match[3];
        const newFile = `${deckFilePrefix}_card_${newIndex}_def${defIndex}${suffix}.avif`;
        moves.push({
            from: path.join(imagesDir, file),
            to: path.join(imagesDir, newFile),
            tmp: path.join(imagesDir, `.migrating-${file}`),
        });
    }
}

for (const move of moves) fs.renameSync(move.from, move.tmp);
for (const move of moves) fs.renameSync(move.tmp, move.to);

// --- Paso 2: reescribir el JSON (borra tarjetas, actualiza imagePath) ---
const imagePathRe = new RegExp(`(${deckFilePrefix}_card_)(\\d+)(_def\\d+.*)`);
const newData = [];
data.forEach((card, oldIndex) => {
    if (removePositions.has(oldIndex)) return;
    const newIndex = oldToNew.get(oldIndex);
    for (const definition of (card.definitions || [])) {
        if (typeof definition.imagePath === 'string') {
            definition.imagePath = definition.imagePath.replace(
                imagePathRe,
                (_match, prefix, _oldIdx, suffix) => `${prefix}${newIndex}${suffix}`,
            );
        }
    }
    newData.push(card);
});

fs.writeFileSync(absJsonPath, `${JSON.stringify(newData, null, 2)}\n`);

console.log(JSON.stringify({
    file: relativeFileArg,
    removed: removedNames,
    originalLength: data.length,
    newLength: newData.length,
    imagesRenamed: moves.length,
}, null, 2));
