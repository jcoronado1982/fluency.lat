import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const targetRoot = path.join(repoRoot, 'json', 'en_es');
const sourceRoot = path.join(repoRoot, 'json', 'es_en');
const reportPath = path.join(repoRoot, 'docs', 'EN_ES_CONTENT_AUDIT.md');
const shouldFix = process.argv.includes('--fix');
const shouldRewriteReport = process.argv.includes('--rewrite-report');
const baselineRootArg = process.argv.find((argument) => argument.startsWith('--baseline-root='));
const auditTargetRoot = baselineRootArg
    ? path.resolve(baselineRootArg.slice('--baseline-root='.length))
    : targetRoot;

const PLACEHOLDER = '[PRONUNCIACIÓN EN ES PARA HABLANTES DE EN]';
const DEFINITION_SUFFIX = /\s*\(def\s*\d+\)\s*$/i;

const translatedDescriptionNames = new Map(Object.entries({
    orange: 'Naranja (color)',
    Asia: 'Asia',
    Europe: 'Europa',
    Africa: 'África',
    'North America': 'América del Norte',
    'South America': 'América del Sur',
    Oceania: 'Oceanía',
    Antarctica: 'Antártida',
    midday: 'Mediodía',
    noon: 'Mediodía',
    midnight: 'Medianoche',
    'United States': 'Estados Unidos',
    Canada: 'Canadá',
    Mexico: 'México',
    Brazil: 'Brasil',
    Argentina: 'Argentina',
    Colombia: 'Colombia',
    Peru: 'Perú',
    Spain: 'España',
    France: 'Francia',
    Germany: 'Alemania',
    Italy: 'Italia',
    'United Kingdom': 'Reino Unido',
    China: 'China',
    Japan: 'Japón',
    Russia: 'Rusia',
    India: 'India',
    'South Korea': 'Corea del Sur',
    Australia: 'Australia',
    Egypt: 'Egipto',
    Nigeria: 'Nigeria',
    'South Africa': 'Sudáfrica',
    medicine: 'Medicina / Medicamento',
    patient: 'Paciente',
    illness: 'Enfermedad',
    'living room': 'Sala / Sala de estar',
    'dining room': 'Comedor',
    garage: 'Garaje',
    pan: 'Sartén',
    pot: 'Olla',
    entrance: 'Entrada',
    exit: 'Salida',
    direction: 'Dirección',
    material: 'Material',
    bronze: 'Bronce',
    iron: 'Hierro',
    steel: 'Acero',
    copper: 'Cobre',
    plutonium: 'Plutonio',
    zero: 'Cero',
    hundred: 'Cien',
    'Pacific Ocean': 'Océano Pacífico',
    'Atlantic Ocean': 'Océano Atlántico',
    'Indian Ocean': 'Océano Índico',
    'Arctic Ocean': 'Océano Ártico',
    'Southern Ocean': 'Océano Austral',
    'Mediterranean Sea': 'Mar Mediterráneo',
    'Caribbean Sea': 'Mar Caribe',
    'Red Sea': 'Mar Rojo',
    'Black Sea': 'Mar Negro',
    'North Sea': 'Mar del Norte',
    'Arabian Sea': 'Mar Arábigo',
    'Baltic Sea': 'Mar Báltico',
    glasses: 'Gafas / Lentes',
    backpack: 'Mochila',
    headphones: 'Audífonos / Auriculares',
    passport: 'Pasaporte',
    notebook: 'Cuaderno',
    eraser: 'Borrador / Goma de borrar',
    ruler: 'Regla',
    birthday: 'Cumpleaños',
    wedding: 'Boda',
    holiday: 'Día festivo / Festividad',
}));

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
}

function loadCatalog(root, direction) {
    const files = walk(root).filter((file) => file.endsWith('.json')).sort();
    const cards = [];

    for (const filePath of files) {
        const relativeFile = path.relative(root, filePath);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        data.forEach((card, cardIndex) => {
            cards.push({
                recordId: cards.length + 1,
                direction,
                filePath,
                relativeFile,
                cardIndex,
                card,
            });
        });
    }

    return { files, cards };
}

function pairKey(english, spanish) {
    return `${String(english || '').trim()}\0${String(spanish || '').trim()}`;
}

function normalizeEnglishMeaning(value) {
    return String(value || '').replace(DEFINITION_SUFFIX, '').trim();
}

