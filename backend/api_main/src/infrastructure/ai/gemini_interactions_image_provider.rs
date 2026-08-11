use crate::config::Settings;
use crate::domain::repositories::image::ImageGenerator;
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use base64::Engine;
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;
use tracing::info;

/// Generación de imagen vía Interactions API (`gemini-3.1-flash-lite-image`).
/// Usado para landing demo y generación directa en producción.
pub struct GeminiInteractionsImageProvider {
    client: Client,
    api_key: String,
    model: String,
    aspect_ratio: String,
    image_size: String,
    /// `true` cuando la entrada de `finalize_prompt` es la **frase cruda** de la tarjeta (atajo de
    /// producción) y no una descripción visual ya refinada por el LLM (landing demo). Cambia si
    /// hace falta envolverla en una instrucción explícita de "dibujá esto" — ver `finalize_prompt`.
    wraps_raw_phrase: bool,
}

impl GeminiInteractionsImageProvider {
    /// Landing demo: la entrada ya viene refinada por `improve_prompt_for_landing_demo_image`.
    pub fn new(settings: &Settings) -> Self {
        use crate::infrastructure::ai::gemini_landing_demo_prompts::GEMINI_IMAGE_MODEL;
        Self::build(settings, GEMINI_IMAGE_MODEL, false)
    }

    /// Atajo de producción (`use_direct_gemini_prod`): la entrada es la frase de la tarjeta tal
    /// cual, sin pasar por el refinado de prompt, así que hay que pedir la imagen explícitamente.
    pub fn for_raw_phrase(settings: &Settings, model: &str) -> Self {
        Self::build(settings, model, true)
    }

    fn build(settings: &Settings, model: &str, wraps_raw_phrase: bool) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Error building Gemini image HTTP client");

        use crate::infrastructure::ai::gemini_landing_demo_prompts::{
            GEMINI_IMAGE_ASPECT_RATIO, GEMINI_IMAGE_SIZE,
        };
        let (aspect_ratio, image_size) = (
            GEMINI_IMAGE_ASPECT_RATIO.to_string(),
            GEMINI_IMAGE_SIZE.to_string(),
        );

