/**
 * Contenido pedagógico de ayuda para el catálogo, adaptado según el curso y gramática real:
 * - en_es: Hispanohablante aprendiendo Inglés
 * - en_es_us: Anglohablante aprendiendo Español
 * - es_de: Hispanohablante aprendiendo Alemán
 */

export const CATEGORY_HELP_BY_COURSE = {
    // ------------------------------------------------------------------------
    // ALEMÁN (es_de): Hispanohablante estudiando Alemán
    // ------------------------------------------------------------------------
    es_de: {
        nouns: {
            title: "Sustantivos (Nomen / Substantive)",
            summary: "En alemán, todos los sustantivos se escriben OBLIGATORIAMENTE con Mayúscula Inicial y llevan género (der, die, das).",
            usage: "Designan personas, cosas o conceptos. Tienen género gramatical masculino (der), femenino (die) o neutro (das).",
            exampleTable: [
                { label: "Masculino (der)", items: ["der Mann = el hombre", "der Hund = el perro"] },
                { label: "Femenino (die)", items: ["die Frau = la mujer", "die Katze = la gata"] },
                { label: "Neutro (das)", items: ["das Kind = el niño", "das Buch = el libro"] },
            ],
            exampleNotes: [
                "Regla de oro: En alemán SIEMPRE escribe la primera letra del sustantivo en MAYÚSCULA (das Buch, die Frau).",
                "Aprende siempre el sustantivo junto con su artículo (der/die/das)."
            ],
            exampleHighlight: ["der", "die", "das", "Mann", "Frau", "Kind", "Hund", "Katze", "Buch"]
        },
        verbs: {
            title: "Verbos (Verben)",
            summary: "Expresan acciones o estados. En alemán van con su terminación en infinitivo (-en / -n) y cambian según el sujeto.",
            usage: "En la oración principal afirmativa, el verbo conjugado ocupa SIEMPRE la posición 2.",
            example: "Por ejemplo:\nIch laufe.\nYo corro.\nEr lernt.\nÉl aprende.\nWir arbeiten.\nNosotros trabajamos.",
            exampleNotes: [
                "Posición 2: 'Heute lerne ich' (Hoy aprendo yo). El verbo conjugado 'lerne' va de segundo."
            ],
            exampleHighlight: ["laufe", "corro", "lernt", "aprende", "arbeiten", "trabajan", "lerne"]
        },
        adjectives: {
            title: "Adjetivos (Adjektive)",
            summary: "Palabras que describen cualidades de sustantivos.",
            usage: "Se declinan si van delante del sustantivo (ej: ein großes Haus), pero no cambian si van después del verbo sein (das Haus ist groß).",
            exampleTable: [
                { label: "Predicativo (sin cambio)", items: ["Das Haus ist groß. = La casa es grande."] },
                { label: "Atributivo (declinado)", items: ["ein großes Haus = una casa grande"] }
            ],
            exampleHighlight: ["groß", "großes"]
        },
        adverbs: {
            title: "Adverbios (Adverbien)",
            summary: "Añaden información sobre tiempo, lugar, modo o causa.",
            usage: "En alemán no cambian su forma. Siguen frecuentemente la regla de orden TE-KA-MO-LO (Tiempo, Causa, Modo, Lugar).",
            exampleNotes: [
                "Ich fahre heute mit dem Bus. (heute = hoy)",
                "Er spricht sehr schnell. (sehr = muy, schnell = rápido)"
            ],
            exampleHighlight: ["heute", "sehr", "schnell"]
        },
        preposition: {
            title: "Preposiciones (Präpositionen)",
            summary: "Conectan palabras exigiendo un caso gramatical específico (Acusativo, Dativo o Genitivo).",
            usage: "Existen las Wechselpräpositionen que usan Acusativo con movimiento y Dativo para posición fija.",
            exampleTable: [
                { label: "Con Acusativo (movimiento)", items: ["Ich gehe in den Park. = Voy al parque."] },
                { label: "Con Dativo (posición)", items: ["Ich bin im Park. = Estoy en el parque."] }
            ],
            exampleHighlight: ["in", "im", "den"]
        },
        pronouns: {
            title: "Pronombres (Pronomen)",
            summary: "Reemplazan al sustantivo y cambian según el caso (Nominativo, Acusativo, Dativo).",
            usage: "Los pronombres personales cambian: ich -> mich (acusativo) / mir (dativo).",
            example: "Ich kenne ihn.\nYo lo conozco a él.\nEr hilft mir.\nÉl me ayuda a mí.",
            exampleHighlight: ["Ich", "ihn", "Er", "mir"]
        },
        connectors: {
            title: "Conectores (Konjunktionen)",
            summary: "Unen oraciones. Pueden mantener el verbo en posición 2 (coord.) o enviarlo al FINAL de la oración (subord.).",
            usage: "Conectores como 'weil' (porque) u 'dass' (que) envían el verbo conjugado al final.",
            exampleNotes: [
                "Ich lerne, weil es wichtig ist. (ist va al final por el conector 'weil').",
                "Ich bin müde, aber ich lerne. ('aber' mantiene posición normal)."
            ],
            exampleHighlight: ["weil", "aber", "ist"]
        },
        determinant: {
            title: "Determinantes / Artículos (Artikel)",
            summary: "Acompañan al sustantivo indicando género y caso (Nominativ, Akkusativ, Dativ, Genitiv).",
            usage: "Artículos definidos (der, die, das) e indefinidos (ein, eine, ein).",
            exampleTable: [
                { label: "Definidos", items: ["der Hund", "die Katze", "das Auto"] },
                { label: "Indefinidos", items: ["ein Hund", "eine Katze", "ein Auto"] }
            ],
            exampleHighlight: ["der", "die", "das", "ein", "eine"]
        },
        phrasal_verbs: {
            title: "Verbos Separables (Trennbare Verben)",
            summary: "Verbos compuestos cuyo prefijo se separa y se coloca al FINAL de la oración conjugada.",
            usage: "Verbos como aufstehen (levantarse), anrufen (llamar), einkaufen (comprar).",
            exampleTable: [
                { label: "Infinitivo", items: ["aufstehen", "anrufen", "einkaufen"] },
                { label: "Oración", items: ["Ich stehe um 7 Uhr auf.", "Ich rufe dich an."] }
            ],
            exampleHighlight: ["aufstehen", "stehe", "auf", "rufe", "an"]
        }
    },

    // ------------------------------------------------------------------------
    // INGLÉS (en / es_en): Hispanohablante estudiando Inglés
    // ------------------------------------------------------------------------
    es_en: {
        verbs: {
            title: "Verbos (Verbs)",
            summary: "Expresan acciones, estados o procesos.",
            usage: "Son indispensables en inglés. Cambian según el tiempo verbal y la 3ª persona singular (he/she/it agrega -s/-es en presente).",
            example: "I run.\nYo corro.\nShe studies.\nElla estudia.\nThey work.\nEllos trabajan.",
            exampleHighlight: ["run", "corro", "studies", "estudia", "work", "trabajan"]
        }
    }
};

/**
 * Obtiene la versión de ayuda personalizada por dirección de curso (es_en, es_de, etc.).
 */
export function getHelpForCourse(courseDirection, category) {
    if (courseDirection === 'es_de') {
        return CATEGORY_HELP_BY_COURSE.es_de[category] || null;
    }
    if (courseDirection === 'es_en') {
        return CATEGORY_HELP_BY_COURSE.es_en[category] || null;
    }
    // en_es: Anglohablante estudiando Español → usa el baseHelpContent del locale 'es' (ya en español)
    return null;
}
