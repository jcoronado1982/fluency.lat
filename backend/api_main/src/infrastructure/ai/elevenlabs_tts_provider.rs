//! ElevenLabs TTS — usado solo en el namespace `landing-demo`.

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use rand::seq::SliceRandom;
use serde::Serialize;

use crate::config::Settings;
use crate::domain::repositories::audio::AudioGenerator;

/// Bump al cambiar backend/voz/formato del demo para invalidar caché de audio landing-demo.
#[allow(dead_code)]
pub const ELEVENLABS_TTS_BACKEND: &str = "elevenlabs-premade-v1";

const DEFAULT_MODEL: &str = "eleven_v3";
const OUTPUT_FORMAT: &str = "mp3_44100_128";

/// Voces premade del demo (plan free API): (etiqueta legible, voice_id ElevenLabs).
pub const ELEVENLABS_DEMO_VOICES: &[(&str, &str)] = &[
    ("Roger", "CwhRBWXzGAHq8TQ4Fs17"),
    ("Brian", "nPczCjzI2devNBz1zQrb"),
    ("Adam", "pNInz6obpgDQGcFmaJgB"),
    ("Jessica", "cgSgspJ2msm6clMCkdW9"),
    ("Matilda", "XrExE9yKIg1WjnnlVkGX"),
];

pub fn resolve_elevenlabs_voice_id(voice_name: &str) -> &str {
    if voice_name.len() >= 18 && voice_name.chars().all(|c| c.is_ascii_alphanumeric()) {
        return voice_name;
    }
    ELEVENLABS_DEMO_VOICES
        .iter()
        .find(|(label, _)| label.eq_ignore_ascii_case(voice_name))
        .map(|(_, id)| *id)
        .unwrap_or(ELEVENLABS_DEMO_VOICES[0].1)
}

pub struct ElevenLabsTtsProvider {
    api_key: String,
    model_id: String,
    client: reqwest::Client,
}

impl ElevenLabsTtsProvider {
    pub fn from_settings(settings: &Settings) -> Option<Self> {
        let api_key = settings
            .elevenlabs_api_key
            .as_ref()
            .filter(|k| !k.is_empty())?;
        Some(Self {
            api_key: api_key.clone(),
            model_id: settings
                .elevenlabs_model_id
                .clone()
                .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            client: reqwest::Client::new(),
        })
    }

    async fn synthesize_mp3(&self, text: &str, voice_id: &str) -> Result<Vec<u8>> {
        let url = format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format={OUTPUT_FORMAT}"
        );

        #[derive(Serialize)]
        struct Body<'a> {
            text: &'a str,
            model_id: &'a str,
            voice_settings: VoiceSettings,
        }

        #[derive(Serialize)]
        struct VoiceSettings {
            stability: f32,
            similarity_boost: f32,
        }

        let body = Body {
            text,
            model_id: &self.model_id,
            voice_settings: VoiceSettings {
                stability: 0.5,
                similarity_boost: 0.78,
            },
        };

        let res = self
            .client
            .post(&url)
            .header("xi-api-key", &self.api_key)
            .header("Accept", "audio/mpeg")
            .json(&body)
            .send()
            .await
            .context("ElevenLabs request failed")?;

        if !res.status().is_success() {
            let status = res.status();
            let detail = res.text().await.unwrap_or_default();
            return Err(anyhow!("ElevenLabs HTTP {status}: {detail}"));
        }

        Ok(res.bytes().await?.to_vec())
    }
}

#[async_trait]
impl AudioGenerator for ElevenLabsTtsProvider {
    async fn synthesize(
        &self,
        text: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        let _ = lang;
        let voice_id = resolve_elevenlabs_voice_id(voice_name);
        tracing::info!(
            "🎙️ ElevenLabs demo TTS: voice='{}' id='{}' model='{}' text='{}'",
            voice_name,
            voice_id,
            self.model_id,
            text
        );
        self.synthesize_mp3(text, voice_id).await
    }

    async fn synthesize_ssml(
        &self,
        ssml: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        let text = ssml
            .replace("<speak>", "")
            .replace("</speak>", "")
            .replace("<break time=\"500ms\"/>", ", ");
        self.synthesize(text.trim(), voice_name, lang).await
    }

    fn pick_voice(&self, exclude: Option<&str>) -> (String, String) {
        let candidates: Vec<(&str, &str)> = ELEVENLABS_DEMO_VOICES
            .iter()
            .copied()
            .filter(|(label, _)| {
                exclude
                    .map(|e| !label.eq_ignore_ascii_case(e))
                    .unwrap_or(true)
            })
            .collect();
        let (label, id) = candidates
            .choose(&mut rand::thread_rng())
            .copied()
            .unwrap_or(ELEVENLABS_DEMO_VOICES[0]);
        (label.to_string(), id.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_roger_voice_label() {
        assert_eq!(resolve_elevenlabs_voice_id("Roger"), "CwhRBWXzGAHq8TQ4Fs17");
    }

    fn provider() -> ElevenLabsTtsProvider {
        ElevenLabsTtsProvider {
            api_key: "test-key".to_string(),
            model_id: DEFAULT_MODEL.to_string(),
            client: reqwest::Client::new(),
        }
    }

    #[test]
    fn pick_voice_returns_a_label_and_id_from_the_demo_pool() {
        let (label, id) = provider().pick_voice(None);
        assert!(ELEVENLABS_DEMO_VOICES.contains(&(label.as_str(), id.as_str())));
    }

    #[test]
    fn pick_voice_respects_exclude_for_every_voice_in_the_pool() {
        let p = provider();
        for (label, _) in ELEVENLABS_DEMO_VOICES {
            let (picked, _) = p.pick_voice(Some(label));
            assert_ne!(&picked, label);
        }
    }

    #[test]
    fn passes_through_voice_id() {
        assert_eq!(
            resolve_elevenlabs_voice_id("cgSgspJ2msm6clMCkdW9"),
            "cgSgspJ2msm6clMCkdW9"
        );
    }
}
