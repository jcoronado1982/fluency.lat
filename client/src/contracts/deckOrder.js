/**
 * Orden curado de mazos (decks) por categoría y nivel — lógica pura, sin i18n
 * ni dependencias de módulo. Contrato compartido entre `flashcards` (dueño
 * original, ver `modules/flashcards/useCases/deckUseCases.js` para la guía de
 * cómo agregar una categoría nueva) y `dashboard` (recomendaciones del home).
 *
 * ⚠️ Historial de bugs: NO matchear decks contra `catalogOrder.json` — ese
 * catálogo guarda nombres display ("Subject", "Being & State") que nunca
 * coinciden con los nombres de archivo del backend ("subject_pronouns",
 * "being_state"). El orden se deriva siempre de los nombres de archivo reales.
 */

export const LEVEL_ORDER = { basic: 1, intermediate: 2, advanced: 3 };

const PRONOUN_DECK_ORDER = {
    basic: {
        subject_pronouns: 1,
        object_pronouns: 2,
        possessive_adjectives: 3,
        indefinite_pronouns: 4,
        quantifier_pronouns: 5,
        interrogative_pronouns: 6,
    },
};
const VERB_DECK_ORDER = {
    basic: {
        being_state: 1,
        action: 2,
        communication: 3,
        movement: 4,
        feelings: 5,
        possession_exchange: 6,
        thinking: 7,
        modal_auxiliaries: 8,
    },
};
const NOUN_DECK_ORDER = {
    basic: {
        body: 1,
        clothes: 2,
        personal_items: 3,
        feelings: 4,
        states_conditions: 5,
        health: 6,
        family: 7,
        people: 8,
        communication: 9,
        cognition_language: 10,
        social_customs: 11,
        clock_time: 12,
        day_parts: 13,
        week_cycle: 14,
        calendar: 15,
        seasons: 16,
        home_rooms: 17,
        household_items: 18,
        food_drink: 19,
        materials_substances: 20,
        location: 21,
        places: 22,
        transport: 23,
        work: 24,
        jobs: 25,
        school: 26,
        economy: 27,
        society: 28,
        nature: 29,
        animals: 30,
        colors: 31,
        continents: 32,
        countries: 33,
        oceans_seas: 34,
        numbers: 35,
        measurement_quantity: 36,
        classification: 37,
        logic_reasoning: 38,
        process_change: 39,
        structure_components: 40,
        technology: 41,
        media: 42,
        sports: 43,
    },
};
const ADVERB_DECK_ORDER = {
    basic: {
        core_survival: 1,
        frequency_routine: 2,
        place_direction: 3,
        time_sequence: 4,
        manner_degree_quantity: 5,
        interrogative_adverbs: 6,
    },
};
const ADJECTIVE_DECK_ORDER = {
    basic: {
        physical_state_and_condition: 1,
        emotions_and_personality: 2,
        space_size_and_crowds: 3,
        time_change_and_age: 4,
        access_readiness_and_effort: 5,
        value_cost_and_evaluation: 6,
        health_safety_and_emergency: 7,
    },
};
const CONNECTOR_DECK_ORDER = {
    basic: {
        everyday_addition_examples: 1,
        time_and_sequence: 2,
        cause_effect_basics: 3,
        contrast_condition_basics: 4,
    },
};
const PREPOSITION_DECK_ORDER = {
    basic: {
        place_and_time: 1,
        direction_and_movement: 2,
        relation_purpose_and_reference: 3,
    },
    intermediate: {
        space_and_extent: 1,
        logic_reference_and_method: 2,
    },
    advanced: {
        contrast_and_reference: 1,
        formal_topic_and_extension: 2,
    },
};
const DETERMINANT_DECK_ORDER = {
    basic: {
        reference_and_selection: 1,
        possessive: 2,
        quantifier: 3,
        numbers_and_order: 4,
    },
    intermediate: {
        partitives_and_emphasis: 1,
        quantity_and_measure: 2,
        selection_and_possession: 3,
    },
    advanced: {
        compound_and_partitive: 1,
        reference_and_relation: 2,
    },
};
const PHRASAL_VERBS_DECK_ORDER = {
    basic: {
        daily_life_home: 1,
        movement_travel: 2,
        communication_social: 3,
        search_understanding: 4,
        progress_reactions: 5,
        difficult_situations: 6,
        safety_emergencies: 7,
    },
    intermediate: {
        change_results: 1,
        communication_exchange: 2,
        complex_actions: 3,
        daily_decisions: 4,
        learning_problem_solving: 5,
        movement_transport: 6,
        relationships_care: 7,
        social_visits: 8,
        work_progress: 9,
    },
    advanced: {
        change_action: 1,
        conflict_resistance: 2,
        goals_progress: 3,
        reasoning_meaning: 4,
        social_outcomes: 5,
    },
};

