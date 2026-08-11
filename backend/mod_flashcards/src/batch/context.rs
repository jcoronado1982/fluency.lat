use std::sync::Arc;

use crate::audio_use_cases::AudioUseCases;
use crate::image_use_cases::ImageUseCases;
use crate::DeckUseCases;

#[derive(Clone)]
pub struct BatchFilter {
    pub category: Option<String>,
    pub deck: Option<String>,
    pub course_direction: String,
}

impl Default for BatchFilter {
    fn default() -> Self {
        Self {
            category: None,
            deck: None,
            course_direction: crate::DEFAULT_COURSE_DIRECTION.to_string(),
        }
    }
}

pub fn parse_batch_filter(args: &[String], flag: &str) -> BatchFilter {
    let pos = args.iter().position(|a| a == flag);

    let dir_pos = args
        .iter()
        .position(|a| a == "--direction" || a == "-d");
    let course_direction = dir_pos
        .and_then(|i| args.get(i + 1).cloned())
        .unwrap_or_else(|| crate::DEFAULT_COURSE_DIRECTION.to_string());

    let mut category = None;
    let mut deck = None;

    if let Some(i) = pos {
        let mut idx = i + 1;
        while idx < args.len() {
            let arg = &args[idx];
            if arg == "--direction" || arg == "-d" {
                idx += 2;
                continue;
            }
            if arg.starts_with("--") || arg.starts_with('-') {
                idx += 1;
                continue;
            }
            if category.is_none() {
                category = Some(arg.clone());
            } else if deck.is_none() {
                deck = Some(arg.clone());
            } else {
                break;
            }
            idx += 1;
        }
    }

    BatchFilter {
        category,
        deck,
        course_direction,
    }
}

#[derive(Clone)]
pub struct BatchSettings {
    pub gcs_images_prefix: String,
    pub gcs_audio_prefix: String,
    pub sync_to_oracle: bool,
    pub oracle_host: String,
    pub local_storage_path: String,
    pub gemini_tts_api_key_backup: Option<String>,
}

pub struct ImageBatchContext {
    pub deck: Arc<DeckUseCases>,
    pub image: Arc<ImageUseCases>,
    pub settings: BatchSettings,
}

pub struct AudioBatchContext {
    pub deck: Arc<DeckUseCases>,
    pub audio: AudioUseCases,
    pub settings: BatchSettings,
}