function sourceDefinitionIndex(sourceCards) {
    const index = new Map();

    for (const source of sourceCards) {
        for (const [definitionIndex, definition] of (source.card.definitions || []).entries()) {
            const key = pairKey(definition.usage_example, definition.usage_example_es);
            const item = {
                cardName: source.card.name,
                spanishMeaning: definition.meaning,
                definitionIndex,
            };
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(item);
        }
    }

    return index;
}

function selectSourceDefinition(index, card, definition, definitionIndex) {
    const key = pairKey(definition.usage_example_es, definition.usage_example);
    const candidates = index.get(key) || [];
    const englishMeaning = normalizeEnglishMeaning(definition.meaning).toLowerCase();
    const matchingEnglishCard = candidates.filter(
        (candidate) => candidate.cardName.toLowerCase() === englishMeaning,
    );

    if (matchingEnglishCard.length === 1) return matchingEnglishCard[0];
    if (matchingEnglishCard.length > 1) {
        const matchingSpanishTitle = matchingEnglishCard.find(
            (candidate) => candidate.spanishMeaning.toLowerCase() === card.name.toLowerCase(),
        );
        if (matchingSpanishTitle) return matchingSpanishTitle;
        return matchingEnglishCard[Math.min(definitionIndex, matchingEnglishCard.length - 1)];
    }

    return null;
}

function keyFor(relativeFile, cardIndex) {
    return `${relativeFile}#${cardIndex}`;
}