        Self {
            client,
            api_key: Self::resolve_api_key(settings),
            model: model.to_string(),
            aspect_ratio,
            image_size,
            wraps_raw_phrase,
        }
    }

    /// Resuelve la clave para la Interactions API. **No sirve cualquier clave de Gemini**:
    /// este endpoint (`generativelanguage.googleapis.com/v1beta/interactions`) tiene que estar
    /// habilitado para esa clave en concreto. Verificado en vivo el 5 ago 2026 mandando el mismo
    /// request con cada clave del proyecto: la de Agent Platform (`GEMINI_API_KEY`, la que usaba
    /// producción) responde **403 `API_KEY_SERVICE_BLOCKED`**, mientras que la de Google AI
    /// Studio (`GEMINI_TTS_API_KEY`) responde 400 "Provide a 'model' parameter" — es decir, la
    /// clave pasa el control de acceso y solo faltaba el cuerpo. Por eso generar imagen en
    /// producción fallaba con 403 aunque la clave fuera válida para otros usos de Gemini.
    ///
    /// Orden: `GEMINI_IMAGE_API_KEY` (dedicada, si algún día se emite una) → `GEMINI_TTS_API_KEY`
    /// (AI Studio, la que hoy tiene acceso) → `GEMINI_API_KEY` (último recurso). El nombre `TTS`
    /// es legado: identifica el proyecto de AI Studio, no el servicio.
    fn resolve_api_key(settings: &Settings) -> String {
        // El descarte de vacías va POR CANDIDATO, no al final: una clave definida pero vacía
        // (`GEMINI_IMAGE_API_KEY=`) debe dejar pasar a la siguiente, no deshabilitar el provider.
        [
            settings.gemini_image_api_key.as_deref(),
            settings.gemini_tts_api_key.as_deref(),
            settings.gemini_api_key.as_deref(),
        ]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|k| !k.is_empty())
        .unwrap_or("DISABLED")
        .to_string()
    }

    fn extract_image_bytes(body: &Value) -> Result<Vec<u8>> {
        if let Some(data) = body
            .get("output_image")
            .and_then(|o| o.get("data"))
            .and_then(|d| d.as_str())
        {
            return decode_image_b64(data);
        }

        if let Some(steps) = body.get("steps").and_then(|s| s.as_array()) {
            for step in steps {
                if step.get("type").and_then(|t| t.as_str()) != Some("model_output") {
                    continue;
                }
                if let Some(blocks) = step.get("content").and_then(|c| c.as_array()) {
                    for block in blocks {
                        if block.get("type").and_then(|t| t.as_str()) == Some("image") {
                            if let Some(data) = block.get("data").and_then(|d| d.as_str()) {
                                return decode_image_b64(data);
                            }
                        }
                    }
                }
            }
        }

        // Sin imagen: el error tiene que decir QUÉ vino en su lugar. La versión anterior devolvía
        // solo "no image block", y con eso un fallo real de producción (el modelo respondiendo
        // conversacionalmente en vez de dibujar) fue indistinguible de un cambio de formato de la
        // API — hubo que reproducirlo a mano contra el endpoint para verlo.
        let status = body.get("status").and_then(|s| s.as_str()).unwrap_or("?");
        let text_reply = body
            .get("steps")
            .and_then(|s| s.as_array())
            .into_iter()
            .flatten()
            .filter_map(|step| step.get("content").and_then(|c| c.as_array()))
            .flatten()
            .find(|block| block.get("type").and_then(|t| t.as_str()) == Some("text"))
            .and_then(|block| block.get("text").and_then(|t| t.as_str()));

        match text_reply {
            Some(text) => Err(anyhow!(
                "Gemini image: el modelo respondió con TEXTO en vez de una imagen \
                 (status={status}). Suele pasar cuando el prompt suena a conversación y no a \
                 descripción de escena. Respuesta: {:.300}",
                text
            )),
            None => {
                let shape: Vec<String> = body
                    .get("steps")
                    .and_then(|s| s.as_array())
                    .map(|steps| {
                        steps
                            .iter()
                            .map(|step| {
                                let kind =
                                    step.get("type").and_then(|t| t.as_str()).unwrap_or("?");
                                let blocks: Vec<&str> = step
                                    .get("content")
                                    .and_then(|c| c.as_array())
                                    .map(|cs| {
                                        cs.iter()
                                            .filter_map(|b| {
                                                b.get("type").and_then(|t| t.as_str())
                                            })
                                            .collect()
                                    })
                                    .unwrap_or_default();
                                format!("{kind}{blocks:?}")
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                Err(anyhow!(
                    "Gemini image: no image block in interaction response \
                     (status={status}, steps={shape:?})"
                ))
            }
        }
    }
}

fn decode_image_b64(data: &str) -> Result<Vec<u8>> {
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .context("Gemini image: base64 decode failed")
}

#[async_trait]
impl ImageGenerator for GeminiInteractionsImageProvider {
    fn finalize_prompt(&self, visual_description: &str, scene_complement: Option<&str>) -> String {
        if self.wraps_raw_phrase {
            // La Interactions API es conversacional: si le llega una frase que suena a diálogo,
            // RESPONDE en vez de dibujar. Caso real de producción (5 ago 2026, deck
            // `1-basic/modal_auxiliaries`): con `input="I could help you."` devolvió HTTP 200 y un
            // bloque de texto ("That's very kind of you to offer! As an AI, I don't need help…"),
            // sin imagen — y el pipeline moría con "no image block in interaction response". El
            // atajo de producción manda la frase CRUDA (no pasa por el refinado de Ollama), así
            // que hay que pedir la imagen de forma explícita. Verificado: envuelta así, las mismas
            // frases que fallaban ("I could help you.", "Can I help you?", "You should have told
            // me.") devuelven imagen.
            let mut prompt = format!(
                "Candid photorealistic DSLR photograph for a language-learning flashcard. \
                 Depict: {}. A realistic, unposed, everyday life scene. \
                 No text, no words, no letters, no captions, no signage, no watermarks.",
                visual_description.trim()
            );
            if let Some(c) = scene_complement.map(str::trim).filter(|s| !s.is_empty()) {
                prompt.push_str(&format!(" Visibly include: {}.", c));
            }
            prompt
        } else if self.model == "gemini-3.1-flash-lite-image" {
            if let Some(c) = scene_complement.map(str::trim).filter(|s| !s.is_empty()) {
                format!("{}, {}", visual_description, c)
            } else {
                visual_description.to_string()
            }
        } else {
            crate::infrastructure::ai::gemini_landing_demo_prompts::build_demo_image_prompt(
                visual_description,
                scene_complement,
            )
        }
    }

    async fn generate(&self, prompt: &str) -> Result<Vec<u8>> {
        if self.api_key.is_empty() || self.api_key == "DISABLED" {
            return Err(anyhow!(
                "Gemini API key no configurada para imágenes del demo"
            ));
        }

        info!(
            model = %self.model,
            prompt_len = prompt.len(),
            "gemini-image:request"
        );

        let body = json!({
            "model": self.model,
            "input": prompt,
            "response_format": {
                "type": "image",
                "aspect_ratio": self.aspect_ratio,
                "image_size": self.image_size,
            }
        });

        let resp = self
            .client
            .post("https://generativelanguage.googleapis.com/v1beta/interactions")
            .header("x-goog-api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .context("Gemini image: HTTP request failed")?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .context("Gemini image: read body failed")?;

        if !status.is_success() {
            return Err(anyhow!(
                "Gemini image API {}: {}",
                status,
                &text[..text.len().min(500)]
            ));
        }

        let json: Value = serde_json::from_str(&text).context("Gemini image: invalid JSON")?;

        if json.get("status").and_then(|s| s.as_str()) != Some("completed") {
            return Err(anyhow!(
                "Gemini image: interaction not completed (status={:?})",
                json.get("status")
            ));
        }

        let bytes = Self::extract_image_bytes(&json)?;
        info!(bytes = bytes.len(), "gemini-image:ok");
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// `Settings` con las 3 claves de Gemini controlables y el resto en valores neutros.
    fn settings_with_keys(
        image: Option<&str>,
        tts: Option<&str>,
        general: Option<&str>,
    ) -> Settings {
        let mut s = Settings::from_env().expect("Settings::from_env tiene defaults para todo");
        s.gemini_image_api_key = image.map(str::to_string);
        s.gemini_tts_api_key = tts.map(str::to_string);
        s.gemini_api_key = general.map(str::to_string);
        s
    }

    #[test]
    fn prefers_the_dedicated_image_key() {
        let s = settings_with_keys(Some("image-key"), Some("tts-key"), Some("general-key"));
        assert_eq!(
            GeminiInteractionsImageProvider::resolve_api_key(&s),
            "image-key"
        );
    }

    /// El caso real de producción (5 ago 2026): sin clave dedicada, debe usar la de AI Studio
    /// y NO `GEMINI_API_KEY`, que da 403 API_KEY_SERVICE_BLOCKED en la Interactions API.
    #[test]
    fn falls_back_to_ai_studio_key_before_the_blocked_general_key() {
        let s = settings_with_keys(None, Some("tts-key"), Some("general-key"));
        assert_eq!(
            GeminiInteractionsImageProvider::resolve_api_key(&s),
            "tts-key"
        );
    }

    #[test]
    fn falls_back_to_the_general_key_as_last_resort() {
        let s = settings_with_keys(None, None, Some("general-key"));
        assert_eq!(
            GeminiInteractionsImageProvider::resolve_api_key(&s),
            "general-key"
        );
    }

    /// Una clave definida pero vacía debe dejar pasar a la siguiente, no deshabilitar el
    /// provider (regresión de la primera versión de `resolve_api_key`, que filtraba el vacío
    /// recién al final de la cadena).
    #[test]
    fn an_empty_key_falls_through_to_the_next_candidate() {
        let s = settings_with_keys(Some(""), Some("tts-key"), Some("general-key"));
        assert_eq!(
            GeminiInteractionsImageProvider::resolve_api_key(&s),
            "tts-key"
        );
    }

    #[test]
    fn disables_itself_when_no_key_is_usable() {
        let s = settings_with_keys(None, None, None);
        assert_eq!(
            GeminiInteractionsImageProvider::resolve_api_key(&s),
            "DISABLED"
        );
        // Una clave vacía es tan inservible como una ausente.
        let s = settings_with_keys(None, None, Some("   "));
        assert_eq!(
            GeminiInteractionsImageProvider::resolve_api_key(&s),
            "DISABLED"
        );
    }

    /// El atajo de producción manda la frase cruda, así que `finalize_prompt` DEBE pedir la
    /// imagen explícitamente: sin eso, la Interactions API responde conversacionalmente a frases
    /// como "I could help you." y no genera nada (fallo real del 5 ago 2026).
    #[test]
    fn raw_phrase_mode_asks_for_an_image_explicitly() {
        let s = settings_with_keys(None, Some("k"), None);
        let p = GeminiInteractionsImageProvider::for_raw_phrase(&s, "gemini-3.1-flash-lite-image");
        let out = p.finalize_prompt("I could help you.", None);
        assert!(out.contains("photograph"), "debe pedir una fotografía: {out}");
        assert!(out.contains("I could help you."), "debe conservar la frase");
        assert!(out.len() > "I could help you.".len(), "no puede ir cruda");
    }

    #[test]
    fn raw_phrase_mode_keeps_the_scene_complement() {
        let s = settings_with_keys(None, Some("k"), None);
        let p = GeminiInteractionsImageProvider::for_raw_phrase(&s, "gemini-3.1-flash-lite-image");
        let out = p.finalize_prompt("correr", Some("un parque con árboles"));
        assert!(out.contains("correr"));
        assert!(out.contains("un parque con árboles"));
    }

    /// El landing demo ya recibe una descripción visual refinada por el LLM: su prompt NO debe
    /// cambiar por el fix del atajo de producción (sus imágenes son visibles en la landing).
    #[test]
    fn demo_mode_passes_the_refined_description_through_unchanged() {
        let s = settings_with_keys(None, Some("k"), None);
        let p = GeminiInteractionsImageProvider::new(&s);
        let desc = "A woman pouring coffee in a sunlit kitchen, worn wooden table";
        assert_eq!(p.finalize_prompt(desc, None), desc);
        assert_eq!(
            p.finalize_prompt(desc, Some("a red mug")),
            format!("{desc}, a red mug")
        );
    }

    /// Cuando el modelo contesta con texto, el error debe decirlo y citar la respuesta — si no,
    /// es indistinguible de un cambio de formato de la API (nos costó una reproducción manual).
    #[test]
    fn text_only_response_produces_a_diagnosable_error() {
        let body = json!({
            "status": "completed",
            "steps": [
                {"type": "thought"},
                {"type": "model_output", "content": [
                    {"type": "text", "text": "That's very kind of you to offer! As an AI…"}
                ]}
            ]
        });
        let err = GeminiInteractionsImageProvider::extract_image_bytes(&body)
            .expect_err("sin bloque de imagen debe ser error")
            .to_string();
        assert!(err.contains("TEXTO"), "{err}");
        assert!(err.contains("That's very kind"), "debe citar la respuesta: {err}");
    }

    #[test]
    fn missing_image_without_text_reports_the_response_shape() {
        let body = json!({"status": "incomplete", "steps": [{"type": "thought"}]});
        let err = GeminiInteractionsImageProvider::extract_image_bytes(&body)
            .expect_err("sin imagen debe ser error")
            .to_string();
        assert!(err.contains("incomplete"), "debe incluir el status: {err}");
        assert!(err.contains("thought"), "debe describir los steps: {err}");
    }

    #[test]
    fn extracts_image_from_model_output_step() {
        let body = json!({
            "status": "completed",
            "steps": [
                {"type": "thought", "signature": "x"},
                {
                    "type": "model_output",
                    "content": [{
                        "type": "image",
                        "mime_type": "image/jpeg",
                        "data": "aGVsbG8="
                    }]
                }
            ]
        });
        let bytes = GeminiInteractionsImageProvider::extract_image_bytes(&body).unwrap();
        assert_eq!(bytes, b"hello");
    }
}
