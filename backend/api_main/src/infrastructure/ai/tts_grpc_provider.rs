#![allow(dead_code, unused_variables, unused_imports)]

use anyhow::{anyhow, Context, Result};
/// Proveedor Google TTS via gRPC binario.
///
/// El endpoint gRPC de Cloud TTS es texttospeech.googleapis.com:443.
/// Ventaja vs REST:
///   - Audio OGG llega como bytes directamente en el mensaje proto (sin base64)
///   - base64 REST añade ~33% overhead de payload y CPU para decode
///   - HTTP/2 con TLS session persistente entre síntesis consecutivas
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use std::time::Duration;
use tonic::transport::{Channel, ClientTlsConfig, Uri};
use tonic::Request;

use crate::config::Settings;
use crate::domain::repositories::audio::AudioGenerator;
use crate::infrastructure::ai::gemini_voices::normalize_gemini_voice;

/// Gemini-TTS on Cloud Text-to-Speech (not AI Studio).
pub const GEMINI_CLOUD_TTS_MODEL: &str = "gemini-2.5-flash-tts";
/// Latin American Spanish locale (Preview in Gemini-TTS docs).
pub const SPANISH_GEMINI_LOCALE: &str = "es-419";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos protobuf inline  (google.cloud.texttospeech.v1)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone, PartialEq, ::prost::Message)]
struct TtsSynthRequest {
    #[prost(message, optional, tag = "1")]
    input: Option<TtsSynthInput>,
    #[prost(message, optional, tag = "2")]
    voice: Option<TtsVoiceParams>,
    #[prost(message, optional, tag = "3")]
    audio_config: Option<TtsAudioConfig>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct TtsSynthInput {
    /// oneof input_source: text=1 | ssml=2
    #[prost(string, optional, tag = "1")]
    text: Option<String>,
    #[prost(string, optional, tag = "2")]
    ssml: Option<String>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct TtsVoiceParams {
    #[prost(string, tag = "1")]
    language_code: String,
    #[prost(string, tag = "2")]
    name: String,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct TtsAudioConfig {
    /// OGG_OPUS = 3
    #[prost(int32, tag = "1")]
    audio_encoding: i32,
    /// 0.25–4.0; ~0.92 sounds less robotic for short phrases
    #[prost(double, optional, tag = "2")]
    speaking_rate: Option<f64>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct TtsSynthResponse {
    /// Audio binario directo — sin base64, sin CPU de decode
    #[prost(bytes = "vec", tag = "1")]
    audio_content: Vec<u8>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

pub struct TtsGrpcProvider {
    channel: Channel,
    api_key: Option<String>,
    http: reqwest::Client,
}

#[derive(Deserialize)]
struct RestSynthResponse {
    #[serde(rename = "audioContent")]
    audio_content: Option<String>,
}

impl TtsGrpcProvider {
    pub async fn new(settings: &Settings) -> Result<Self> {
        let uri = Uri::from_static("https://texttospeech.googleapis.com");
        let tls = ClientTlsConfig::new().with_native_roots();

        let channel = Channel::builder(uri)
            .tls_config(tls)?
            .http2_keep_alive_interval(Duration::from_secs(30))
            .keep_alive_timeout(Duration::from_secs(10))
            .keep_alive_while_idle(true)
            .timeout(Duration::from_secs(45))
            .connect_lazy();

        // Preferir GCP_API_KEY (unrestricted) sobre GEMINI_API_KEY (restringida a AI Studio)
        let api_key = settings
            .gcp_api_key
            .clone()
            .or_else(|| settings.gemini_api_key.clone());

        Ok(Self {
            channel,
            api_key,
            http: reqwest::Client::new(),
        })
    }

    fn is_spanish(lang: Option<&str>) -> bool {
        lang.map(|l| l.eq_ignore_ascii_case("es") || l.starts_with("es-"))
            .unwrap_or(false)
    }

    /// Gemini-TTS via Cloud REST (`modelName` + `languageCode`). Requires OAuth.
    async fn synthesize_gemini_cloud_spanish(
        &self,
        text: &str,
        voice_name: &str,
    ) -> Result<Vec<u8>> {
        let token = self.get_oauth_token().await?.context(
            "Gemini-TTS Cloud (es-419) requiere GOOGLE_APPLICATION_CREDENTIALS o metadata GCP",
        )?;

        let gemini_voice = normalize_gemini_voice(voice_name);
        tracing::info!(
            "🇪🇸 Gemini-TTS Cloud: locale='{}', model='{}', voz='{}', texto='{}'",
            SPANISH_GEMINI_LOCALE,
            GEMINI_CLOUD_TTS_MODEL,
            gemini_voice,
            text
        );

        let body = serde_json::json!({
            "input": { "text": text },
            "voice": {
                "languageCode": SPANISH_GEMINI_LOCALE,
                "modelName": GEMINI_CLOUD_TTS_MODEL,
                "name": gemini_voice
            },
            "audioConfig": {
                "audioEncoding": "OGG_OPUS",
                "speakingRate": 0.92
            }
        });

        let resp = self
            .http
            .post("https://texttospeech.googleapis.com/v1/text:synthesize")
            .header("Authorization", format!("Bearer {}", token))
            .json(&body)
            .send()
            .await
            .context("Gemini-TTS Cloud request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Gemini-TTS Cloud error {}: {}", status, err_body));
        }

        let parsed: RestSynthResponse =
            resp.json().await.context("Gemini-TTS Cloud parse failed")?;
        let b64 = parsed
            .audio_content
            .ok_or_else(|| anyhow!("Gemini-TTS Cloud: sin audioContent"))?;
        let bytes = STANDARD
            .decode(b64)
            .context("Gemini-TTS Cloud base64 decode failed")?;
        if bytes.is_empty() {
            return Err(anyhow!("Gemini-TTS Cloud: audio vacío"));
        }
        Ok(bytes)
    }

    fn map_voice(voice_name: &str, lang: Option<&str>) -> (&'static str, &'static str) {
        if let Some(l) = lang {
            if l.starts_with("es") {
                // Chirp 3 HD: más natural que Neural2 (foros: Neural2 suena robótico)
                let _ = voice_name;
                return ("es-US", "es-US-Chirp3-HD-Kore");
            }
        }

        let voice = match voice_name {
            "Aoede" | "Callirrhoe" | "Gacrux" => "en-US-Standard-C",
            "Zephyr" | "Iapetus" | "Achernar" => "en-US-Standard-B",
            "Charon" => "en-US-Standard-D",
            _ => "en-US-Standard-A",
        };
        ("en-US", voice)
    }

    async fn synthesize_raw(
        &self,
        input: TtsSynthInput,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        use tonic::codec::ProstCodec;
        use tonic::Code;

        let (language_code, name) = Self::map_voice(voice_name, lang);
        let speaking_rate = if lang.map(|l| l.starts_with("es")).unwrap_or(false) {
            Some(0.92)
        } else {
            None
        };

        let proto_req = TtsSynthRequest {
            input: Some(input),
            voice: Some(TtsVoiceParams {
                language_code: language_code.into(),
                name: name.into(),
            }),
            audio_config: Some(TtsAudioConfig {
                audio_encoding: 3, // OGG_OPUS
                speaking_rate,
            }),
        };

        let path = http::uri::PathAndQuery::from_static(
            "/google.cloud.texttospeech.v1.TextToSpeech/SynthesizeSpeech",
        );

        // Intento 1: OAuth (si hay GOOGLE_APPLICATION_CREDENTIALS)
        let oauth_result = if let Ok(Some(token)) = self.get_oauth_token().await {
            let mut req = Request::new(proto_req.clone());
            if let Ok(meta) = format!("Bearer {}", token).parse() {
                req.metadata_mut().insert("authorization", meta);
                let mut grpc = tonic::client::Grpc::new(self.channel.clone());
                grpc.ready().await.ok();
                let r = grpc
                    .unary(
                        req,
                        path.clone(),
                        ProstCodec::<TtsSynthRequest, TtsSynthResponse>::default(),
                    )
                    .await;
                match r {
                    // Auth exitoso
                    Ok(resp) => Some(Ok(resp.into_inner().audio_content)),
                    // Error de permisos: la clave de deploy no tiene TTS habilitado → fallback
                    Err(ref s)
                        if matches!(s.code(), Code::Unauthenticated | Code::PermissionDenied) =>
                    {
                        tracing::warn!(
                            "⚠️ TTS OAuth sin permisos TTS ({}), usando API key como fallback",
                            s.code()
                        );
                        None
                    }
                    // Otro error real
                    Err(s) => Some(Err(anyhow!(
                        "TTS gRPC (OAuth) error {}: {}",
                        s.code(),
                        s.message()
                    ))),
                }
            } else {
                None
            }
        } else {
            None
        };

        // Si OAuth tuvo éxito o falló con error no-auth, retorna aquí
        if let Some(result) = oauth_result {
            let bytes = result?;
            if bytes.is_empty() {
                return Err(anyhow!("TTS: audio vacío (OAuth)"));
            }
            return Ok(bytes);
        }

        // Intento 2: API key
        let api_key = self
            .api_key
            .as_ref()
            .context("TTS: ni OAuth (con permisos) ni API key disponibles")?;

        let mut req = Request::new(proto_req);
        req.metadata_mut().insert(
            "x-goog-api-key",
            api_key.parse().context("API key TTS inválida")?,
        );

        let mut grpc = tonic::client::Grpc::new(self.channel.clone());
        grpc.ready()
            .await
            .map_err(|e| anyhow!("Canal TTS gRPC no listo: {}", e))?;

        let resp = grpc
            .unary(
                req,
                path,
                ProstCodec::<TtsSynthRequest, TtsSynthResponse>::default(),
            )
            .await
            .map_err(|s| anyhow!("TTS gRPC (API key) error {}: {}", s.code(), s.message()))?;

        let bytes = resp.into_inner().audio_content;
        if bytes.is_empty() {
            return Err(anyhow!("TTS: audio vacío (API key)"));
        }
        Ok(bytes)
    }

    async fn get_oauth_token(&self) -> Result<Option<String>> {
        // En Cloud Run, gcp_auth usa automáticamente el metadata server (no necesita archivo).
        // En local con GOOGLE_APPLICATION_CREDENTIALS, usa el service account key.
        // Si no hay ningún mecanismo disponible, retorna None para usar API key como fallback.
        match gcp_auth::provider().await {
            Ok(provider) => {
                match provider
                    .token(&["https://www.googleapis.com/auth/cloud-platform"])
                    .await
                {
                    Ok(token) => Ok(Some(token.as_str().to_string())),
                    Err(e) => {
                        tracing::debug!("TTS: no se pudo obtener token OAuth: {}", e);
                        Ok(None)
                    }
                }
            }
            Err(e) => {
                tracing::debug!("TTS: gcp_auth provider no disponible: {}", e);
                Ok(None)
            }
        }
    }
}

#[async_trait]
impl AudioGenerator for TtsGrpcProvider {
    async fn synthesize(
        &self,
        text: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        if Self::is_spanish(lang) {
            match self.synthesize_gemini_cloud_spanish(text, voice_name).await {
                Ok(bytes) => return Ok(bytes),
                Err(e) => {
                    tracing::warn!(
                        "⚠️ Gemini-TTS Cloud es-419 falló ({}), fallback Chirp3 es-US",
                        e
                    );
                }
            }
        }
        self.synthesize_raw(
            TtsSynthInput {
                text: Some(text.into()),
                ssml: None,
            },
            voice_name,
            lang,
        )
        .await
    }

    async fn synthesize_ssml(
        &self,
        ssml: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        if Self::is_spanish(lang) {
            let text = Self::strip_ssml(ssml);
            match self
                .synthesize_gemini_cloud_spanish(&text, voice_name)
                .await
            {
                Ok(bytes) => return Ok(bytes),
                Err(e) => {
                    tracing::warn!(
                        "⚠️ Gemini-TTS Cloud es-419 (SSML) falló ({}), fallback Chirp3 es-US",
                        e
                    );
                }
            }
        }
        self.synthesize_raw(
            TtsSynthInput {
                text: None,
                ssml: Some(ssml.into()),
            },
            voice_name,
            lang,
        )
        .await
    }
}

impl TtsGrpcProvider {
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
}