const targetedCardEdits = new Map([
    ['adjectives/1-basic/physical_state_and_condition.json#18', (card) => {
        card.definitions[0].usage_example = 'Bebe esta agua; está agradable y fresca.';
    }],
    ['adverbs/1-basic/manner_degree_quantity.json#9', (card) => {
        card.name = 'Demasiado';
    }],
    ['adverbs/1-basic/place_direction.json#10', (card) => {
        card.definitions[0].usage_example = 'Él bajó las escaleras.';
        card.definitions[0].usage_example_es = 'He went down the stairs.';
    }],
    ['adverbs/1-basic/place_direction.json#14', (card) => {
        card.name = 'A la derecha';
    }],
    ['adverbs/3-advanced/degree_focus.json#1', (card) => {
        card.definitions[0].usage_example = 'El equipo está compuesto principalmente por jugadores jóvenes.';
    }],
    ['adverbs/3-advanced/degree_focus_e_discourse_logic.json#2', (card) => {
        card.definitions[0].usage_example = 'El equipo está compuesto principalmente por jugadores jóvenes.';
    }],
    ['adverbs/3-advanced/degree_focus_e_discourse_logic.json#5', (card) => {
        card.definitions = card.definitions.slice(0, 1);
    }],
    ['adverbs/3-advanced/discourse_logic.json#2', (card) => {
        card.definitions = card.definitions.slice(0, 1);
    }],
    ['connectors/3-advanced/formal_addition_clarification_e_formal_cause_effect.json#5', (card) => {
        card.definitions[0].usage_example = 'Él está enfermo; por lo tanto, no vendrá.';
    }],
    ['connectors/3-advanced/formal_cause_effect.json#2', (card) => {
        card.definitions[0].usage_example = 'Él está enfermo; por lo tanto, no vendrá.';
    }],
    ['determinant/1-basic/reference_and_selection.json#8', (card) => {
        card.definitions[0].usage_example = 'Mis dos padres son doctores.';
    }],
    ['determinant/1-basic/reference_and_selection.json#12', (card) => {
        card.name = 'Qué / Cuál';
        card.definitions[0].usage_example = '¿Qué calle es esta?';
    }],
    ['determinant/3-advanced/compound_and_partitive.json#7', (card) => {
        card.definitions[0].usage_example = 'Cada estudiante, sin excepción, debe inscribirse.';
    }],
    ['nouns/1-basic/animals.json#7', (card) => {
        card.name = 'Oveja';
    }],
    ['nouns/1-basic/body.json#6', (card) => {
        card.definitions[0].usage_example = 'Mis pies están fríos.';
    }],
    ['nouns/1-basic/body.json#12', (card) => {
        card.definitions[0].usage_example = 'Me cepillo los dientes.';
    }],
    ['verbs/1-basic/being_state.json#1', (card) => {
        card.name = 'Vivir';
        card.definitions[0].target_meaning_es = 'Vivir';
    }],
    ['nouns/1-basic/calendar.json#18', (card) => {
        card.name = 'Fecha';
    }],
    ['nouns/1-basic/household_items.json#6', (card) => {
        card.definitions = card.definitions.filter((definition, index, definitions) => {
            const key = pairKey(definition.usage_example_es, definition.usage_example);
            return definitions.findIndex((candidate) => (
                pairKey(candidate.usage_example_es, candidate.usage_example) === key
            )) === index;
        });
    }],
    ['nouns/1-basic/school.json#1', (card) => {
        card.definitions = card.definitions.slice(0, 1);
    }],
    ['nouns/1-basic/technology.json#10', (card) => {
        card.definitions[0].usage_example = 'Sube el volumen del altavoz.';
        card.definitions[0].usage_example_es = 'Turn up the speaker volume.';
    }],
    ['nouns/2-intermediate/goals_plans.json#4', (card) => {
        card.name = 'Plan / Acuerdo';
        card.definitions[0].usage_example = 'Hicimos planes para el viernes.';
    }],
    ['nouns/2-intermediate/logic_reasoning.json#1', (card) => {
        card.definitions[1].usage_example_es = 'He is a man of principles.';
    }],
    ['nouns/2-intermediate/location_e_logic_reasoning.json#3', (card) => {
        card.definitions[1].usage_example_es = 'He is a man of principles.';
    }],
    ['nouns/2-intermediate/process_change.json#6', (card) => {
        card.definitions[0].usage_example = 'Estamos logrando avances.';
    }],
    ['nouns/2-intermediate/process_change.json#34', (card) => {
        card.definitions[0].meaning = 'renewable energy';
    }],
    ['nouns/2-intermediate/science.json#7', (card) => {
        card.name = 'Bacterias (plural; singular: bacteria)';
    }],
    ['nouns/3-advanced/science_e_society.json#3', (card) => {
        card.name = 'Sanción / Multa / Castigo';
    }],
    ['nouns/3-advanced/society.json#2', (card) => {
        card.name = 'Sanción / Multa / Castigo';
    }],
    ['nouns/3-advanced/structure_components.json#2', (card) => {
        card.definitions[0].usage_example = '¿Quién es el propietario de este coche?';
    }],
    ['nouns/3-advanced/structure_components_e_work.json#4', (card) => {
        card.definitions[0].usage_example = '¿Quién es el propietario de este coche?';
    }],
    ['phrasal_verbs/1-basic/daily_life_home.json#4', (card) => {
        card.definitions[3].usage_example = 'Ella no estaba realmente triste. Solo lo fingió.';
    }],
    ['phrasal_verbs/1-basic/daily_life_home.json#10', (card) => {
        card.definitions = card.definitions.slice(0, 2);
    }],
    ['phrasal_verbs/2-intermediate/complex_actions_e_movement_transport.json#9', (card) => {
        card.definitions[1].usage_example = 'La reunión se prolongó diez minutos más.';
    }],
    ['phrasal_verbs/2-intermediate/movement_transport.json#4', (card) => {
        card.definitions[1].usage_example = 'La reunión se prolongó diez minutos más.';
    }],
    ['phrasal_verbs/2-intermediate/relationships_care.json#0', (card) => {
        card.definitions[0].usage_example = 'Ellos decidieron terminar su relación el mes pasado.';
    }],
    ['phrasal_verbs/3-advanced/change_action.json#3', (card) => {
        card.definitions[0].usage_example = 'Ella presentó una nueva propuesta.';
    }],
    ['phrasal_verbs/3-advanced/change_action.json#5', (card) => {
        card.definitions[0].usage_example = 'La lluvia comenzó y continuará todo el fin de semana.';
    }],
    ['phrasal_verbs/3-advanced/change_action_e_conflict_resistance.json#6', (card) => {
        card.definitions[0].usage_example = 'Ella presentó una nueva propuesta.';
    }],
    ['phrasal_verbs/3-advanced/change_action_e_conflict_resistance.json#10', (card) => {
        card.definitions[0].usage_example = 'La lluvia comenzó y continuará todo el fin de semana.';
    }],
    ['phrasal_verbs/3-advanced/reasoning_meaning_e_social_outcomes.json#9', (card) => {
        if (!card.definitions[2].usage_example.endsWith('.')) card.definitions[2].usage_example += '.';
        if (!card.definitions[2].usage_example_es.endsWith('.')) card.definitions[2].usage_example_es += '.';
    }],
    ['phrasal_verbs/3-advanced/social_outcomes.json#4', (card) => {
        if (!card.definitions[2].usage_example.endsWith('.')) card.definitions[2].usage_example += '.';
        if (!card.definitions[2].usage_example_es.endsWith('.')) card.definitions[2].usage_example_es += '.';
    }],
    ['preposition/1-basic/direction_and_movement.json#6', (card) => {
        card.definitions[0].usage_example = 'Baja caminando desde la colina.';
    }],
    ['pronouns/1-basic/interrogative_pronouns.json#2', (card) => {
        card.name = 'Qué / Cuál / Que';
        card.definitions[0].usage_example = '¿Qué color prefieres?';
    }],
    ['pronouns/1-basic/interrogative_pronouns_e_object_pronouns.json#4', (card) => {
        card.name = 'Qué / Cuál / Que';
        card.definitions[0].usage_example = '¿Qué color prefieres?';
    }],
    ['verbs/1-basic/action.json#4', (card) => {
        card.definitions[1].usage_example = 'Esta carpa tiene capacidad para cuatro personas.';
    }],
    ['verbs/1-basic/movement.json#0', (card) => {
        card.definitions = card.definitions.slice(0, 1);
    }],
    ['verbs/2-intermediate/feelings_e_possession_exchange.json#3', (card) => {
        card.definitions[0].usage_example = '¿Puedo ofrecerte una bebida?';
    }],
    ['verbs/2-intermediate/possession_exchange.json#1', (card) => {
        card.definitions[0].usage_example = '¿Puedo ofrecerte una bebida?';
    }],
    ['verbs/3-advanced/action.json#5', (card) => {
        card.definitions[0].usage_example = 'Es importante darle mantenimiento a tu coche.';
    }],
]);

