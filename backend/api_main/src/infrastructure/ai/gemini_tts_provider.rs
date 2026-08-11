use anyhow::{anyhow, Context, Result};
/// Gemini TTS via REST generateContent (AI Studio).
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use tokio::time::{sleep, Duration};
use tracing::warn;

use crate::config::Settings;
use crate::domain::repositories::audio::AudioGenerator;
use crate::infrastructure::ai::gemini_voices::normalize_gemini_voice;
use crate::infrastructure::ai::pcm_ogg::pcm_s16le_mono_to_ogg;

/// Modelo canónico para hashes de caché de audio (no cambia aunque se use fallback).
#[allow(dead_code)]
pub const GEMINI_TTS_MODEL: &str = "gemini-2.5-flash-preview-tts";

/// Modelo activo para síntesis.
/// GEMINI_TTS_MODEL se mantiene para hashes de caché (nombres de archivo sin cambios).
pub const GEMINI_TTS_MODEL_CHAIN: &[&str] = &[
    "gemini-2.5-flash-preview-tts",
    // "gemini-2.5-pro-preview-tts",
];

const SAMPLE_RATE: u32 = 24000;

pub struct GeminiTtsProvider {
    client: reqwest::Client,
    api_keys: Vec<String>,
}

#[derive(Serialize)]
struct GenerateContentRequest {
    contents: Vec<Content>,
    #[serde(rename = "generationConfig")]
    generation_config: GenerationConfig,
}

#[derive(Serialize)]
struct Content {
    parts: Vec<Part>,
}

#[derive(Serialize)]
struct Part {
    text: String,
}

#[derive(Serialize)]
struct GenerationConfig {
    #[serde(rename = "responseModalities")]
    response_modalities: Vec<String>,
    #[serde(rename = "speechConfig")]
    speech_config: SpeechConfig,
}

#[derive(Serialize)]
struct SpeechConfig {
    #[serde(rename = "voiceConfig")]
    voice_config: VoiceConfig,
}

#[derive(Serialize)]
struct VoiceConfig {
    #[serde(rename = "prebuiltVoiceConfig")]
    prebuilt_voice_config: PrebuiltVoiceConfig,
}

#[derive(Serialize)]
struct PrebuiltVoiceConfig {
    #[serde(rename = "voiceName")]
    voice_name: String,
}

#[derive(Deserialize)]
struct GenerateContentResponse {
    candidates: Option<Vec<Candidate>>,
}

#[derive(Deserialize)]
struct Candidate {
    content: Option<ResponseContent>,
}

#[derive(Deserialize)]
struct ResponseContent {
    parts: Option<Vec<ResponsePart>>,
}

#[derive(Deserialize)]
struct ResponsePart {
    #[serde(rename = "inlineData")]
    inline_data: Option<InlineData>,
}

#[derive(Deserialize)]
struct InlineData {
    data: Option<String>,
}

impl GeminiTtsProvider {
    /// Producción y API HTTP — sin clave de respaldo.
    pub fn new(settings: &Settings) -> Result<Self> {
        Self::from_keys(collect_tts_api_keys(settings, TtsKeyProfile::Production))
    }

    /// Solo `--batch-gen-audio` local: respaldo primero, sin GCP_API_KEY (403 en TTS).
    pub fn new_for_batch(settings: &Settings) -> Result<Self> {
        Self::from_keys(collect_tts_api_keys(settings, TtsKeyProfile::BatchLocal))
    }

    fn from_keys(api_keys: Vec<String>) -> Result<Self> {
        if api_keys.is_empty() {
            anyhow::bail!("GEMINI_TTS_API_KEY o GEMINI_API_KEY requerida para Gemini TTS");
        }
        Ok(Self {
            client: reqwest::Client::new(),
            api_keys,
        })
    }

