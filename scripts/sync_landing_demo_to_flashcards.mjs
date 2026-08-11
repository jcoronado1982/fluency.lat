import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const demoCardsPath = path.join(
  repoRoot,
  'client/src/modules/landing/data/demoCards.json',
);
const demoAudioDir = path.join(
  repoRoot,
  'card_audio/landing-demo/verbs-essentials',
);
const appAudioDir = path.join(repoRoot, 'card_audio/verbs/1-basic');
const demoImageDir = path.join(
  repoRoot,
  'card_images/landing-demo/verbs-essentials',
);
const appImageDir = path.join(repoRoot, 'card_images/verbs/1-basic');
const demoImageNamespace = '/card_images/verbs/1-basic/demo-sync';
const appDemoImageDir = path.join(appImageDir, 'demo-sync');

const targetJsonFiles = [
  path.join(repoRoot, 'json/en_es/verbs/1-basic.json'),
  path.join(repoRoot, 'json/en_es/verbs/1-basic/action.json'),
  path.join(repoRoot, 'json/en_es/verbs/1-basic/being_state.json'),
  path.join(repoRoot, 'json/en_es/verbs/1-basic/communication.json'),
  path.join(repoRoot, 'json/en_es/verbs/1-basic/movement.json'),
  path.join(repoRoot, 'json/en_es/verbs/1-basic/possession_exchange.json'),
  path.join(repoRoot, 'json/en_es/verbs/1-basic/thinking.json'),
];
const baselineDir = path.join(repoRoot, '.tmp/baseline-verbs-1-basic');

const demoCards = JSON.parse(fs.readFileSync(demoCardsPath, 'utf8'));
const demoByName = new Map(demoCards.map((card) => [card.name, card]));
const demoCardNames = new Set(demoCards.map((card) => card.name));

function extractCardIndex(card) {
  const candidates = [];

  for (const definition of card.definitions || []) {
    if (definition?.imagePath) candidates.push(definition.imagePath);
  }

  if (card.irregular?.past?.imagePath) candidates.push(card.irregular.past.imagePath);
  if (card.irregular?.participle?.imagePath) candidates.push(card.irregular.participle.imagePath);

  for (const definition of card.irregular?.past?.definitions || []) {
    if (definition?.imagePath) candidates.push(definition.imagePath);
  }
  for (const definition of card.irregular?.participle?.definitions || []) {
    if (definition?.imagePath) candidates.push(definition.imagePath);
  }

  for (const candidate of candidates) {
    const match = candidate.match(/1-basic_card_(\d+)_def\d+/);
    if (match) return Number.parseInt(match[1], 10);
  }

  throw new Error(`No pude resolver el card index para '${card.name}'`);
}

function buildAppImagePath(cardIndex, defIndex, formSuffix = '') {
  const suffix = formSuffix ? `_${formSuffix}` : '';
  return `/card_images/verbs/1-basic/1-basic_card_${cardIndex}_def${defIndex}${suffix}.avif`;
}

function buildUniqueDemoImagePath(cardName, defIndex, formSuffix = '') {
  const suffix = formSuffix ? `_${formSuffix}` : '';
  return `${demoImageNamespace}/1-basic_${cardName}_def${defIndex}${suffix}.avif`;
}