function adaptPronounDeck(relativeFile, card) {
    const isObjectDeck = relativeFile.endsWith('/object_pronouns.json')
        || relativeFile.endsWith('/interrogative_pronouns_e_object_pronouns.json');
    const isPossessiveAdjectiveDeck = relativeFile.endsWith('/possessive_adjectives.json')
        || relativeFile.endsWith('/possessive_adjectives_e_subject_pronouns.json');
    const isSubjectDeck = relativeFile.endsWith('/subject_pronouns.json')
        || relativeFile.endsWith('/possessive_adjectives_e_subject_pronouns.json');
    const isPossessivePronounDeck = relativeFile.endsWith('/possessive_pronouns_and_emphasis.json')
        || relativeFile.endsWith('/demonstrative_pronouns_e_possessive_pronouns_and_emphasis.json');
    const englishMeaning = normalizeEnglishMeaning(card.definitions?.[0]?.meaning);

    if (isObjectDeck && englishMeaning === 'you') {
        card.name = 'Te / Lo / La / Le / A ti / A usted(es)';
        if (card.definitions.length > 1) card.definitions = card.definitions.slice(1);
        card.group_name = 'Objeto';
    } else if (isObjectDeck && englishMeaning === 'it') {
        card.name = 'Lo / La';
        if (card.definitions.length > 1) card.definitions = card.definitions.slice(1);
        card.group_name = 'Objeto';
    } else if (isObjectDeck && englishMeaning === 'her') {
        card.name = 'La / Le / A ella';
        card.definitions = card.definitions.slice(0, 1);
        card.group_name = 'Objeto';
    }

    if (isPossessiveAdjectiveDeck && englishMeaning === 'her') {
        card.name = 'Su / Sus (de ella)';
        if (card.definitions.length > 1) card.definitions = card.definitions.slice(1);
        card.group_name = 'Posesivo (Adjetivo)';
    } else if (isPossessiveAdjectiveDeck && englishMeaning === 'his') {
        card.name = 'Su / Sus (de él)';
        card.definitions = card.definitions.slice(0, 1);
        card.group_name = 'Posesivo (Adjetivo)';
    }

    if (isSubjectDeck && englishMeaning === 'you') {
        card.name = 'Tú / Usted / Ustedes';
        card.definitions = card.definitions.slice(0, 1);
        card.group_name = 'Subject';
    }

    if (isPossessivePronounDeck && englishMeaning === 'his') {
        card.name = 'Suyo / Suya / Suyos / Suyas (de él)';
        if (card.definitions.length > 1) card.definitions = card.definitions.slice(-1);
        card.group_name = 'Posesivo (Pronombre)';
    }
}