    fn strip_ssml(ssml: &str) -> String {
        let mut out = String::with_capacity(ssml.len());
        let mut in_tag = false;
        for ch in ssml.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => out.push(ch),
                _ => {}
            }
        }
        out.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn should_retry(status: StatusCode) -> bool {
        matches!(
            status,
            StatusCode::UNAUTHORIZED
                | StatusCode::FORBIDDEN
                | StatusCode::TOO_MANY_REQUESTS
                | StatusCode::INTERNAL_SERVER_ERROR
                | StatusCode::BAD_GATEWAY
                | StatusCode::SERVICE_UNAVAILABLE
                | StatusCode::GATEWAY_TIMEOUT
        )
    }

    async fn synthesize_internal(
        &self,
        text: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        let voice = normalize_gemini_voice(voice_name);

        let final_text = match lang.map(|l| l.to_lowercase()).as_deref() {
            Some("de") | Some("de-de") => format!(
                "Audio Profile: Native German speaker with standard High German (Hochdeutsch) accent.\n\nText: {}",
                text
            ),
            Some("es") | Some("es-419") | Some("es-es") | Some("es-mx") => format!(
                "Audio Profile: Native Latin American Spanish speaker with clear standard accent.\n\nText: {}",
                text
            ),
            Some("en") | Some("en-us") | Some("en-gb") => format!(
                "Audio Profile: Native English speaker with clear standard accent.\n\nText: {}",
                text
            ),
            _ => text.to_string(),
        };

        let body = GenerateContentRequest {
            contents: vec![Content {
                parts: vec![Part { text: final_text }],
            }],
            generation_config: GenerationConfig {
                response_modalities: vec!["AUDIO".into()],
                speech_config: SpeechConfig {
                    voice_config: VoiceConfig {
                        prebuilt_voice_config: PrebuiltVoiceConfig {
                            voice_name: voice.into(),
                        },
                    },
                },
            },
        };

        let mut last_err: Option<anyhow::Error> = None;

        for (model_idx, model) in GEMINI_TTS_MODEL_CHAIN.iter().enumerate() {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
                model
            );
            let mut model_exhausted = false;

            for (key_idx, api_key) in self.api_keys.iter().enumerate() {
                let resp = match self
                    .client
                    .post(&url)
                    .header("x-goog-api-key", api_key)
                    .json(&body)
                    .send()
                    .await
                {
                    Ok(r) => r,
                    Err(e) => {
                        last_err = Some(e.into());
                        if key_idx + 1 < self.api_keys.len() {
                            warn!(
                                "Gemini TTS [{model}]: clave {} falló (red), probando otra clave…",
                                key_idx + 1
                            );
                            continue;
                        }
                        model_exhausted = true;
                        break;
                    }
                };

                if !resp.status().is_success() {
                    let status = resp.status();
                    let body_text = resp.text().await.unwrap_or_default();
                    last_err = Some(anyhow!(
                        "Gemini TTS [{model}] error {}: {}",
                        status,
                        body_text
                    ));

                    let has_next_key = key_idx + 1 < self.api_keys.len();
                    if Self::should_retry(status) && has_next_key {
                        if status == StatusCode::TOO_MANY_REQUESTS {
                            warn!(
                                "Gemini TTS [{model}]: clave {} → 429, esperando 5s…",
                                key_idx + 1
                            );
                            sleep(Duration::from_secs(5)).await;
                        }
                        warn!(
                            "Gemini TTS [{model}]: clave {} → {}, probando otra clave…",
                            key_idx + 1,
                            status
                        );
                        continue;
                    }

                    if Self::should_retry(status) && model_idx + 1 < GEMINI_TTS_MODEL_CHAIN.len() {
                        warn!(
                            "Gemini TTS [{model}]: cuota/agotada ({status}), cambiando a {}…",
                            GEMINI_TTS_MODEL_CHAIN[model_idx + 1]
                        );
                        if status == StatusCode::TOO_MANY_REQUESTS {
                            sleep(Duration::from_secs(2)).await;
                        }
                        model_exhausted = true;
                        break;
                    }

                    return Err(last_err.unwrap());
                }

                let parsed: GenerateContentResponse =
                    resp.json().await.context("Gemini TTS parse failed")?;
                let b64 = parsed
                    .candidates
                    .and_then(|c| c.into_iter().next())
                    .and_then(|c| c.content)
                    .and_then(|c| c.parts)
                    .and_then(|p| p.into_iter().next())
                    .and_then(|p| p.inline_data)
                    .and_then(|d| d.data);

                let Some(b64) = b64 else {
                    last_err = Some(anyhow!("Gemini TTS [{model}]: no audio in response"));
                    if model_idx + 1 < GEMINI_TTS_MODEL_CHAIN.len() {
                        warn!(
                            "Gemini TTS [{model}]: respuesta sin audio, probando {}…",
                            GEMINI_TTS_MODEL_CHAIN[model_idx + 1]
                        );
                        model_exhausted = true;
                        break;
                    }
                    return Err(last_err.unwrap());
                };

                let pcm = STANDARD
                    .decode(b64)
                    .context("Gemini TTS base64 decode failed")?;
                if pcm.is_empty() {
                    last_err = Some(anyhow!("Gemini TTS [{model}]: audio vacío"));
                    if model_idx + 1 < GEMINI_TTS_MODEL_CHAIN.len() {
                        warn!(
                            "Gemini TTS [{model}]: audio vacío, probando {}…",
                            GEMINI_TTS_MODEL_CHAIN[model_idx + 1]
                        );
                        model_exhausted = true;
                        break;
                    }
                    return Err(last_err.unwrap());
                }

                if model_idx > 0 {
                    warn!("Gemini TTS: audio generado con modelo fallback [{model}]");
                }

                return pcm_s16le_mono_to_ogg(&pcm, SAMPLE_RATE)
                    .context("Gemini TTS OGG encode failed");
            }

            if model_exhausted && model_idx + 1 < GEMINI_TTS_MODEL_CHAIN.len() {
                continue;
            }
        }

        Err(last_err.unwrap_or_else(|| anyhow!("Gemini TTS: todos los modelos y claves agotados")))
    }
}