function demoAssetExists(imagePath) {
  if (!imagePath) return false;
  return fs.existsSync(path.join(repoRoot, imagePath.replace(/^\//, '')));
}

function resolveImagePath(cardName, definition, defIndex, formSuffix = '') {
  if (!demoAssetExists(definition.imagePath)) {
    return null;
  }

  return buildUniqueDemoImagePath(cardName, defIndex, formSuffix);
}

function syncDefinitions(cardName, definitions, formSuffix = '') {
  return (definitions || []).map((definition, defIndex) => {
    const next = { ...definition };
    const nextImagePath = resolveImagePath(cardName, definition, defIndex, formSuffix);
    if (nextImagePath) {
      next.imagePath = nextImagePath;
    } else {
      delete next.imagePath;
    }
    return next;
  });
}

function syncIrregularPart(cardName, part, formSuffix) {
  if (!part) return part;

  if (Array.isArray(part.definitions)) {
    return {
      ...part,
      definitions: syncDefinitions(cardName, part.definitions, formSuffix),
    };
  }

  const next = { ...part };
  const nextImagePath = resolveImagePath(cardName, part, 0, formSuffix);
  if (nextImagePath) {
    next.imagePath = nextImagePath;
  } else {
    delete next.imagePath;
  }
  return next;
}

function syncCardWithDemo(card, demoCard) {
  return {
    ...card,
    definitions: syncDefinitions(card.name, demoCard.definitions),
    irregular: demoCard.irregular
      ? {
          ...demoCard.irregular,
          past: syncIrregularPart(card.name, demoCard.irregular.past, 'v2'),
          participle: syncIrregularPart(
            card.name,
            demoCard.irregular.participle,
            'v3',
          ),
        }
      : card.irregular,
  };
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 4)}\n`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyIfMissing(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) return false;
  if (fs.existsSync(destinationPath)) return false;
  fs.copyFileSync(sourcePath, destinationPath);
  return true;
}

function copyAndReplace(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) return false;
  ensureDir(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
  return true;
}

function normalizeExistingDeckImagePaths(card) {
  if (!card || demoCardNames.has(card.name)) return card;

  let changed = false;
  const next = { ...card };
  const nextDefinitions = (card.definitions || []).map((definition) => {
    if (!definition?.imagePath || !definition.imagePath.endsWith('.jpg')) {
      return definition;
    }

    const avifPath = definition.imagePath.replace(/\.jpg$/i, '.avif');
    const localPath = path.join(repoRoot, avifPath.replace(/^\//, ''));
    if (!fs.existsSync(localPath)) return definition;

    changed = true;
    return { ...definition, imagePath: avifPath };
  });

  if (!changed) return card;
  next.definitions = nextDefinitions;
  return next;
}

function normalizePathToAvif(imagePath) {
  if (!imagePath) return imagePath;
  return imagePath.replace(/\.jpg$/i, '.avif');
}

function loadBaselineJson(relativePath) {
  const baselinePath = path.join(baselineDir, relativePath);
  const raw = fs.readFileSync(baselinePath, 'utf8');
  return JSON.parse(raw);
}

function buildBaselineImagePathMap(relativePath) {
  const baselineCards = loadBaselineJson(relativePath);
  const map = new Map();

  for (const card of baselineCards) {
    const key = card.name;
    if (!key) continue;
    map.set(
      key,
      (card.definitions || []).map((definition) =>
        definition?.imagePath ? normalizePathToAvif(definition.imagePath) : null,
      ),
    );
  }

  return map;
}

function restoreBaselineDefinitionImages(card, baselineMap) {
  const baselineDefinitions = baselineMap.get(card.name);
  if (!baselineDefinitions?.length) return card;

  let changed = false;
  const nextDefinitions = (card.definitions || []).map((definition, defIndex) => {
    const baselineImagePath = baselineDefinitions[defIndex];
    if (!baselineImagePath || definition?.imagePath) {
      return definition;
    }

    changed = true;
    return { ...definition, imagePath: baselineImagePath };
  });

  if (!changed) return card;
  return { ...card, definitions: nextDefinitions };
}

function syncJsonFiles() {
  for (const filePath of targetJsonFiles) {
    const relativePath = path.relative(repoRoot, filePath);
    const baselineMap = filePath.endsWith('1-basic.json')
      ? null
      : buildBaselineImagePathMap(relativePath);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const next = data.map((card) => {
      const demoCard = demoByName.get(card.name);
      if (!demoCard) {
        const normalizedCard = filePath.endsWith('1-basic.json')
          ? normalizeExistingDeckImagePaths(card)
          : restoreBaselineDefinitionImages(card, baselineMap);
        return normalizedCard;
      }
      return syncCardWithDemo(card, demoCard);
    });
    writeJsonFile(filePath, next);
  }
}

function copyImageAssets() {
  ensureDir(appDemoImageDir);

  for (const demoCard of demoCards) {
    for (const [defIndex, definition] of (demoCard.definitions || []).entries()) {
      const source = path.join(repoRoot, definition.imagePath.replace(/^\//, ''));
      const destination = path.join(
        appDemoImageDir,
        `1-basic_${demoCard.name}_def${defIndex}.avif`,
      );
      copyAndReplace(source, destination);
    }

    const irregularTargets = [
      ['v2', demoCard.irregular?.past],
      ['v3', demoCard.irregular?.participle],
    ];

    for (const [formSuffix, irregularPart] of irregularTargets) {
      if (!irregularPart) continue;

      if (Array.isArray(irregularPart.definitions)) {
        for (const [defIndex, definition] of irregularPart.definitions.entries()) {
          const source = path.join(repoRoot, definition.imagePath.replace(/^\//, ''));
          const destination = path.join(
            appDemoImageDir,
            `1-basic_${demoCard.name}_def${defIndex}_${formSuffix}.avif`,
          );
          copyAndReplace(source, destination);
        }
        continue;
      }

      if (irregularPart.imagePath) {
        const source = path.join(repoRoot, irregularPart.imagePath.replace(/^\//, ''));
        const destination = path.join(
          appDemoImageDir,
          `1-basic_${demoCard.name}_def0_${formSuffix}.avif`,
        );
        copyAndReplace(source, destination);
      }
    }
  }
}

function copyAudioAssets() {
  ensureDir(appAudioDir);

  const names = new Set(demoCards.map((card) => card.name));
  const entries = fs.readdirSync(demoAudioDir);

  for (const entry of entries) {
    for (const name of names) {
      const sourcePrefix = `verbs-essentials_${name}_`;
      if (!entry.startsWith(sourcePrefix)) continue;

      const destinationName = entry.replace(sourcePrefix, `1-basic_${name}_`);
      const sourcePath = path.join(demoAudioDir, entry);
      const destinationPath = path.join(appAudioDir, destinationName);
      copyIfMissing(sourcePath, destinationPath);
      break;
    }
  }
}

syncJsonFiles();
copyImageAssets();
copyAudioAssets();

console.log('landing-demo -> flashcards sync: OK');
