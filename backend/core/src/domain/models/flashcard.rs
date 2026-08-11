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
