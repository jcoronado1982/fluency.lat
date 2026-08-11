/**
 * Dirección del curso derivada del idioma de estudio (contrato ENTRE módulos).
 *
 * `studyLanguage` (UIContext) → `course_direction` que espera el backend:
 * - `es` → `en_es` (hispanohablante estudiando inglés)
 * - `de` → `es_de` (hispanohablante estudiando alemán)
 * - resto → `es_en`
 *
 * Vive en contracts/ porque lo consumen el kit compartido (flashcardStudy),
 * dashboard y flashcards; ningún módulo debe importar esto de otro módulo.
 */
export const getCourseDirectionFromStudyLanguage = (studyLanguage) => {
    if (studyLanguage === 'es') return 'en_es';
    if (studyLanguage === 'de') return 'es_de';
    return 'es_en';
};