function removeSpanishItSubjectCards(relativeFile, cards) {
    const isSubjectDeck = relativeFile.endsWith('/subject_pronouns.json')
        || relativeFile.endsWith('/possessive_adjectives_e_subject_pronouns.json');
    if (!isSubjectDeck) return cards;

    return cards.filter((card) => normalizeEnglishMeaning(card.definitions?.[0]?.meaning) !== 'it');
}

function describeCard(card) {
    return {
        name: card.name,
        group_name: card.group_name,
        definitions: (card.definitions || []).map((definition) => ({
            meaning: definition.meaning,
            target_meaning_es: definition.target_meaning_es,
            usage_example: definition.usage_example,
            usage_example_es: definition.usage_example_es,
        })),
    };
}

function writeReport(cards, changes) {
    const blocks = [];
    for (let offset = 0; offset < cards.length; offset += 100) {
        const blockCards = cards.slice(offset, offset + 100);
        const blockIds = new Set(blockCards.map((item) => item.recordId));
        const blockChanges = changes.filter((change) => blockIds.has(change.recordId));
        const contentChanges = blockChanges.filter((change) => change.kind === 'content');
        const normalizedDefinitions = blockChanges
            .filter((change) => change.kind === 'normalization')
            .reduce((sum, change) => sum + change.definitionCount, 0);
        blocks.push({
            number: blocks.length + 1,
            from: offset + 1,
            to: offset + blockCards.length,
            reviewed: blockCards.length,
            normalizedDefinitions,
            contentChanges,
        });
    }

    const lines = [
        '# Auditoría de contenido inglés → español',
        '',
        `Fecha: ${new Date().toISOString().slice(0, 10)}`,
        '',
        'Alcance: todos los JSON de `json/en_es`, ordenados por ruta y luego por posición dentro del archivo.',
        '',
        'Método: validación estructural completa; cruce de cada par de ejemplos con `json/es_en` por contenido (nunca por índice); comprobación del idioma de títulos, significados, ejemplos y contextos; revisión manual de las alertas de categoría, gramática, duplicación y naturalidad. Las imágenes no se modificaron.',
        '',
        'Normalización común: se retiró el marcador temporal de pronunciación, se eliminaron sufijos internos como `(def 2)` y se guardó `target_meaning_es` para que cada acepción conserve su traducción española específica.',
        '',
        `Resumen: ${cards.length} tarjetas revisadas en ${blocks.length} bloques; ${changes.filter((change) => change.kind === 'content').length} tarjetas con corrección de contenido específica.`,
        '',
    ];

    for (const block of blocks) {
        lines.push(`## Bloque ${String(block.number).padStart(2, '0')}: registros ${block.from}–${block.to}`);
        lines.push('');
        lines.push(`Revisados: ${block.reviewed}. Definiciones normalizadas: ${block.normalizedDefinitions}. Correcciones específicas: ${block.contentChanges.length}.`);
        lines.push('');
        if (block.contentChanges.length === 0) {
            lines.push('Resultado: no fue necesario cambiar frases, títulos ni categorías en este bloque.');
            lines.push('');
            continue;
        }
        for (const change of block.contentChanges) {
            lines.push(`- Registro ${change.recordId}, \`${change.relativeFile}#${change.cardIndex}\`: ${change.summary}`);
        }
        lines.push('');
    }

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
}

const sourceCatalog = loadCatalog(sourceRoot, 'es_en');
const targetCatalog = loadCatalog(auditTargetRoot, 'en_es');
const sourceIndex = sourceDefinitionIndex(sourceCatalog.cards);
const changes = [];
const unresolvedDefinitions = [];
const filesToWrite = new Map();

