use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Flashcard {
    #[serde(default)]
    pub word: String,
    #[serde(default)]
    pub translation: String,
    pub example: Option<String>,
    #[serde(default)]
    pub learned: bool,
    pub learned_at: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum DeckData {
    Object {
        flashcards: Vec<Flashcard>,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
    Array(Vec<Flashcard>),
}

impl DeckData {
    pub fn flashcards(&self) -> &[Flashcard] {
        match self {
            DeckData::Object { flashcards, .. } => flashcards,
            DeckData::Array(cards) => cards,
        }
    }

    pub fn flashcards_mut(&mut self) -> &mut Vec<Flashcard> {
        match self {
            DeckData::Object { flashcards, .. } => flashcards,
            DeckData::Array(cards) => cards,
        }
    }
}

impl Flashcard {
    /// Marca de retiro del catálogo puesta por un admin (`DELETE /api/delete-card`).
    ///
    /// La tarjeta sigue físicamente en el array del mazo — sacarla correría en 1 el índice de
    /// todas las siguientes, y tanto el progreso del usuario en SurrealDB como las rutas de
    /// imagen (`<categoria>/<mazo>/<mazo>_card_N_defM`, compartidas por TODAS las direcciones de
    /// curso) direccionan por posición. Retirada significa "no se entrega como tarjeta
    /// estudiable", no "no está en el archivo".
    pub fn is_deleted(&self) -> bool {
        self.extra
            .get("deleted")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    }

    pub fn resolved_word(&self) -> &str {
        if !self.word.trim().is_empty() {
            return self.word.trim();
        }
        if let Some(n) = self.extra.get("name").and_then(|v| v.as_str()) {
            if !n.trim().is_empty() {
                return n.trim();
            }
        }
        ""
    }

    pub fn resolved_translation(&self) -> String {
        if !self.translation.trim().is_empty() {
            return self.translation.trim().to_string();
        }
        if let Some(defs) = self.extra.get("definitions").and_then(|v| v.as_array()) {
            if let Some(first) = defs.first() {
                if let Some(m) = first.get("meaning").and_then(|v| v.as_str()) {
                    return m.trim().to_string();
                }
            }
        }
        "".to_string()
    }

    pub fn resolved_example(&self) -> String {
        if let Some(ref ex) = self.example {
            if !ex.trim().is_empty() {
                return ex.trim().to_string();
            }
        }
        if let Some(defs) = self.extra.get("definitions").and_then(|v| v.as_array()) {
            if let Some(first) = defs.first() {
                if let Some(ex) = first.get("usage_example").and_then(|v| v.as_str()) {
                    return ex.trim().to_string();
                }
            }
        }
        if let Some(t) = self.extra.get("text").and_then(|v| v.as_str()) {
            return t.trim().to_string();
        }
        "".to_string()
    }
}
