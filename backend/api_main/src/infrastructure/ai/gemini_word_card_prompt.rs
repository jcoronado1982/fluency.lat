//! System prompt para `AITutor::generate_word_card_draft` — "Crear palabra" (mazo personal, ver
//! `mod_flashcards::card_creation_use_cases`). Vive en infraestructura (contenido específico del
//! proveedor Gemini), no en `mod_flashcards`, siguiendo el mismo criterio que
//! `gemini_landing_demo_prompts.rs`: un proveedor de IA nuevo implementaría su propio equivalente
//! detrás del mismo puerto sin tocar el caso de uso.

/// Las 9 categorías gramaticales que ya existen en el catálogo (`NESTED_LEVEL_CATEGORIES` en
/// `client/src/modules/flashcards/useCases/deckUseCases.js`). Gemini DEBE elegir una de estas.
pub const WORD_CARD_CATEGORIES: &[&str] = &[
    "nouns",
    "verbs",
    "adjectives",
    "adverbs",
    "preposition",
    "pronouns",
    "connectors",
    "determinant",
    "phrasal_verbs",
];

/// Los 3 niveles reales del catálogo (`LEARNING_LEVEL_DECKS` en `mod_flashcards/src/lib.rs`,
/// carpetas físicas `json/<pair>/<categoria>/<nivel>/`). Gemini DEBE elegir uno — no se le
/// pregunta al estudiante (pidió explícitamente que la IA decida, igual que la categoría).
pub const WORD_CARD_LEVELS: &[&str] = &["1-basic", "2-intermediate", "3-advanced"];

/// System prompt: pide EXACTAMENTE el shape que ya usan las cards reales del catálogo (verificado
/// contra `json/es_en/adverbs/2-intermediate/time_frequency.json` y
/// `json/es_en/verbs/2-intermediate/being_state_e_creation.json`). Una sola definición por
/// clasificación (frase de uso cotidiano), no múltiples acepciones — mantiene el flujo simple y
/// rápido. Puede devolver hasta 2 CLASIFICACIONES (no definiciones) cuando la palabra tiene dos
/// usos gramaticales realmente comunes (ej. "record" como verbo y como sustantivo) — pedido
/// explícito del usuario: no forzar una palabra ambigua a una sola categoría.
pub const WORD_CARD_SYSTEM_PROMPT: &str = r#"You are a LEXICOGRAPHER building flashcards for a Spanish-speaking student learning a new language.

You receive a single word or short phrase typed by the student (it may already be in the target language, or in Spanish — infer intent). For EACH grammatical classification you decide to return, you must:
1. Detect its grammatical category — EXACTLY one of: nouns, verbs, adjectives, adverbs, preposition, pronouns, connectors, determinant, phrasal_verbs.
2. Decide the difficulty LEVEL for a language learner — EXACTLY one of: 1-basic, 2-intermediate, 3-advanced. Judge it yourself from how common/simple the word is (e.g. "house", "eat" -> 1-basic; "acquire", "consequently" -> 2-intermediate or 3-advanced). NEVER ask the student — a beginner cannot self-assess this.
3. Produce ONE everyday, common, day-to-day usage sentence (not literary, not rare) that a native speaker would actually say, natural for THAT specific grammatical use.
4. Fill EVERY field below. Do not invent extra fields, do not omit any.

RESPOND EXCLUSIVELY WITH THIS JSON SHAPE (no markdown, no prose, no code fences):
{
  "classifications": [
    {
      "category": "one of the 9 category slugs above",
      "level": "one of: 1-basic, 2-intermediate, 3-advanced",
      "name": "the word/phrase in the target language, lowercase, as it should be studied",
      "phonetic": "IPA transcription, e.g. /rɪˈmeɪn/",
      "spoken_phonetic_us": "IPA transcription (US pronunciation if it differs, otherwise same as phonetic)",
      "search_term": "short slug like verb/stay or adverb/frequency describing the sense taught",
      "is_verb": true or false,
      "group_name": "short human category label in English, Capitalized, e.g. \"Body & Movement\" or \"Adverbs: Frequency\"",
      "definitions": [
        {
          "meaning": "Spanish meaning, Capitalized, may include a slash-separated close synonym, e.g. \"Permanecer/Quedarse\"",
          "usage_example": "one common everyday sentence in the target language using the word naturally for THIS classification's category",
          "usage_example_es": "Spanish translation of usage_example",
          "pronunciation_guide_es": "phonetic respelling of usage_example for a Spanish speaker, words joined by underscores, e.g. /PLIS_riMEIN_SITid_antil_de_END/",
          "char_count": "short string, roughly how many syllables/beats the word has, e.g. \"two\"",
          "usage_context_en": "very short tag in English describing when this sense applies, e.g. \"position/state\"",
          "usage_context_es": "Spanish translation of usage_context_en"
        }
      ]
    }
  ]
}

Rules:
- "classifications" MUST contain 1 or 2 objects, NEVER more, NEVER zero.
- Include a SECOND classification ONLY when the word has a second grammatical use that is genuinely common and everyday (e.g. it works as both a verb and a noun in daily speech, like "run" or "record"). Do NOT add rare, formal, technical, or archaic senses just to fill a second slot — when in doubt, return just 1.
- Each classification's "definitions" MUST contain EXACTLY one object — the single most common everyday sense for THAT category. Do not add alternate senses inside a classification (alternate grammatical uses are separate classifications, not extra definitions).
- Never leave a field empty or null. If unsure, choose the most common/neutral value.
- "category" MUST be one of the 9 slugs listed above, lowercase, exactly as spelled — never invent a new category.
- "level" MUST be exactly one of "1-basic", "2-intermediate", "3-advanced" — never invent a new level, never leave it out.
- Keep usage_example short, natural, and something a person would really say in daily life (greeting, chores, work, family, food, weather, commuting, etc.) — not a quiz sentence, not a dictionary example."#;

/// Mensaje de usuario para `AITutor::generate_word_card_draft`. Cuando el usuario ya eligió
/// categoría/nivel en el preview (`category_override`/`level_override`, siempre ambos presentes o
/// ambos ausentes), se le pide a Gemini una única clasificación escrita específicamente para esa
/// lectura de la palabra — el código además clampa `category`/`level` al valor pedido después
/// (ver `gemini_grpc_provider.rs::generate_word_card_draft`), esto solo mejora la calidad del
/// contenido generado para esa clasificación.
pub fn build_word_card_user_message(
    word: &str,
    course_direction: &str,
    category_override: Option<&str>,
    level_override: Option<&str>,
) -> String {
    let base = format!(
        "STUDENT INPUT: \"{}\"\nCOURSE_DIRECTION: \"{}\" (native_lang_target_lang — the flashcard teaches the TARGET language, i.e. the part after the underscore)",
        word.trim(),
        course_direction
    );
    match (category_override, level_override) {
        (Some(category), Some(level)) => format!(
            "{base}\nThe student has ALREADY CHOSEN how to classify this word: category=\"{category}\", level=\"{level}\". Return EXACTLY ONE classification in \"classifications\", written specifically for THAT grammatical use of the word (not whichever use you would have picked freely) — the definition and usage_example must make sense for a \"{category}\" reading of this word."
        ),
        _ => base,
    }
}
