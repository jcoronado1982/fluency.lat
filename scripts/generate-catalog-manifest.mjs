#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonRoot = path.resolve(process.argv[2] || path.join(repoRoot, 'json'));
const outputPath = path.join(jsonRoot, 'catalog-manifest.json');
const temporaryPath = `${outputPath}.tmp`;
const orderContract = JSON.parse(
    await readFile(path.join(repoRoot, 'client/src/contracts/catalogOrder.json'), 'utf8'),
);
const categoryOrder = new Map(
    (orderContract.categories || []).map((entry, index) => [entry.name, entry.order ?? index]),
);
const levelOrder = new Map([
    ['1-basic', 1],
    ['2-intermediate', 2],
    ['3-advanced', 3],
]);

const compareCategories = (a, b) => {
    const aOrder = categoryOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = categoryOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || a.name.localeCompare(b.name);
};

const compareDecks = (a, b) => {
    const aLevel = levelOrder.get(a.level) ?? Number.MAX_SAFE_INTEGER;
    const bLevel = levelOrder.get(b.level) ?? Number.MAX_SAFE_INTEGER;
    return aLevel - bLevel || a.path.localeCompare(b.path);
};

async function listDirectories(directory) {
    return (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name);
}

async function listJsonFiles(directory, relative = '') {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'catalog-manifest.json') continue;
        const absolute = path.join(directory, entry.name);
        const nextRelative = path.posix.join(relative, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listJsonFiles(absolute, nextRelative));
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
            files.push({ absolute, relative: nextRelative });
        }
    }
    return files;
}

function getCards(document, file) {
    const cards = Array.isArray(document) ? document : document?.flashcards;
    if (!Array.isArray(cards)) {
        throw new Error(`${file}: se esperaba un array o un objeto con flashcards[]`);
    }
    return cards;
}

async function buildDirection(direction) {
    const directionRoot = path.join(jsonRoot, direction);
    const categories = [];

    for (const category of await listDirectories(directionRoot)) {
        const categoryRoot = path.join(directionRoot, category);
        const deckFiles = await listJsonFiles(categoryRoot);
        const decks = [];

        for (const file of deckFiles) {
            const raw = await readFile(file.absolute, 'utf8');
            let document;
            try {
                document = JSON.parse(raw);
            } catch (error) {
                throw new Error(`${file.absolute}: JSON inválido (${error.message})`);
            }
            const cards = getCards(document, file.absolute);
            const metadata = await stat(file.absolute);
            const [level = 'unknown'] = file.relative.split('/');
            decks.push({
                path: file.relative,
                level,
                total: cards.length,
                size: metadata.size,
            });
        }

        decks.sort(compareDecks);
        categories.push({
            name: category,
            total: decks.reduce((sum, deck) => sum + deck.total, 0),
            decks,
        });
    }

    categories.sort(compareCategories);
    return {
        total: categories.reduce((sum, category) => sum + category.total, 0),
        categories,
    };
}

const directions = {};
for (const direction of (await listDirectories(jsonRoot)).sort()) {
    directions[direction] = await buildDirection(direction);
}

const catalogData = { schemaVersion: 1, directions };
const catalogVersion = createHash('sha256')
    .update(JSON.stringify(catalogData))
    .digest('hex');
const manifest = {
    schemaVersion: 1,
    catalogVersion,
    generatedAt: new Date().toISOString(),
    directions,
};

await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await rename(temporaryPath, outputPath);

const categoryCount = Object.values(directions)
    .reduce((sum, direction) => sum + direction.categories.length, 0);
const deckCount = Object.values(directions)
    .flatMap((direction) => direction.categories)
    .reduce((sum, category) => sum + category.decks.length, 0);
console.log(`Catálogo generado: ${Object.keys(directions).length} direcciones, ${categoryCount} categorías, ${deckCount} decks`);