export const getLevelFromDeckName = (deckName) => {
    if (!deckName) return 'basic';
    const lower = deckName.toLowerCase();
    if (lower.includes('advanced')) return 'advanced';
    if (lower.includes('intermediate')) return 'intermediate';
    if (lower.includes('basic')) return 'basic';
    return 'basic';
};

export const getDeckCategoryName = (deckName) => {
    if (!deckName) return '';
    const [maybeLevel, maybeCategory] = deckName.split('/');
    return maybeCategory ? maybeCategory.replace('.json', '') : maybeLevel.replace('.json', '');
};

const DECK_LABELS = {
    access_readiness_and_effort: 'Access, Readiness & Effort',
    action: 'Action',
    addition_and_clarification: 'Addition & Clarification',
    ability_and_achievement: 'Ability & Achievement',
    analysis_research: 'Analysis & Research',
    appearance_and_status: 'Appearance & Status',
    body: 'Body',
    being_state: 'Being State',
    calendar: 'Calendar',
    cause_effect_basics: 'Cause & Effect Basics',
    change_action: 'Change Action',
    change_results: 'Change Results',
    classification: 'Classification',
    clock_time: 'Clock & Time',
    cognition_language: 'Cognition & Language',
    clothes: 'Clothing',
    colors: 'Colors',
    communication: 'Communication',
    communication_social: 'Communication & Social',
    communication_exchange: 'Communication Exchange',
    complex_actions: 'Complex Actions',
    compound_and_partitive: 'Compound & Partitive',
    conflict_resistance: 'Conflict & Resistance',
    continents: 'Continents',
    contrast_and_condition: 'Contrast & Condition',
    contrast_and_reference: 'Contrast & Reference',
    contrast_condition_basics: 'Contrast & Condition Basics',
    core_survival: 'Core Survival',
    countries: 'Countries',
    daily_decisions: 'Daily Decisions',
    daily_life_home: 'Daily Life & Home',
    day_parts: 'Day Parts',
    degree_focus: 'Degree & Focus',
    degree_precision: 'Degree & Precision',
    difficult_situations: 'Difficult Situations',
    direction_and_movement: 'Direction & Movement',
    discourse_logic: 'Discourse & Logic',
    economy: 'Economy',
    emotions_and_personality: 'Emotions & Personality',
    evaluation_comparison_and_comfort: 'Evaluation, Comparison & Comfort',
    evaluation_quality: 'Evaluation & Quality',
    everyday_addition_examples: 'Everyday Addition & Examples',
    examples_and_conclusions: 'Examples & Conclusions',
    experience_and_life_state: 'Experience & Life State',
    family: 'Family',
    feelings: 'Feelings',
    feelings_and_emotions: 'Feelings & Emotions',
    feelings_emotions: 'Feelings & Emotions',
    food_drink: 'Food & Drink',
    formal_addition_clarification: 'Formal Addition & Clarification',
    formal_cause_effect: 'Formal Cause & Effect',
    formal_condition_contrast: 'Formal Condition & Contrast',
    formal_topic_and_extension: 'Formal Topic & Extension',
    frequency_routine: 'Frequency & Routine',
    frequency_time: 'Frequency & Time',
    goals_plans: 'Goals & Plans',
    goals_progress: 'Goals & Progress',
    health: 'Health',
    health_safety_and_emergency: 'Health, Safety & Emergency',
    home_rooms: 'Home & Rooms',
    household_items: 'Household Items',
    demonstrative_pronouns: 'Demonstrative Pronouns',
    indefinite_pronouns: 'Indefinite Pronouns',
    interrogative_adverbs: 'Interrogative Adverbs',
    interrogative_and_relative_pronouns: 'Interrogative & Relative Pronouns',
    interrogative_pronouns: 'Interrogative Pronouns',
    learning_problem_solving: 'Learning & Problem Solving',
    location: 'Location',
    logic_reasoning: 'Logic & Reasoning',
    logic_reference_and_method: 'Logic, Reference & Method',
    manner_action: 'Manner & Action',
    manner_degree_quantity: 'Manner, Degree & Quantity',
    manner_precision: 'Manner & Precision',
    materials_substances: 'Materials & Substances',
    measurement_quantity: 'Measurement & Quantity',
    media: 'Media',
    movement: 'Movement',
    movement_transport: 'Movement & Transport',
    movement_travel: 'Movement & Travel',
    nature: 'Nature',
    numbers: 'Numbers',
    numbers_and_order: 'Numbers & Order',
    object_pronouns: 'Object Pronouns',
    oceans_seas: 'Oceans & Seas',
    jobs: 'Jobs',
    partitives_and_emphasis: 'Partitives & Emphasis',
    personal_items: 'Personal Items',
    personality_and_character: 'Personality & Character',
    physical_state_and_condition: 'Physical State & Condition',
    place_and_time: 'Place & Time',
    place_direction: 'Place & Direction',
    possessive: 'Possessive',
    possessive_adjectives: 'Possessive Adjectives',
    possessive_pronouns_and_emphasis: 'Possessive Pronouns & Emphasis',
    possession_exchange: 'Possession Exchange',
    process_change: 'Process & Change',
    progress_reactions: 'Progress & Reactions',
    quantifier: 'Quantifier',
    quantifier_and_partitive_pronouns: 'Quantifier & Partitive Pronouns',
    quantity_and_measure: 'Quantity & Measure',
    reasoning_meaning: 'Reasoning & Meaning',
    reason_time_and_reference: 'Reason, Time & Reference',
    reference_and_relation: 'Reference & Relation',
    reference_and_selection: 'Reference & Selection',
    reflexive_and_reciprocal_pronouns: 'Reflexive & Reciprocal Pronouns',
    relation_purpose_and_reference: 'Relation, Purpose & Reference',
    relationships_care: 'Relationships & Care',
    safety_emergencies: 'Safety & Emergencies',
    school: 'School',
    science: 'Science',
    search_understanding: 'Search & Understanding',
    seasons: 'Seasons',
    selection_and_possession: 'Selection & Possession',
    sentence_stance: 'Sentence & Stance',
    social_customs: 'Social Customs',
    social_outcomes: 'Social Outcomes',
    social_relations: 'Social Relations',
    social_visits: 'Social Visits',
    space_and_extent: 'Space & Extent',
    space_size_and_crowds: 'Space, Size & Crowds',
    spirit_identity: 'Spirit & Identity',
    sports: 'Sports',
    stance_certainty: 'Stance & Certainty',
    states_conditions: 'States & Conditions',
    structure_components: 'Structure & Components',
    subject_pronouns: 'Subject Pronouns',
    technology: 'Technology',
    thinking: 'Thinking & Senses',
    time_and_sequence: 'Time & Sequence',
    time_change_and_age: 'Time, Change & Age',
    time_frequency: 'Time & Frequency',
    time_sequence: 'Time & Sequence',
    transport: 'Transport',
    value_cost_and_evaluation: 'Value, Cost & Evaluation',
    week_cycle: 'Week Cycle',
    work: 'Work',
    work_progress: 'Work & Progress',
};

