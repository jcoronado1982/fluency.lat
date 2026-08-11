/** Etiquetas compartidas del shell para controles de tarjeta (app + landing demo). */
export const studyCardControlLabels = {
    es: {
        prev: 'Anterior',
        next: 'Siguiente',
        correct: 'Correcto',
        reset: 'Reiniciar',
    },
    en: {
        prev: 'Previous',
        next: 'Next',
        correct: 'Correct',
        reset: 'Reset',
    },
};

export function getStudyCardControlLabels(language = 'en') {
    return studyCardControlLabels[language] || studyCardControlLabels.en;
}
