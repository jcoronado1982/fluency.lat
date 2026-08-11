import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const root = path.join(repoRoot, 'json', 'es_en');
const shouldFix = process.argv.includes('--fix');

const MERGED_FILE_RE = /_e_/;

function levelRank(levelDir) {
    const match = levelDir.match(/^(\d+)-/);
    return match ? Number(match[1]) : 99;
}

function normalize(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function firstMeaning(card) {
    return card.definitions?.[0]?.meaning || '';
}

function firstUsageEs(card) {
    return card.definitions?.[0]?.usage_example_es || '';
}

function firstUsageEn(card) {
    return card.definitions?.[0]?.usage_example || '';
}

// --- Carga: solo archivos canónicos (excluye los fusionados *_e_*.json) ---

const categories = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const canonicalFiles = []; // { category, level, file, relativeFile, absPath }
const mergedFiles = [];

for (const category of categories) {
    const categoryPath = path.join(root, category);
    const levels = fs.readdirSync(categoryPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    for (const level of levels) {
        const levelPath = path.join(categoryPath, level);
        const files = fs.readdirSync(levelPath).filter((name) => name.endsWith('.json')).sort();
        for (const file of files) {
            const absPath = path.join(levelPath, file);
            const relativeFile = path.relative(root, absPath);
            const entry = { category, level, file, relativeFile, absPath };
            if (MERGED_FILE_RE.test(file)) {
                mergedFiles.push(entry);
            } else {
                canonicalFiles.push(entry);
            }
        }
    }
}

// Chequeo de cordura: un archivo fusionado A_e_B.json debería ser la unión
// literal de A.json + B.json en el mismo directorio. Solo se avisa, no bloquea.
const mergedWarnings = [];
for (const merged of mergedFiles) {
    const base = merged.file.replace(/\.json$/, '');
    const parts = base.split('_e_');
    if (parts.length !== 2) continue;
    const dir = path.dirname(merged.absPath);
    const siblingA = path.join(dir, `${parts[0]}.json`);
    const siblingB = path.join(dir, `${parts[1]}.json`);
    if (!fs.existsSync(siblingA) || !fs.existsSync(siblingB)) continue;
    const mergedNames = JSON.parse(fs.readFileSync(merged.absPath, 'utf8')).map((c) => c.name).sort();
    const unionNames = [
        ...JSON.parse(fs.readFileSync(siblingA, 'utf8')).map((c) => c.name),
        ...JSON.parse(fs.readFileSync(siblingB, 'utf8')).map((c) => c.name),
    ].sort();
    if (JSON.stringify(mergedNames) !== JSON.stringify(unionNames)) {
        mergedWarnings.push({
            file: merged.relativeFile,
            detail: 'el contenido no coincide con la unión literal de sus dos archivos fuente',
        });
    }
}

// --- Extracción de tarjetas canónicas ---

const occurrencesByCategory = new Map(); // category -> Map(normalizedName -> occurrence[])
const allOccurrences = [];
const fileCache = new Map(); // absPath -> { data, originalLength }

for (const entry of canonicalFiles) {
    const data = JSON.parse(fs.readFileSync(entry.absPath, 'utf8'));
    fileCache.set(entry.absPath, { data, originalLength: data.length });
    data.forEach((card, position) => {
        const occurrence = {
            category: entry.category,
            level: entry.level,
            file: entry.file,
            relativeFile: entry.relativeFile,
            absPath: entry.absPath,
            position,
            arrayLength: data.length,
            name: card.name,
            normalizedName: normalize(card.name),
            meaning0: firstMeaning(card),
            usageEs0: firstUsageEs(card),
            usageEn0: firstUsageEn(card),
            isVerb: card.is_verb ?? null,
        };
        allOccurrences.push(occurrence);
        if (!occurrencesByCategory.has(entry.category)) occurrencesByCategory.set(entry.category, new Map());
        const byName = occurrencesByCategory.get(entry.category);
        if (!byName.has(occurrence.normalizedName)) byName.set(occurrence.normalizedName, []);
        byName.get(occurrence.normalizedName).push(occurrence);
    });
}

// --- Duplicados dentro de la misma categoría ---

const safeRemovals = []; // { category, keptRef, occurrence }
const pendingDuplicates = []; // { category, keptRef, occurrence, reason }

for (const [category, byName] of occurrencesByCategory) {
    for (const [normalizedName, occurrences] of byName) {
        if (occurrences.length < 2) continue;
        const sorted = [...occurrences].sort((a, b) => (
            levelRank(a.level) - levelRank(b.level)
            || a.file.localeCompare(b.file)
            || a.position - b.position
        ));
        const kept = sorted[0];
        for (const occurrence of sorted.slice(1)) {
            const isLastInFile = occurrence.position === occurrence.arrayLength - 1;
            const senseMatches = (
                normalize(occurrence.meaning0) === normalize(kept.meaning0)
                || normalize(occurrence.usageEs0) === normalize(kept.usageEs0)
            );
            if (isLastInFile && senseMatches) {
                safeRemovals.push({ category, normalizedName, kept, occurrence });
            } else {
                pendingDuplicates.push({
                    category,
                    normalizedName,
                    kept,
                    occurrence,
                    reason: !isLastInFile
                        ? 'no es el último elemento de su archivo: borrarlo correría el índice de las tarjetas siguientes (rompe imagen/audio y progreso de usuarios)'
                        : 'mismo nombre pero sentido distinto al de la ocurrencia base: revisar si son sentidos legítimos que deberían fusionarse como definitions adicionales de una sola tarjeta',
                });
            }
        }
    }
}

// --- Duplicados entre categorías (informativo) ---

const byNameAcrossCategories = new Map(); // normalizedName -> occurrence[]
for (const occurrence of allOccurrences) {
    if (!byNameAcrossCategories.has(occurrence.normalizedName)) byNameAcrossCategories.set(occurrence.normalizedName, []);
    byNameAcrossCategories.get(occurrence.normalizedName).push(occurrence);
}
const crossCategoryDuplicates = [];
for (const [normalizedName, occurrences] of byNameAcrossCategories) {
    const categoriesInvolved = new Set(occurrences.map((o) => o.category));
    if (categoriesInvolved.size > 1) {
        crossCategoryDuplicates.push({ normalizedName, occurrences });
    }
}
crossCategoryDuplicates.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));