enum TtsKeyProfile {
    Production,
    BatchLocal,
}

fn collect_tts_api_keys(settings: &Settings, profile: TtsKeyProfile) -> Vec<String> {
    let mut keys = Vec::new();
    let mut push = |value: Option<String>| {
        if let Some(key) = value {
            if key != "DISABLED" && !keys.iter().any(|existing| existing == &key) {
                keys.push(key);
            }
        }
    };

    match profile {
        TtsKeyProfile::Production => {
            push(settings.gemini_tts_api_key.clone());
            push(settings.gemini_api_key.clone());
        }
        TtsKeyProfile::BatchLocal => {
            // push(settings.gemini_tts_api_key_backup.clone()); // launch: prepago agotado
            push(settings.gemini_tts_api_key.clone()); // TESTAI — única con cuota activa
                                                       // push(settings.gemini_api_key.clone());
        }
    }
    keys
}

#[async_trait]
impl AudioGenerator for GeminiTtsProvider {
    async fn synthesize(
        &self,
        text: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        self.synthesize_internal(text, voice_name, lang).await
    }

    async fn synthesize_ssml(
        &self,
        ssml: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        let text = Self::strip_ssml(ssml);
        self.synthesize(&text, voice_name, lang).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_chain_uses_2_5_flash_preview_tts_only() {
        assert_eq!(GEMINI_TTS_MODEL_CHAIN, &["gemini-2.5-flash-preview-tts"]);
    }

    #[test]
    fn collect_tts_api_keys_batch_uses_primary_only() {
        let settings = sample_settings();
        let keys = collect_tts_api_keys(&settings, TtsKeyProfile::BatchLocal);
        assert_eq!(keys, vec!["primary-tts".to_string()]);
    }

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
            gemini_tts_api_key_backup: Some("backup-tts".into()),
            gcp_api_key: Some("gcp-key".into()),
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
}