/**
 * Etiqueta de categoría a partir del nombre de archivo del deck — lógica pura,
 * sin i18n. `groupTranslations` es un diccionario opcional inglés→idioma-destino
 * (ej. `contracts/deckGroupTranslations.js`); sin él, devuelve la etiqueta base en
 * inglés. Cada módulo decide qué traducciones inyectar — este archivo no conoce
 * ningún i18n concreto.
 */
export const formatDeckCategoryName = (deckName, groupTranslations = null) => {
    const deckCategory = getDeckCategoryName(deckName);
    const normalizedLabel = DECK_LABELS[deckCategory]
        || deckCategory
            .replace(/[_-]/g, ' ')
            .split(' ')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    return groupTranslations?.[normalizedLabel] || normalizedLabel;
};

export const sortDeckNames = (files, _category = null) => {
    const names = files.map((f) => f.replace('.json', ''));
    return names.sort((a, b) => {
        const levelDiff = (LEVEL_ORDER[getLevelFromDeckName(a)] ?? 99) - (LEVEL_ORDER[getLevelFromDeckName(b)] ?? 99);
        if (levelDiff !== 0) return levelDiff;

        if (_category === 'pronouns') {
            const level = getLevelFromDeckName(a);
            const pronounOrder = PRONOUN_DECK_ORDER[level];
            if (pronounOrder) {
                const categoryA = getDeckCategoryName(a);
                const categoryB = getDeckCategoryName(b);
                const orderA = pronounOrder[categoryA];
                const orderB = pronounOrder[categoryB];
                const aKnown = Number.isFinite(orderA);
                const bKnown = Number.isFinite(orderB);

                if (aKnown && bKnown) return orderA - orderB;
                if (aKnown) return -1;
                if (bKnown) return 1;
            }
        }

        if (_category === 'verbs') {
            const level = getLevelFromDeckName(a);
            const verbOrder = VERB_DECK_ORDER[level];
            if (verbOrder) {
                const categoryA = getDeckCategoryName(a);
                const categoryB = getDeckCategoryName(b);
                const orderA = verbOrder[categoryA];
                const orderB = verbOrder[categoryB];
                const aKnown = Number.isFinite(orderA);
                const bKnown = Number.isFinite(orderB);

                if (aKnown && bKnown) return orderA - orderB;
                if (aKnown) return -1;
                if (bKnown) return 1;
            }
        }

        if (_category === 'nouns') {
            const level = getLevelFromDeckName(a);
            const nounOrder = NOUN_DECK_ORDER[level];
            if (nounOrder) {
                const categoryA = getDeckCategoryName(a);
                const categoryB = getDeckCategoryName(b);
                const orderA = nounOrder[categoryA];
                const orderB = nounOrder[categoryB];
                const aKnown = Number.isFinite(orderA);
                const bKnown = Number.isFinite(orderB);

                if (aKnown && bKnown) return orderA - orderB;
                if (aKnown) return -1;
                if (bKnown) return 1;
            }
        }

        if (_category === 'adverbs') {
            const level = getLevelFromDeckName(a);
            const adverbOrder = ADVERB_DECK_ORDER[level];
            if (adverbOrder) {
                const categoryA = getDeckCategoryName(a);
                const categoryB = getDeckCategoryName(b);
                const orderA = adverbOrder[categoryA];
                const orderB = adverbOrder[categoryB];
                const aKnown = Number.isFinite(orderA);
                const bKnown = Number.isFinite(orderB);

                if (aKnown && bKnown) return orderA - orderB;
                if (aKnown) return -1;
                if (bKnown) return 1;
            }
        }

        if (_category === 'adjectives') {
            const level = getLevelFromDeckName(a);
            const adjectiveOrder = ADJECTIVE_DECK_ORDER[level];
            if (adjectiveOrder) {
                const categoryA = getDeckCategoryName(a);
                const categoryB = getDeckCategoryName(b);
                const orderA = adjectiveOrder[categoryA];
                const orderB = adjectiveOrder[categoryB];
                const aKnown = Number.isFinite(orderA);
                const bKnown = Number.isFinite(orderB);

                if (aKnown && bKnown) return orderA - orderB;
                if (aKnown) return -1;
                if (bKnown) return 1;
            }
        }

        if (_category === 'connectors') {
            const level = getLevelFromDeckName(a);
            const connectorOrder = CONNECTOR_DECK_ORDER[level];
            if (connectorOrder) {
                const categoryA = getDeckCategoryName(a);
                const categoryB = getDeckCategoryName(b);
                const orderA = connectorOrder[categoryA];
                const orderB = connectorOrder[categoryB];
                const aKnown = Number.isFinite(orderA);
                const bKnown = Number.isFinite(orderB);

                if (aKnown && bKnown) return orderA - orderB;
                if (aKnown) return -1;
                if (bKnown) return 1;
            }
        }

        if (_category === 'preposition') {
            const level = getLevelFromDeckName(a);
            const prepositionOrder = PREPOSITION_DECK_ORDER[level];
            if (prepositionOrder) {
                const categoryA = getDeckCategoryName(a);
                const categoryB = getDeckCategoryName(b);
                const orderA = prepositionOrder[categoryA];
                const orderB = prepositionOrder[categoryB];
                const aKnown = Number.isFinite(orderA);
                const bKnown = Number.isFinite(orderB);

                if (aKnown && bKnown) return orderA - orderB;
                if (aKnown) return -1;
                if (bKnown) return 1;
            }
        }

        if (_category === 'determinant') {
            const level = getLevelFromDeckName(a);
            const determinantOrder = DETERMINANT_DECK_ORDER[level];
            if (determinantOrder) {
                const categoryA = getDeckCategoryName(a);
                const categoryB = getDeckCategoryName(b);
                const orderA = determinantOrder[categoryA];
                const orderB = determinantOrder[categoryB];
                const aKnown = Number.isFinite(orderA);
                const bKnown = Number.isFinite(orderB);

                if (aKnown && bKnown) return orderA - orderB;
                if (aKnown) return -1;
                if (bKnown) return 1;
            }
        }

        if (_category === 'phrasal_verbs') {
            const level = getLevelFromDeckName(a);
            const phrasalVerbsOrder = PHRASAL_VERBS_DECK_ORDER[level];
            if (phrasalVerbsOrder) {
                const categoryA = getDeckCategoryName(a);
                const categoryB = getDeckCategoryName(b);
                const orderA = phrasalVerbsOrder[categoryA];
                const orderB = phrasalVerbsOrder[categoryB];
                const aKnown = Number.isFinite(orderA);
                const bKnown = Number.isFinite(orderB);

                if (aKnown && bKnown) return orderA - orderB;
                if (aKnown) return -1;
                if (bKnown) return 1;
            }
        }

        // 💡 NOTA: Si agregas una nueva categoría (ej: 'connectors'), agrega aquí su bloque 'if'
        // apuntando a su respectivo objeto XXX_DECK_ORDER para evitar el ordenamiento alfabético por defecto.

        // Fallback: Si no hay ordenamiento definido en los mapas, ordena alfabéticamente
        const categoryA = getDeckCategoryName(a);
        const categoryB = getDeckCategoryName(b);
        return categoryA.localeCompare(categoryB);
    });
};