// --- Candidatos heurísticos de categoría gramatical equivocada ---

const ARTICLE_BEFORE_WORD_RE = (word) => new RegExp(`\\b(a|an|the|my|his|her|our|their|your|its)\\s+${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
const BARE_INFINITIVE_RE = /^[a-záéíóúñ]{4,}(ar|er|ir)$/i;
const NOUN_ARTICLE_MEANING_RE = /^(el|la|los|las|un|una)\s+[a-záéíóúñ]/i;

const heuristicCandidates = [];

for (const entry of canonicalFiles) {
    const { data } = fileCache.get(entry.absPath);
    data.forEach((card, position) => {
        const name = card.name || '';
        if ((entry.category === 'verbs' || entry.category === 'phrasal_verbs') && name) {
            const pattern = ARTICLE_BEFORE_WORD_RE(name);
            for (const [defIndex, definition] of (card.definitions || []).entries()) {
                if (pattern.test(definition.usage_example || '')) {
                    heuristicCandidates.push({
                        category: entry.category,
                        relativeFile: entry.relativeFile,
                        position,
                        defIndex,
                        name,
                        signal: 'usage_example usa el término precedido de artículo/posesivo en inglés (a/an/the/my/...) — posible uso nominal dentro de una categoría verbal',
                        usage_example: definition.usage_example,
                        meaning: definition.meaning,
                    });
                }
            }
        }
        if (entry.category === 'nouns') {
            const meaning = normalize(firstMeaning(card)).replace(/\s*\([^)]*\)\s*/g, '').trim();
            if (BARE_INFINITIVE_RE.test(meaning)) {
                heuristicCandidates.push({
                    category: entry.category,
                    relativeFile: entry.relativeFile,
                    position,
                    defIndex: 0,
                    name,
                    signal: `meaning en español ("${firstMeaning(card)}") parece un infinitivo verbal suelto — posible verbo mal clasificado como sustantivo`,
                    usage_example: firstUsageEn(card),
                    meaning: firstMeaning(card),
                });
            }
        }
        if (entry.category === 'adjectives' || entry.category === 'adverbs') {
            const meaning = firstMeaning(card) || '';
            if (NOUN_ARTICLE_MEANING_RE.test(meaning.trim())) {
                heuristicCandidates.push({
                    category: entry.category,
                    relativeFile: entry.relativeFile,
                    position,
                    defIndex: 0,
                    name,
                    signal: `meaning en español ("${meaning}") empieza con artículo — patrón típico de sustantivo, no de ${entry.category === 'adjectives' ? 'adjetivo' : 'adverbio'}`,
                    usage_example: firstUsageEn(card),
                    meaning,
                });
            }
        }
    });
}

// --- Exclusiones manuales (revisadas a mano, jul 2026) ---

// En este par, la ocurrencia elegida como "kept" por orden alfabético de
// archivo es la que está MAL ubicada — object_pronouns.json#5 ("it", meaning
// "(Sujeto neutro) / Ello") es contenido de sujeto metido en el mazo de
// objeto; subject_pronouns.json#6 (la que el algoritmo marcaría para borrar)
// es la copia correctamente ubicada. No es seguro decidir automáticamente
// cuál sobra aquí: queda fuera del auto-fix y pasa al informe para la
// revisión dedicada de `pronouns`.
const MANUAL_EXCLUDE_FROM_SAFE_FIX = new Map([
    ['pronouns/1-basic/subject_pronouns.json#6', 'la copia "kept" (object_pronouns.json#5) está mal ubicada (contenido de sujeto en mazo de objeto); requiere revisión dedicada de pronouns, no un borrado automático'],
]);

// --- Aplicar --fix (solo elimina el último elemento de cada archivo afectado) ---

const applied = [];
if (shouldFix) {
    const byFile = new Map();
    for (const removal of safeRemovals) {
        const key = `${removal.occurrence.relativeFile}#${removal.occurrence.position}`;
        if (MANUAL_EXCLUDE_FROM_SAFE_FIX.has(key)) continue;
        if (!byFile.has(removal.occurrence.absPath)) byFile.set(removal.occurrence.absPath, []);
        byFile.get(removal.occurrence.absPath).push(removal);
    }
    for (const [absPath, removals] of byFile) {
        const cached = fileCache.get(absPath);
        const data = JSON.parse(fs.readFileSync(absPath, 'utf8'));
        // Nunca debería haber más de una remoción segura por archivo (solo el
        // último elemento puede calificar), pero por seguridad se ordenan
        // descendentemente y se valida la posición justo antes de cada pop.
        removals.sort((a, b) => b.occurrence.position - a.occurrence.position);
        for (const removal of removals) {
            if (removal.occurrence.position !== data.length - 1) {
                throw new Error(`Posición insegura al aplicar fix en ${absPath}: se esperaba el último elemento`);
            }
            const removedCard = data.pop();
            applied.push({
                category: removal.category,
                relativeFile: removal.occurrence.relativeFile,
                position: removal.occurrence.position,
                name: removedCard.name,
                keptAt: `${removal.kept.relativeFile}#${removal.kept.position}`,
            });
        }
        fs.writeFileSync(absPath, `${JSON.stringify(data, null, 2)}\n`);
    }
}

