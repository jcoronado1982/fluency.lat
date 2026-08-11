/** studyLanguage: idioma que el usuario quiere aprender ('en' | 'es'). */
export function isLearningEnglish(studyLanguage) {
    return studyLanguage === 'en';
}

/**
 * Las aclaraciones entre paréntesis pertenecen al contexto de la acepción,
 * no a la palabra que el estudiante debe ver ni escuchar.
 */
export function getCleanSpanishTerm(value) {
    return String(value || '')
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s+,/g, ',')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export function getCardTitle(displayData, studyLanguage) {
    const title = displayData.name || '';
    return isLearningEnglish(studyLanguage) ? title : getCleanSpanishTerm(title);
}

/**
 * Ejemplo principal: en el idioma que se está APRENDIENDO.
 *
 * ESTRUCTURA DEL CATÁLOGO (misma convención en todos los cursos):
 *   usage_example    → ejemplo en el idioma TARGET (el que se aprende)
 *                      es_en: inglés | en_es: español | es_de: alemán
 *   usage_example_es → referencia/traducción para el estudiante
 *                      es_en: español | en_es: inglés | es_de: español
 *
 * Por tanto: siempre mostramos usage_example como ejemplo principal.
 */
export function getStudyExampleText(definition, _studyLanguage) {
    if (!definition) return '';
    return definition.usage_example || '';
}

/**
 * Ejemplo de REFERENCIA: en el idioma origen del estudiante.
 * Siempre es usage_example_es (que contiene la traducción/referencia).
 */
export function getReferenceExampleText(definition, _studyLanguage) {
    if (!definition) return '';
    return definition.usage_example_es || '';
}

export function getReferenceMeaning(definition) {
    return definition?.meaning || '';
}

/**
 * Una palabra inglesa puede necesitar traducciones españolas distintas según
 * la acepción (p. ej. sleep: dormir / alojar). El catálogo en_es conserva esa
 * diferencia por definición sin cambiar el título principal de la tarjeta.
 */
export function getDefinitionStudyTerm(definition, fallbackTitle, studyLanguage) {
    if (!isLearningEnglish(studyLanguage)) {
        const spanishMeaning = definition?.target_meaning_es?.trim();
        if (spanishMeaning) return getCleanSpanishTerm(spanishMeaning);
    }

    return fallbackTitle || '';
}

export function getMeaningConnector(studyLanguage) {
    return isLearningEnglish(studyLanguage) ? 'means' : 'significa';
}

/** TTS del texto visible en la tarjeta (mismo idioma que se estudia). */
export function getAudioLang(studyLanguage) {
    if (studyLanguage === 'de') return 'de';
    return isLearningEnglish(studyLanguage) ? 'en' : 'es';
}

/** Conjugaciones e IPA de verbos en inglés. */
export function getAudioLangForConjugation() {
    return 'en';
}
