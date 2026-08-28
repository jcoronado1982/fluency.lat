use anyhow::{anyhow, Context, Result};
/// Proveedor Gemini via gRPC binario (protobuf) en vez de REST/JSON.
///
/// Ventajas vs REST:
///   - Payload ~40 % menor (binario vs texto JSON)
///   - HTTP/2 multiplexado: múltiples llamadas comparten un TLS session
///   - Sin overhead de parse/serialización JSON en CPU
///   - Un único `Channel` reutilizado en toda la vida del proceso
///
/// Los tipos proto se definen con `prost::Message` inline — sin protoc ni build.rs.
use async_trait::async_trait;
use serde::Deserialize;
use std::time::Duration;
use tonic::transport::{Channel, ClientTlsConfig, Uri};
use tonic::Request;
use tracing::{debug, warn};

use crate::config::Settings;
use crate::domain::repositories::tutor::AITutor;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos protobuf inline (equivalentes al .proto de la API v1beta de Gemini)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiRequest {
    /// "models/gemini-3.1-flash-lite"
    #[prost(string, tag = "1")]
    model: String,
    #[prost(message, optional, tag = "8")]
    system_instruction: Option<GeminiContent>,
    #[prost(message, repeated, tag = "2")]
    contents: Vec<GeminiContent>,
    #[prost(message, optional, tag = "4")]
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiContent {
    #[prost(message, repeated, tag = "1")]
    parts: Vec<GeminiPart>,
    #[prost(string, tag = "2")]
    role: String,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiPart {
    #[prost(string, optional, tag = "2")]
    text: Option<String>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiGenerationConfig {
    // Tags verificados contra el .proto oficial (`google/ai/generativelanguage/v1beta/generative_service.proto`,
    // mensaje `GenerationConfig`): `max_output_tokens` = 4, `temperature` = 5. Estaban
    // intercambiados acá — bug real: el servidor descarta un campo cuyo wire type no coincide con
    // el declarado para ese número (float vs varint), así que NINGUNA llamada por este helper
    // aplicaba de verdad la temperatura ni el tope de tokens pedidos; Gemini corría con sus
    // defaults del modelo en ambos. Afecta a TODAS las llamadas vía `call()` (word-card-draft,
    // guía de onboarding, etc.), no solo una.
    #[prost(int32, optional, tag = "4")]
    max_output_tokens: Option<i32>,
    #[prost(float, optional, tag = "5")]
    temperature: Option<f32>,
    #[prost(string, optional, tag = "13")]
    response_mime_type: Option<String>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiResponse {
    #[prost(message, repeated, tag = "1")]
    candidates: Vec<GeminiCandidate>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiCandidate {
    #[prost(message, optional, tag = "1")]
    content: Option<GeminiContent>,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: OllamaMessage,
}

#[derive(Deserialize)]
struct OllamaMessage {
    #[serde(default)]
    content: String,
    #[serde(default)]
    thinking: String,
}

fn clean_ollama_prompt_output(text: &str) -> String {
    let mut cleaned = text.trim();
    if let Some((_, after_thinking)) = cleaned.rsplit_once("</think>") {
        cleaned = after_thinking.trim();
    }

    let lowered = cleaned.to_ascii_lowercase();
    if lowered.ends_with(" words)") {
        if let Some(start) = cleaned.rfind('(') {
            let suffix = &lowered[start..];
            let count = suffix
                .trim_start_matches('(')
                .trim_end_matches(" words)")
                .trim();
            if !count.is_empty() && count.chars().all(|c| c.is_ascii_digit()) {
                cleaned = cleaned[..start].trim_end();
            }
        }
    }

    cleaned.to_string()
}

fn preview_for_log(text: &str, max_chars: usize) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = String::new();
    for ch in compact.chars().take(max_chars) {
        preview.push(ch);
    }
    if compact.chars().count() > max_chars {
        preview.push_str("...");
    }
    preview
}

const FLASHCARD_TARGET_WIDTH: u32 = 768;
const FLASHCARD_TARGET_HEIGHT: u32 = 512;

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

pub struct GeminiGrpcProvider {
    /// Channel reutilizado: HTTP/2 multiplexado, TLS session persistente.
    channel: Channel,
    api_key: String,
}

impl GeminiGrpcProvider {
    pub fn new(settings: &Settings) -> Result<Self> {
        let api_key = settings
            .gemini_api_key
            .clone()
            .unwrap_or_else(|| "DISABLED".to_string());

        let uri = Uri::from_static("https://generativelanguage.googleapis.com");
        let tls = ClientTlsConfig::new().with_native_roots();

        let channel = Channel::builder(uri)
            .tls_config(tls)?
            // Keep-alive para mantener el TLS session caliente entre peticiones
            .http2_keep_alive_interval(Duration::from_secs(30))
            .keep_alive_timeout(Duration::from_secs(10))
            .keep_alive_while_idle(true)
            // Timeout por RPC individual.
            // Mantenerlo por encima del timeout global del backend.
            .timeout(Duration::from_secs(180))
            .connect_lazy(); // no conecta hasta la primera llamada → 0 RAM en startup

        Ok(Self { channel, api_key })
    }

    async fn call(
        &self,
        system: &str,
        user: &str,
        temperature: f32,
        model: &str,
        mime: Option<&str>,
    ) -> Result<String> {
        use tonic::codec::ProstCodec;

        let request = GeminiRequest {
            model: format!("models/{}", model),
            system_instruction: Some(GeminiContent {
                role: "".into(),
                parts: vec![GeminiPart {
                    text: Some(system.into()),
                }],
            }),
            contents: vec![GeminiContent {
                role: "user".into(),
                parts: vec![GeminiPart {
                    text: Some(user.into()),
                }],
            }],
            generation_config: Some(GeminiGenerationConfig {
                temperature: Some(temperature),
                max_output_tokens: Some(1024),
                response_mime_type: mime.map(Into::into),
            }),
        };

        // Gemini solo acepta API key (no OAuth de service account de deploy).
        // Siempre usamos x-goog-api-key para evitar fallos de permisos en prod.
        let mut tonic_req = Request::new(request);
        tonic_req.metadata_mut().insert(
            "x-goog-api-key",
            self.api_key.parse().context("API key Gemini inválida")?,
        );

        let path = http::uri::PathAndQuery::from_static(
            "/google.ai.generativelanguage.v1beta.GenerativeService/GenerateContent",
        );
        let codec = ProstCodec::<GeminiRequest, GeminiResponse>::default();

        let mut grpc = tonic::client::Grpc::new(self.channel.clone());
        grpc.ready()
            .await
            .map_err(|e| anyhow!("Canal Gemini gRPC no listo: {}", e))?;

        let resp = grpc
            .unary(tonic_req, path, codec)
            .await
            .map_err(|s| anyhow!("Gemini gRPC error {}: {}", s.code(), s.message()))?;

        let candidate = resp
            .into_inner()
            .candidates
            .into_iter()
            .next()
            .context("Gemini: sin candidatos en respuesta")?;

        let text = candidate
            .content
            .and_then(|c| c.parts.into_iter().next())
            .and_then(|p| p.text)
            .context("Gemini: texto vacío en respuesta")?;

        Ok(text)
    }

    async fn query_ollama(&self, system: &str, user: &str, temperature: f32) -> Result<String> {
        let request_started_at = std::time::Instant::now();
        let url = std::env::var("LLAMA_URL")
            .or_else(|_| std::env::var("OLLAMA_URL"))
            .unwrap_or_else(|_| "http://127.0.0.1:8082".into());
        let clean_url = url.trim_end_matches('/');
        let client = reqwest::Client::new();

        // 1. Try OpenAI-compatible endpoint (llama-server default on port 8082)
        let openai_endpoint = format!("{}/v1/chat/completions", clean_url);
        let openai_body = serde_json::json!({
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ],
            "temperature": temperature,
            "max_tokens": 1024
        });

        if let Ok(response) = client
            .post(&openai_endpoint)
            .timeout(Duration::from_secs(180))
            .json(&openai_body)
            .send()
            .await
        {
            if response.status().is_success() {
                if let Ok(parsed) = response.json::<serde_json::Value>().await {
                    let mut text = parsed["choices"][0]["message"]["content"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    if text.is_empty() {
                        if let Some(reasoning) =
                            parsed["choices"][0]["message"]["reasoning_content"].as_str()
                        {
                            text = reasoning.to_string();
                        }
                    }
                    let cleaned = clean_ollama_prompt_output(&text);
                    if !cleaned.is_empty() {
                        return Ok(cleaned);
                    }
                }
            }
        }

        // 2. Fallback to Ollama /api/chat endpoint
        let model = std::env::var("OLLAMA_PROMPT_MODEL").unwrap_or_else(|_| "qwen3.5:9b".into());
        let endpoint = format!("{}/api/chat", clean_url);
        let response = client
            .post(endpoint)
            .timeout(Duration::from_secs(180))
            .json(&serde_json::json!({
                "model": model,
                "stream": false,
                "think": false,
                "keep_alive": "10s",
                "options": {
                    "temperature": temperature,
                    "num_ctx": 4096,
                    "num_predict": 720,
                    "repeat_penalty": 1.2
                },
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": user }
                ]
            }))
            .send()
            .await
            .context("Local prompt LLM request failed")?;

        /*
        info!(
            model = %model,
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "prompt-llm:ollama-http-ok"
        );
        */

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            warn!(
                model = %model,
                status = %status,
                response_preview = %preview_for_log(&body, 240),
                elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                "prompt-llm:ollama-http-error"
            );
            return Err(anyhow!("Ollama prompt LLM error {status}: {body}"));
        }

        let parsed: OllamaChatResponse = response
            .json()
            .await
            .context("Ollama prompt LLM returned invalid JSON")?;
        let mut text = clean_ollama_prompt_output(&parsed.message.content);
        if text.is_empty() && !parsed.message.thinking.trim().is_empty() {
            debug!("prompt-llm:ollama-fallback-thinking");
            text = clean_ollama_prompt_output(&parsed.message.thinking);
        }
        if text.is_empty() {
            warn!(
                model = %model,
                content_len = parsed.message.content.len(),
                thinking_len = parsed.message.thinking.len(),
                elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                "prompt-llm:ollama-empty"
            );
            return Err(anyhow!("Ollama prompt LLM returned empty content"));
        }
        /*
        info!(
            model = %model,
            output_len = text.len(),
            output_preview = %preview_for_log(&text, 220),
            total_elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "prompt-llm:ollama-ok"
        );
        */
        Ok(text)
    }

    async fn call_ollama_prompt_llm(
        &self,
        system: &str,
        user: &str,
        temperature: f32,
    ) -> Result<String> {
        // Single high-quality pass on Qwen-8B (GTX 1660) to keep prompt refinement under 70-90s
        // and allow end-to-end generation (Qwen + Flux 2) to complete well within the 180s HTTP timeout.
        let prompt = self.query_ollama(system, user, temperature).await?;
        let cleaned = prompt.trim();
        if cleaned.is_empty() {
            Ok(prompt)
        } else {
            Ok(cleaned.to_string())
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait impl (idéntico al gemini_provider.rs anterior)
// ─────────────────────────────────────────────────────────────────────────────

#[async_trait]
impl AITutor for GeminiGrpcProvider {
    async fn analyze_error(
        &self,
        user_input: &str,
        correct_answer: &str,
        context_spanish: &str,
    ) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok(r#"{"is_correct":false,"explanation":"La IA del sistema está desactivada.","error_code":"ai_disabled"}"#.to_string());
        }
        let system = r#"Eres un TUTOR DE INGLÉS experto. Valida si la frase del alumno es GRAMATICALMENTE CORRECTA.
RESPONDE EXCLUSIVAMENTE EN ESTE FORMATO JSON:
{"is_correct":true/false,"explanation":"máx 25 palabras en español","error_code":"slug_en_ingles"}"#;

        let user = format!(
            "Frase en Español: \"{}\"\nIntento: \"{}\"\nModelo: \"{}\"",
            context_spanish, user_input, correct_answer
        );
        self.call(
            system,
            &user,
            0.1,
            "gemini-3.1-flash-lite",
            Some("application/json"),
        )
        .await
    }

    async fn explain_like_child(
        &self,
        user_input: &str,
        correct_answer: &str,
        context_spanish: &str,
        original_explanation: Option<&str>,
    ) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok("La IA está desactivada.".to_string());
        }
        let system = r#"Eres un TUTOR DE INGLÉS EMPÁTICO. Usa ELI5 sin términos técnicos, máx 70 palabras, texto plano."#;
        let mut user = format!(
            "Situación: '{}'\nEscribió: '{}'\nCorrecto: '{}'",
            context_spanish, user_input, correct_answer
        );
        if let Some(exp) = original_explanation {
            user.push_str(&format!("\nExplicación previa: '{}'", exp));
        }
        self.call(system, &user, 0.7, "gemini-3.1-flash-lite", None)
            .await
    }

    async fn improve_visual_prompts_batch(
        &self,
        story_data: &serde_json::Value,
        context: &str,
    ) -> Result<Vec<String>> {
        if self.api_key == "DISABLED" {
            return Ok(vec![]);
        }
        let system =
            r#"Eres un PROMPT ENGINEER para FLUX 2. Sin texto en imágenes. JSON array de strings."#;
        let user = format!("Contexto: {}\nPasos:\n{}", context, story_data);
        let raw = self
            .call(
                system,
                &user,
                0.2,
                "gemini-flash-lite-latest",
                Some("application/json"),
            )
            .await?;
        serde_json::from_str(&raw).context("Error parseando JSON de prompts visuales")
    }

    async fn improve_prompt_for_image(
        &self,
        phrase: &str,
        pos_category: &str,
        meaning: Option<&str>,
        usage_example: Option<&str>,
    ) -> Result<String> {
        let (pos_category, engine_override) = if let Some(idx) = pos_category.find("|ENGINE=") {
            (&pos_category[..idx], Some(&pos_category[idx + 8..]))
        } else {
            (pos_category, None)
        };

        // El system prompt se especializa por categoría: una card de sustantivo no debe leer las
        // reglas de fases verbales, ni una de verbo las de días de la semana. Ver
        // `gemini_image_prompt.rs` y `docs/prompt-temporal-precision.md`.
        let system = super::gemini_image_prompt::build_system_prompt(pos_category);
        let system = system.as_str();


        let mut user = format!(
            "WORD/PHRASE: \"{}\"\nPOS/CATEGORY: \"{}\"\nOUTPUT MEDIUM: flashcard\nFINAL RESOLUTION: {}x{}\nFRAME: wide horizontal landscape\nREADABILITY: must remain clear at small card size\nTEACHING REQUIREMENT: image must communicate the target meaning without captions",
            phrase,
            pos_category,
            FLASHCARD_TARGET_WIDTH,
            FLASHCARD_TARGET_HEIGHT
        );
        if let Some(m) = meaning {
            if m.trim_start().starts_with("MEANING:") {
                user.push('\n');
                user.push_str(m);
            } else {
                user.push_str(&format!("\nMEANING: \"{}\"", m));
            }
        }
        if let Some(u) = usage_example {
            user.push_str(&format!("\nEXAMPLE: \"{}\"", u));
        }
        // Antes este bloque repetía "full bodies when people are visible; no cropped humans",
        // contradiciendo EVIDENCE-FIRST FRAMING del system prompt (que exige acercar la cámara
        // cuando el significado vive en la cara o las manos). Al ir en el mensaje de usuario pesaba
        // más que el system y bloqueaba el primer plano. Las reglas de composición viven ahora solo
        // en el system prompt; aquí queda el recordatorio de escena, sin duplicar encuadre.
        user.push_str(
            "\nSCENE RULES: choose a normal daily-life situation where someone would naturally SAY this sentence; make the target meaning visible, not just implied by people talking. Follow the composition and framing rules of the system prompt exactly, including EVIDENCE-FIRST FRAMING.",
        );

        let database_url = std::env::var("DATABASE_URL").unwrap_or_default();
        let is_production = !database_url.is_empty()
            && !database_url.contains("localhost")
            && !database_url.contains("127.0.0.1")
            && !database_url.contains("db");

        let prompt_engine = engine_override.map(|s| s.to_string()).unwrap_or_else(|| {
            if is_production {
                "gemini".to_string()
            } else {
                std::env::var("FLASHCARD_PROMPT_ENGINE")
                    .unwrap_or_else(|_| "gemini".to_string())
                    .to_ascii_lowercase()
            }
        });

        if matches!(
            prompt_engine.as_str(),
            "local" | "llama" | "qwen" | "qwen3" | "ollama"
        ) {
            return self.call_ollama_prompt_llm(system, &user, 0.7).await;
        }

        if self.api_key != "DISABLED" {
            match self
                .call(system, &user, 0.5, "gemini-flash-lite-latest", None)
                .await
            {
                Ok(res) => return Ok(res),
                Err(e) => {
                    warn!("Gemini prompt generation failed, falling back to Ollama local: {e}");
                }
            }
        }

        // Fallback to local Ollama if Gemini is disabled or fails
        self.call_ollama_prompt_llm(system, &user, 0.7).await
    }

    async fn improve_prompt_for_landing_demo_image(
        &self,
        phrase: &str,
        pos_category: &str,
        meaning: Option<&str>,
        usage_example: Option<&str>,
        _scene_complement: Option<&str>,
    ) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok(phrase.to_string());
        }

        use crate::infrastructure::ai::gemini_landing_demo_prompts::{
            build_complement_mode_user_message, build_gemini_user_message_with_complement,
            gemini_system_for_landing, GEMINI_SYSTEM_COMPLEMENT_MODE,
        };

        if let Some(comp) = _scene_complement.map(str::trim).filter(|s| !s.is_empty()) {
            let example = usage_example.filter(|s| !s.is_empty()).unwrap_or(phrase);
            let user = build_complement_mode_user_message(example, meaning, comp);
            return self
                .call(
                    GEMINI_SYSTEM_COMPLEMENT_MODE,
                    &user,
                    0.35,
                    "gemini-3.1-flash-lite",
                    None,
                )
                .await;
        }

        let user = build_gemini_user_message_with_complement(
            phrase,
            pos_category,
            meaning,
            usage_example,
            _scene_complement,
        );
        let system = gemini_system_for_landing(_scene_complement);
        self.call(&system, &user, 0.5, "gemini-3.1-flash-lite", None)
            .await
    }

    async fn refine_audio_ssml(&self, text: &str, tone: &str) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok(format!("<speak>{}</speak>", text));
        }
        let system = r#"Speech Synthesis Engineer. Solo responde con SSML <speak>...</speak>. Usa el texto EXACTO, sin añadir palabras."#;
        let user = format!("Text: \"{}\"\nTone: \"{}\"", text, tone);
        self.call(system, &user, 0.5, "gemini-3.1-flash-lite", None)
            .await
    }

    async fn generate_word_card_draft(
        &self,
        word: &str,
        course_direction: &str,
        category_override: Option<&str>,
        level_override: Option<&str>,
        existing_topics: &[crate::domain::repositories::tutor::ExistingPersonalTopic],
    ) -> Result<Vec<serde_json::Value>> {
        #[cfg(feature = "flashcards")]
        {
            use crate::infrastructure::ai::gemini_word_card_prompt::{
                build_word_card_user_message, WORD_CARD_CATEGORIES, WORD_CARD_LEVELS,
                WORD_CARD_SYSTEM_PROMPT,
            };

            if self.api_key == "DISABLED" {
                anyhow::bail!("Gemini está deshabilitado: no se puede crear una palabra nueva");
            }

            let user = build_word_card_user_message(
                word,
                course_direction,
                category_override,
                level_override,
                existing_topics,
            );
            let validate = |raw: &str| -> Result<Vec<serde_json::Value>> {
                let value: serde_json::Value =
                    serde_json::from_str(raw).context("Gemini: respuesta no es JSON válido")?;
                let classifications = value
                    .get("classifications")
                    .and_then(|v| v.as_array())
                    .context("Gemini: falta 'classifications' en el borrador")?;
                anyhow::ensure!(
                    !classifications.is_empty() && classifications.len() <= 2,
                    "Gemini: 'classifications' debe tener 1 o 2 elementos (llegaron {})",
                    classifications.len()
                );
                let mut result = Vec::with_capacity(classifications.len());
                for item in classifications {
                    let category = item
                        .get("category")
                        .and_then(|v| v.as_str())
                        .context("Gemini: falta 'category' en una clasificación")?;
                    anyhow::ensure!(
                        WORD_CARD_CATEGORIES.contains(&category),
                        "Gemini: categoría inválida '{category}'"
                    );
                    let level = item
                        .get("level")
                        .and_then(|v| v.as_str())
                        .context("Gemini: falta 'level' en una clasificación")?;
                    anyhow::ensure!(
                        WORD_CARD_LEVELS.contains(&level),
                        "Gemini: nivel inválido '{level}'"
                    );
                    anyhow::ensure!(
                        item.get("name").and_then(|v| v.as_str()).is_some_and(|s| !s.trim().is_empty()),
                        "Gemini: falta 'name' en una clasificación"
                    );
                    let definitions = item
                        .get("definitions")
                        .and_then(|v| v.as_array())
                        .context("Gemini: falta 'definitions' en una clasificación")?;
                    anyhow::ensure!(
                        !definitions.is_empty(),
                        "Gemini: 'definitions' vacío en una clasificación"
                    );
                    let first = &definitions[0];
                    for key in [
                        "meaning",
                        "usage_example",
                        "usage_example_es",
                        "pronunciation_guide_es",
                        "usage_context_en",
                        "usage_context_es",
                    ] {
                        anyhow::ensure!(
                            first.get(key).and_then(|v| v.as_str()).is_some_and(|s| !s.trim().is_empty()),
                            "Gemini: falta '{key}' en definitions[0] de una clasificación"
                        );
                    }
                    result.push(item.clone());
                }

                if let (Some(category), Some(level)) = (category_override, level_override) {
                    // El usuario ya eligió — nunca dejamos que Gemini reinterprete la categoría/nivel:
                    // clampamos el primer (y único que nos importa) elemento a lo pedido.
                    let mut first = result
                        .into_iter()
                        .next()
                        .context("Gemini: 'classifications' vacío")?;
                    if let Some(obj) = first.as_object_mut() {
                        obj.insert(
                            "category".to_string(),
                            serde_json::Value::String(category.to_string()),
                        );
                        obj.insert(
                            "level".to_string(),
                            serde_json::Value::String(level.to_string()),
                        );
                    }
                    result = vec![first];
                }

                Ok(result)
            };

            let raw = self
                .call(
                    WORD_CARD_SYSTEM_PROMPT,
                    &user,
                    0.4,
                    "gemini-3.1-flash-lite",
                    Some("application/json"),
                )
                .await
                .context("Gemini: fallo generando el borrador de la palabra")?;

            match validate(&raw) {
                Ok(value) => Ok(value),
                Err(first_err) => {
                    warn!("word-card-draft: primer intento inválido ({first_err}), reintentando");
                    let retry = self
                        .call(
                            WORD_CARD_SYSTEM_PROMPT,
                            &user,
                            0.4,
                            "gemini-3.1-flash-lite",
                            Some("application/json"),
                        )
                        .await
                        .context("Gemini: fallo en el reintento del borrador de la palabra")?;
                    validate(&retry).context("Gemini: el reintento también devolvió un borrador inválido")
                }
            }
        }
        #[cfg(not(feature = "flashcards"))]
        {
            let _ = (
                word,
                course_direction,
                category_override,
                level_override,
                existing_topics,
            );
            anyhow::bail!("generate_word_card_draft requiere la feature 'flashcards'")
        }
    }

    async fn guide_onboarding_step(
        &self,
        locale: &str,
        step_id: &str,
        step_index: u32,
        step_total: u32,
        event: &str,
        target_label: &str,
        target_hint: &str,
        wrong_target_label: Option<&str>,
        user_name: Option<&str>,
        ui_state: Option<&str>,
    ) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok(format!(
                r#"{{"message":"{}"}}"#,
                target_hint.replace('"', "\\\"")
            ));
        }

        let language_rule = if locale == "es" {
            "Responde SIEMPRE en español claro, motivador y conciso."
        } else {
            "Always respond in clear, motivating, concise English."
        };

        let greeting = user_name
            .map(|name| {
                format!("Saluda al usuario por su nombre ({name}) solo en event=enter y paso 1.")
            })
            .unwrap_or_default();

        let system = format!(
            r#"Eres Gemini actuando como agente de navegación inteligente dentro de Fluency, módulo Flashcards.

IDENTIFICACIÓN HTML (ignora clases CSS decorativas):
- data-tour: nombre del componente en el mapa (menu-hamburguesa, categoria-item, boton-voltear-tarjeta…)
- data-categoria: categoría gramatical (pronombres, verbos…)
- aria-expanded / aria-current: estado de menús y selección
- ui_state.visible_targets: elementos visibles que el usuario puede tocar ahora

REGLAS:
1. Usa ui_state y visible_targets para explicar la acción correcta como si estuvieras mirando la pantalla.
2. El frontend ya marca el target correcto; tú solo dices qué hacer y por qué, sin repetir textos técnicos.
3. Si el paso abre navegación, explica cuál opción debe marcar/cargar y cómo reconocerla.
4. Solo sugiere acciones sobre el target_hint actual; no saltes pasos.
5. No copies literalmente target_label ni target_hint; son contexto para entender la navegación.
6. Si event=element_missing, advierte que el elemento aún no está en pantalla.
7. Si event=state_timeout, indica que la vista no cambió y repite la acción esperada.
8. Si event=wrong_tap, corrige señalando el elemento correcto en lenguaje natural.
9. Máximo 55 palabras en "message". Tono claro, práctico y natural.
{language_rule}
{greeting}
RESPONDE SOLO JSON: {{"message":"..."}}"#,
        );

        let mut user = format!(
            "step_id={}\nstep={}/{}\nevent={}\ntarget_label={}\ntarget_hint={}",
            step_id, step_index, step_total, event, target_label, target_hint
        );
        if let Some(wrong) = wrong_target_label {
            user.push_str(&format!("\nwrong_target_label={}", wrong));
        }
        if let Some(state) = ui_state {
            user.push_str(&format!("\nui_state={}", state));
        }

        self.call(
            &system,
            &user,
            if event == "wrong_tap" || event == "state_timeout" {
                0.35
            } else {
                0.5
            },
            "gemini-3.1-flash-lite",
            Some("application/json"),
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Los tests binarios no pasan por `main()` (donde se instala el
    // CryptoProvider de rustls tras el upgrade a SurrealDB 3.2.3 / aws-lc-rs),
    // así que el canal TLS de tonic hacia Gemini panickea igual que el
    // binario real si nadie lo instala antes. Idempotente vía `.ok()`: bajo
    // `cargo test` varios tests comparten proceso y solo el primero logra
    // instalarlo; bajo nextest cada test tiene su propio proceso.
    fn ensure_crypto_provider() {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    }

    // Regresión (bug real): `max_output_tokens`/`temperature` tenían los tags de protobuf
    // intercambiados respecto al .proto oficial de Gemini v1beta, así que el servidor descartaba
    // ambos por wire-type mismatch (float vs varint) y CADA llamada por `call()` corría con los
    // defaults del modelo en vez de los valores pedidos — sin red, sin API key, verifica los
    // bytes crudos directamente contra los números de campo del proto real.
    #[test]
    fn generation_config_field_tags_match_the_official_v1beta_proto() {
        let config = GeminiGenerationConfig {
            max_output_tokens: Some(1024),
            temperature: Some(0.4),
            response_mime_type: None,
        };
        let bytes = <GeminiGenerationConfig as prost::Message>::encode_to_vec(&config);

        // `max_output_tokens` = field 4, varint (int32) → tag byte = (4 << 3) | 0 = 0x20.
        assert_eq!(bytes[0], 0x20, "max_output_tokens debe ir en field number 4 (varint)");
        assert_eq!(&bytes[1..3], &[0x80, 0x08], "varint(1024) mal codificado");

        // `temperature` = field 5, fixed32 (float) → tag byte = (5 << 3) | 5 = 0x2D.
        assert_eq!(bytes[3], 0x2D, "temperature debe ir en field number 5 (fixed32)");
        let temp_bytes: [u8; 4] = bytes[4..8].try_into().unwrap();
        assert_eq!(f32::from_le_bytes(temp_bytes), 0.4_f32);

        assert_eq!(bytes.len(), 8, "response_mime_type=None no debería codificar nada");
    }

    #[tokio::test]
    async fn test_gemini_provider() {
        ensure_crypto_provider();
        let settings = Settings::from_env().unwrap();
        if settings.gemini_api_key.is_none()
            || settings.gemini_api_key.as_deref() == Some("DISABLED")
        {
            println!("Saltando test de Gemini porque no hay API Key configurada.");
            return;
        }
        let provider = GeminiGrpcProvider::new(&settings).unwrap();
        let res = provider
            .analyze_error("I goes to school", "I go to school", "Yo voy a la escuela")
            .await;
        println!("Resultado de prueba de Gemini: {:?}", res);
        assert!(res.is_ok(), "Error llamando a Gemini: {:?}", res.err());
        let response_text = res.unwrap();
        assert!(
            response_text.contains("is_correct"),
            "Respuesta inesperada: {}",
            response_text
        );
    }

    #[tokio::test]
    async fn test_gemini_hola() {
        ensure_crypto_provider();
        let settings = Settings::from_env().unwrap();
        if settings.gemini_api_key.is_none()
            || settings.gemini_api_key.as_deref() == Some("DISABLED")
        {
            println!("Saltando test de Gemini porque no hay API Key configurada.");
            return;
        }
        let provider = GeminiGrpcProvider::new(&settings).unwrap();
        let res = provider
            .call(
                "Eres un asistente de IA muy amigable y hablas español.",
                "Hola, ¿cómo estás?",
                0.7,
                "gemini-3.1-flash-lite",
                None,
            )
            .await;
        println!("Respuesta de Gemini al saludo: {:?}", res);
        assert!(res.is_ok(), "Error enviando saludo: {:?}", res.err());
    }

    #[tokio::test]
    async fn test_gemini_hora() {
        ensure_crypto_provider();
        let settings = Settings::from_env().unwrap();
        if settings.gemini_api_key.is_none()
            || settings.gemini_api_key.as_deref() == Some("DISABLED")
        {
            println!("Saltando test de Gemini porque no hay API Key configurada.");
            return;
        }
        let provider = GeminiGrpcProvider::new(&settings).unwrap();
        let prompt = "Dime qué hora es. Como contexto, mi hora local actual es 18:10 (6:10 PM) del 10 de junio de 2026.";
        let res = provider.call("Eres un asistente servicial y respondes de forma natural indicando la hora que te provee el usuario.", prompt, 0.7, "gemini-3.1-flash-lite", None).await;
        println!("Respuesta de Gemini sobre la hora: {:?}", res);
        assert!(res.is_ok(), "Error consultando la hora: {:?}", res.err());
    }
}
