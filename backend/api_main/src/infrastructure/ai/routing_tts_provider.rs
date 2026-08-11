use anyhow::Result;
/// Routes TTS to Gemini AI Studio for all supported languages.
use async_trait::async_trait;
use rand::seq::SliceRandom;
use rand::Rng;

use crate::config::Settings;
use crate::domain::repositories::audio::AudioGenerator;
use crate::infrastructure::ai::gemini_tts_provider::GeminiTtsProvider;

/// Bump when changing the Gemini TTS routing policy so cached ES audio is regenerated.
pub const SPANISH_TTS_BACKEND: &str = "ai-studio-gemini-es-419-v1";

/// Nombres de voz de Gemini AI Studio — específicos de este proveedor (un proveedor nuevo
/// tendría su propio catálogo). Solo se usan detrás de `pick_voice`.
const GEMINI_MALE_VOICES: &[&str] = &[
    "Algenib",
    "Algieba",
    "Alnilam",
    "Charon",
    "Enceladus",
    "Iapetus",
    "Orus",
    "Fenrir",
    "Puck",
    "Sadaltager",
    "Umbriel",
];
const GEMINI_FEMALE_VOICES: &[&str] = &[
    "Achernar",
    "Autonoe",
    "Callirrhoe",
    "Erinome",
    "Gacrux",
    "Kore",
    "Laomedeia",
    "Sulafat",
    "Zephyr",
    "Aoede",
];
const GEMINI_VOICE_POOL: &[&str] = &[
    "Achernar",
    "Algenib",
    "Algieba",
    "Alnilam",
    "Autonoe",
    "Aoede",
    "Callirrhoe",
    "Charon",
    "Enceladus",
    "Erinome",
    "Fenrir",
    "Gacrux",
    "Iapetus",
    "Kore",
    "Laomedeia",
    "Orus",
    "Puck",
    "Sadaltager",
    "Sulafat",
    "Umbriel",
    "Zephyr",
];

pub struct RoutingTtsProvider {
    gemini: GeminiTtsProvider,
}

impl RoutingTtsProvider {
    pub async fn new(settings: &Settings) -> Result<Self> {
        Ok(Self {
            gemini: GeminiTtsProvider::new(settings)?,
        })
    }
}

#[async_trait]
impl AudioGenerator for RoutingTtsProvider {
    async fn synthesize(
        &self,
        text: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        tracing::info!(
            "🎙️ TTS Gemini AI Studio → backend='{}', lang='{}', texto='{}'",
            SPANISH_TTS_BACKEND,
            lang.unwrap_or("en"),
            text
        );
        self.gemini.synthesize(text, voice_name, lang).await
    }

    async fn synthesize_ssml(
        &self,
        ssml: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        tracing::info!(
            "🎙️ TTS Gemini AI Studio (SSML) → backend='{}', lang='{}'",
            SPANISH_TTS_BACKEND,
            lang.unwrap_or("en")
        );
        self.gemini.synthesize_ssml(ssml, voice_name, lang).await
    }

    fn pick_voice(&self, exclude: Option<&str>) -> (String, String) {
        let mut rng = rand::thread_rng();
        // 50/50 masculino/femenino — la lista original tenía 10F vs 2M.
        let pool: &[&str] = if rng.gen_bool(0.5) {
            GEMINI_MALE_VOICES
        } else {
            GEMINI_FEMALE_VOICES
        };
        let candidates: Vec<&str> = pool
            .iter()
            .copied()
            .filter(|v| exclude.map(|e| !v.eq_ignore_ascii_case(e)).unwrap_or(true))
            .collect();
        let voice = if let Some(v) = candidates.choose(&mut rng) {
            (*v).to_string()
        } else {
            // Fallback si exclude agotó un pool entero.
            GEMINI_VOICE_POOL
                .iter()
                .copied()
                .filter(|v| exclude.map(|e| !v.eq_ignore_ascii_case(e)).unwrap_or(true))
                .collect::<Vec<_>>()
                .choose(&mut rng)
                .copied()
                .unwrap_or("Charon")
                .to_string()
        };
        (voice.clone(), voice)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_settings() -> Settings {
        Settings {
            project_id: String::new(),
            region: String::new(),
            gcs_json_prefix: String::new(),
            gcs_images_prefix: String::new(),
            gcs_audio_prefix: String::new(),
            database_url: String::new(),
            gemini_api_key: Some("fallback-gemini".into()),
            image_ai_enabled: true,
            gemini_tts_api_key: Some("primary-tts".into()),
            gemini_image_api_key: None,
            gemini_tts_api_key_backup: None,
            gcp_api_key: None,
            comfy_url: String::new(),
            local_storage_path: String::new(),
            sync_to_oracle: false,
            oracle_repository_only: false,
            oracle_host: String::new(),
            oracle_ssh_password: String::new(),
            oracle_remote_path: String::new(),
            public_base_url: String::new(),
            media_delivery_provider: "oracle".into(),
            elevenlabs_api_key: None,
            elevenlabs_model_id: None,
            lemon_squeezy_api_key: None,
            lemon_squeezy_store_id: None,
            lemon_squeezy_variant_monthly: None,
            lemon_squeezy_variant_annual: None,
            lemon_squeezy_webhook_secret: None,
            ollama_url: String::new(),
            local_agent_model: String::new(),
            local_agent_workspace_root: String::new(),
            local_agent_max_steps: 0,
            local_agent_allowed_command_prefixes: Vec::new(),
            is_production: false,
        }
    }

    async fn provider() -> RoutingTtsProvider {
        RoutingTtsProvider::new(&sample_settings())
            .await
            .expect("RoutingTtsProvider::new debe construirse con una API key de prueba")
    }

    #[tokio::test]
    async fn pick_voice_returns_the_same_label_and_id_for_gemini() {
        let provider = provider().await;
        let (label, id) = provider.pick_voice(None);
        assert_eq!(label, id, "Gemini es un solo namespace: label == voice_id");
        let all_voices: Vec<&str> = GEMINI_MALE_VOICES
            .iter()
            .chain(GEMINI_FEMALE_VOICES.iter())
            .copied()
            .collect();
        assert!(
            all_voices.contains(&label.as_str()),
            "{label} debe venir de los pools masculino/femenino"
        );
    }

    #[tokio::test]
    async fn pick_voice_never_returns_the_excluded_voice() {
        let provider = provider().await;
        for _ in 0..50 {
            let (voice, _) = provider.pick_voice(Some("Charon"));
            assert_ne!(voice, "Charon");
        }
    }

    #[tokio::test]
    async fn pick_voice_respects_exclude_for_every_voice_in_both_pools() {
        let provider = provider().await;
        for voice in GEMINI_MALE_VOICES.iter().chain(GEMINI_FEMALE_VOICES.iter()) {
            let (picked, _) = provider.pick_voice(Some(voice));
            assert_ne!(&picked, voice);
        }
    }
}