// --- Salida ---

const summary = {
    canonicalFiles: canonicalFiles.length,
    mergedFilesExcluded: mergedFiles.length,
    mergedWarnings,
    totalCanonicalCards: allOccurrences.length,
    duplicateGroupsWithinCategory: safeRemovals.length + pendingDuplicates.length,
    safeRemovals: safeRemovals.map((r) => {
        const key = `${r.occurrence.relativeFile}#${r.occurrence.position}`;
        const excludedReason = MANUAL_EXCLUDE_FROM_SAFE_FIX.get(key);
        return {
            category: r.category,
            name: r.occurrence.name,
            removedFrom: key,
            keptAt: `${r.kept.relativeFile}#${r.kept.position}`,
            ...(excludedReason ? { excludedFromFix: excludedReason } : {}),
        };
    }),
    pendingDuplicates: pendingDuplicates.map((r) => ({
        category: r.category,
        name: r.occurrence.name,
        at: `${r.occurrence.relativeFile}#${r.occurrence.position}`,
        keptAt: `${r.kept.relativeFile}#${r.kept.position}`,
        reason: r.reason,
    })),
    crossCategoryDuplicates: crossCategoryDuplicates.map((d) => ({
        name: d.occurrences[0].name,
        occurrences: d.occurrences.map((o) => ({
            category: o.category,
            at: `${o.relativeFile}#${o.position}`,
            meaning: o.meaning0,
            usage_example: o.usageEn0,
        })),
    })),
    heuristicCandidates,
    applied: shouldFix ? applied : undefined,
};

console.log(JSON.stringify(summary, null, 2));

if (!shouldFix && (safeRemovals.length || pendingDuplicates.length || heuristicCandidates.length)) {
    process.exitCode = 1;
}