for (const filePath of targetCatalog.files) {
    const relativeFile = path.relative(auditTargetRoot, filePath);
    const originalCards = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const cards = structuredClone(originalCards);

    cards.forEach((card, cardIndex) => {
        const record = targetCatalog.cards.find(
            (item) => item.relativeFile === relativeFile && item.cardIndex === cardIndex,
        );
        const before = describeCard(card);
        const firstEnglishMeaning = normalizeEnglishMeaning(card.definitions?.[0]?.meaning);
        const translatedDescriptionName = translatedDescriptionNames.get(firstEnglishMeaning);
        const hasEnglishDescriptionTitle = /[.!?]$/.test(card.name);
        if (hasEnglishDescriptionTitle && translatedDescriptionName) card.name = translatedDescriptionName;

        // Vincular antes de corregir frases o quitar acepciones: el par original
        // es la identidad estable compartida con es_en.
        for (const [definitionIndex, definition] of (card.definitions || []).entries()) {
            const sourceDefinition = selectSourceDefinition(
                sourceIndex,
                card,
                definition,
                definitionIndex,
            );
            if (sourceDefinition) definition.target_meaning_es = sourceDefinition.spanishMeaning;
        }

        // Algunos registros fuente también tenían una descripción inglesa en
        // `meaning`; en la dirección inversa la acepción debe ser el término.
        if (translatedDescriptionName && (
            hasEnglishDescriptionTitle
            || card.name === translatedDescriptionName
        )) {
            for (const definition of (card.definitions || [])) {
                if (hasEnglishDescriptionTitle || /[.!?]$/.test(definition.target_meaning_es || '')) {
                    definition.target_meaning_es = translatedDescriptionName;
                }
            }
        }

        const edit = targetedCardEdits.get(keyFor(relativeFile, cardIndex));
        if (edit) edit(card);
        adaptPronounDeck(relativeFile, card);

        for (const [definitionIndex, definition] of (card.definitions || []).entries()) {
            definition.meaning = normalizeEnglishMeaning(definition.meaning);
            if (definition.pronunciation_guide_es === PLACEHOLDER) {
                definition.pronunciation_guide_es = '';
            }

            if (!definition.target_meaning_es) {
                const sourceDefinition = selectSourceDefinition(
                    sourceIndex,
                    card,
                    definition,
                    definitionIndex,
                );
                if (sourceDefinition) definition.target_meaning_es = sourceDefinition.spanishMeaning;
            }
            if (!definition.target_meaning_es) {
                definition.target_meaning_es ||= card.name;
                unresolvedDefinitions.push({
                    recordId: record.recordId,
                    relativeFile,
                    cardIndex,
                    definitionIndex,
                    meaning: definition.meaning,
                });
            }
        }

        const after = describeCard(card);
        const normalized = (card.definitions || []).filter((definition, definitionIndex) => {
            const original = originalCards[cardIndex].definitions?.[definitionIndex];
            return original && (
                original.pronunciation_guide_es === PLACEHOLDER
                || DEFINITION_SUFFIX.test(original.meaning || '')
                || definition.target_meaning_es
            );
        }).length;
        if (normalized > 0) {
            changes.push({
                kind: 'normalization',
                recordId: record.recordId,
                relativeFile,
                cardIndex,
                definitionCount: normalized,
            });
        }

        const changedContent = JSON.stringify(before) !== JSON.stringify(after)
            && (
                before.name !== after.name
                || before.group_name !== after.group_name
                || before.definitions.length !== after.definitions.length
                || before.definitions.some((definition, index) => (
                    definition.usage_example !== after.definitions[index]?.usage_example
                    || definition.usage_example_es !== after.definitions[index]?.usage_example_es
                    || normalizeEnglishMeaning(definition.meaning) !== after.definitions[index]?.meaning
                ))
            );
        if (changedContent) {
            const details = [];
            if (before.name !== after.name) details.push(`título «${before.name}» → «${after.name}»`);
            if (before.group_name !== after.group_name) {
                details.push(`grupo «${before.group_name}» → «${after.group_name}»`);
            }
            if (before.definitions.length !== after.definitions.length) {
                details.push(`acepciones ${before.definitions.length} → ${after.definitions.length}`);
            }
            if (before.definitions.some((definition, index) => (
                definition.usage_example !== after.definitions[index]?.usage_example
                || definition.usage_example_es !== after.definitions[index]?.usage_example_es
            ))) details.push('par de ejemplos corregido');
            if (before.definitions.some((definition, index) => (
                normalizeEnglishMeaning(definition.meaning) !== after.definitions[index]?.meaning
            ))) details.push('significado inglés corregido');
            changes.push({
                kind: 'content',
                recordId: record.recordId,
                relativeFile,
                cardIndex,
                summary: details.join('; '),
            });
        }
    });

    const filteredCards = removeSpanishItSubjectCards(relativeFile, cards);
    if (filteredCards.length !== cards.length) {
        const removed = cards.find((card) => (
            normalizeEnglishMeaning(card.definitions?.[0]?.meaning) === 'it'
        ));
        const originalIndex = cards.indexOf(removed);
        const record = targetCatalog.cards.find(
            (item) => item.relativeFile === relativeFile && item.cardIndex === originalIndex,
        );
        changes.push({
            kind: 'content',
            recordId: record.recordId,
            relativeFile,
            cardIndex: originalIndex,
            summary: 'tarjeta de sujeto inglés “it” eliminada: el español omite ese pronombre impersonal',
        });
    }
    filesToWrite.set(filePath, filteredCards);
}

