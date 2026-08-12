use serde::{Deserialize, Serialize};

fn default_course_direction() -> String {
    "es_en".to_string()
}

/// "Crear palabra" — ver `docs/modules/flashcards.md` §Personal Words. Compartido por
/// `POST /api/personal-words/preview` y `.../create`. `category_override`/`level_override` vienen
/// juntos o ninguno de los dos (validado en el caso de uso) — el frontend los manda cuando el
/// usuario editó la categoría/nivel de una fila en el preview, o al confirmar la creación de
/// cualquier fila (incluida la que no tocó), para que `create` nunca tenga que resolver ambigüedad.
#[derive(Debug, Deserialize)]
pub struct CreateWordBody {
    pub word: String,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    #[serde(default)]
    pub category_override: Option<String>,
    #[serde(default)]
    pub level_override: Option<String>,
}

/// "¿Dónde va a caer esta palabra?" — se pide ANTES de generar imagen/audio, para que el usuario
/// confirme el destino en el mismo formulario antes de la parte cara de la generación. Sin
/// overrides, Gemini puede devolver 1 o 2 candidatos (segundo uso gramatical común, ej. verbo Y
/// sustantivo) — el usuario elige cuáles crear editando/destildando filas en el frontend.
#[derive(Debug, Serialize)]
pub struct PreviewWordCandidate {
    pub duplicate: bool,
    pub category: String,
    pub level: String,
    /// Nombre normalizado por Gemini (puede diferir en forma/mayúsculas del texto tipeado).
    pub name: String,
    pub is_new_deck: bool,
    /// Nombre que el usuario ya le puso a ese mazo, si existe y no es la primera palabra.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub existing_topic_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PreviewWordResponse {
    /// 1 o 2 candidatos (2 solo si Gemini detectó un segundo uso gramatical común y cotidiano), o
    /// exactamente 1 si la request trajo `category_override`/`level_override`.
    pub candidates: Vec<PreviewWordCandidate>,
}

#[derive(Debug, Serialize)]
pub struct CreateWordResponse {
    pub duplicate: bool,
    /// Categoría gramatical real detectada (`nouns`, `verbs`, ...).
    pub category: String,
    /// Nivel real detectado (`1-basic`, `2-intermediate`, `3-advanced`).
    pub level: String,
    /// `true` solo cuando esta palabra creó el mazo (primera palabra de esta categoría+nivel para
    /// este usuario) — el frontend ofrece "ponerle nombre" únicamente en ese caso.
    pub is_new_deck: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct PersonalWordsSummaryQuery {
    pub category: String,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
}

#[derive(Debug, Serialize)]
pub struct PersonalDeckSummaryDto {
    /// Nombre de mazo real, listo para anteponer a `deckNames` (`<nivel>/my_words`).
    pub deck: String,
    pub total: usize,
    pub learned: usize,
    /// Nombre puesto por el usuario — `None` si nunca le puso nombre (label genérico en el front).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PersonalWordsSummaryResponse {
    /// 0 a 3 entradas (una por nivel donde el usuario tiene palabras en esta categoría).
    pub decks: Vec<PersonalDeckSummaryDto>,
}

/// "Ponerle nombre al mazo" — ver `docs/modules/flashcards.md` §Personal Words. El mazo debe
/// existir ya (falla si `category`+`level` no tiene ninguna palabra todavía).
#[derive(Debug, Deserialize)]
pub struct RenamePersonalDeckBody {
    pub category: String,
    pub level: String,
    pub topic_name: String,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
}