const findings = {
    files: targetCatalog.files.length,
    cards: targetCatalog.cards.length,
    definitions: targetCatalog.cards.reduce(
        (sum, item) => sum + (item.card.definitions?.length || 0),
        0,
    ),
    unresolvedDefinitions,
    remainingPlaceholders: targetCatalog.cards.reduce(
        (sum, item) => sum + (item.card.definitions || []).filter(
            (definition) => definition.pronunciation_guide_es === PLACEHOLDER,
        ).length,
        0,
    ),
    remainingDefinitionSuffixes: targetCatalog.cards.reduce(
        (sum, item) => sum + (item.card.definitions || []).filter(
            (definition) => DEFINITION_SUFFIX.test(definition.meaning || ''),
        ).length,
        0,
    ),
    missingTargetMeanings: targetCatalog.cards.flatMap((item) => (
        (item.card.definitions || []).flatMap((definition, definitionIndex) => (
            definition.target_meaning_es?.trim() ? [] : [{
                file: item.relativeFile,
                cardIndex: item.cardIndex,
                definitionIndex,
            }]
        ))
    )),
    englishDescriptionTitles: targetCatalog.cards.flatMap((item) => (
        /^[A-Z][A-Za-z ,/'-]+[.!?]$/.test(item.card.name || '')
            ? [{ file: item.relativeFile, cardIndex: item.cardIndex, name: item.card.name }]
            : []
    )),
    englishDescriptionTargets: targetCatalog.cards.flatMap((item) => (
        (item.card.definitions || []).flatMap((definition, definitionIndex) => (
            /^[A-Z][A-Za-z ,/'-]+[.!?]$/.test(definition.target_meaning_es || '')
                ? [{
                    file: item.relativeFile,
                    cardIndex: item.cardIndex,
                    definitionIndex,
                    target: definition.target_meaning_es,
                }]
                : []
        ))
    )),
    cardsWithoutDefinitions: targetCatalog.cards.flatMap((item) => (
        item.card.definitions?.length
            ? []
            : [{ file: item.relativeFile, cardIndex: item.cardIndex, name: item.card.name }]
    )),
    duplicateDefinitionsWithinCard: targetCatalog.cards.flatMap((item) => {
        const seen = new Set();
        return (item.card.definitions || []).flatMap((definition, definitionIndex) => {
            const key = pairKey(definition.usage_example_es, definition.usage_example);
            if (seen.has(key)) {
                return [{ file: item.relativeFile, cardIndex: item.cardIndex, definitionIndex }];
            }
            seen.add(key);
            return [];
        });
    }),
};

if (shouldFix) {
    for (const [filePath, cards] of filesToWrite) {
        fs.writeFileSync(filePath, `${JSON.stringify(cards, null, 4)}\n`);
    }
    if (!fs.existsSync(reportPath) || shouldRewriteReport) {
        writeReport(targetCatalog.cards, changes);
    }
    console.log(`Correcciones aplicadas a ${filesToWrite.size} archivos.`);
    console.log(`Informe conservado: ${path.relative(repoRoot, reportPath)}`);
    console.log(`Definiciones sin cruce exacto: ${unresolvedDefinitions.length}`);
} else {
    console.log(JSON.stringify(findings, null, 2));
    if (
        findings.remainingPlaceholders
        || findings.remainingDefinitionSuffixes
        || findings.missingTargetMeanings.length
        || findings.englishDescriptionTitles.length
        || findings.englishDescriptionTargets.length
        || findings.cardsWithoutDefinitions.length
        || findings.duplicateDefinitionsWithinCard.length
    ) process.exitCode = 1;
}
