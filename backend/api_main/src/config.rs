use dotenvy::dotenv;
use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    pub project_id: String,
    pub region: String,
    pub gcs_json_prefix: String,
    pub gcs_images_prefix: String,
    pub gcs_audio_prefix: String,
    pub database_url: String,
    pub gemini_api_key: Option<String>,
    /// Activa generación de imágenes (Gemini prompt + ComfyUI). Default: true si hay GEMINI_API_KEY.
    pub image_ai_enabled: bool,
    /// Clave AI Studio solo para Gemini TTS (inglés). Si falta, cae en gemini_api_key.
    pub gemini_tts_api_key: Option<String>,
    /// Clave dedicada para la Interactions API de imagen. Opcional: si no se define, el provider
    /// cae a `gemini_tts_api_key` y luego a `gemini_api_key` — ver `resolve_api_key` en
    /// `infrastructure/ai/gemini_interactions_image_provider.rs`, que documenta por qué
    /// `GEMINI_API_KEY` da 403 `API_KEY_SERVICE_BLOCKED` en ese endpoint.
    pub gemini_image_api_key: Option<String>,
    /// Respaldo TTS solo para `--batch-gen-audio` local (`GeminiTtsProvider::new_for_batch`).
    /// No se usa en producción ni en el API HTTP.
    pub gemini_tts_api_key_backup: Option<String>,
    /// API key de Google Cloud Platform con permiso para Text-to-Speech.
    /// Si no se define, se usa gemini_api_key como fallback.
    pub gcp_api_key: Option<String>,
    pub comfy_url: String,
    pub local_storage_path: String,
    pub sync_to_oracle: bool,
    pub oracle_repository_only: bool,
    pub oracle_host: String,
    pub oracle_ssh_password: String,
    pub oracle_remote_path: String,
    /// Public base URL used to build absolute URLs for stored assets (e.g. story images).
    pub public_base_url: String,
    /// Controla quién conserva la caché larga de imágenes/audio.
    pub media_delivery_provider: String,
    /// ElevenLabs — solo TTS del landing demo (`landing-demo`).
    pub elevenlabs_api_key: Option<String>,
    pub elevenlabs_model_id: Option<String>,
    /// LemonSqueezy — proveedor de pago. `None` ⇒ `NullPaymentProvider` (activación manual).
    pub lemon_squeezy_api_key: Option<String>,
    pub lemon_squeezy_store_id: Option<String>,
    pub lemon_squeezy_variant_monthly: Option<String>,
    pub lemon_squeezy_variant_annual: Option<String>,
    /// Firma HMAC-SHA256 de webhooks entrantes (distinta de la API key; la genera
    /// LemonSqueezy al crear el webhook en su dashboard).
    pub lemon_squeezy_webhook_secret: Option<String>,
    /// Ollama local para el agente de programación.
    pub ollama_url: String,
    /// Modelo por defecto para el agente local.
    pub local_agent_model: String,
    /// Raíz del workspace que el agente puede tocar.
    pub local_agent_workspace_root: String,
    /// Máximo de iteraciones del bucle de agente.
    pub local_agent_max_steps: u32,
    /// Lista blanca de prefijos permitidos para `run_command`.
    pub local_agent_allowed_command_prefixes: Vec<Vec<String>>,
    /// Indica si el entorno en ejecución es producción
    pub is_production: bool,
}

/// Heurística de detección de entorno: sin una env var explícita (`ENVIRONMENT`/`APP_ENV`), se
/// infiere de a dónde apuntan las conexiones de datos. Pura y testeable a propósito — usada por
/// `image_use_cases.rs` (`use_direct_gemini_prod`) para saltarse el pipeline local Ollama+ComfyUI
/// y forzar Gemini directo con usuarios premium/admin, así que un falso positivo aquí rompe la
/// regla "local → IA local, producción → Gemini" en silencio.
///
/// `surreal_ns == "flashcard"` por sí solo NO es señal de producción: es también el namespace por
/// defecto en dev local contra una SurrealDB local (backend/CLAUDE.md §Persistencia — prod y QA
/// comparten instancia, diferenciados por namespace, pero un dev local sin perfil QA usa ese mismo
/// "flashcard"). Bug real (5 ago 2026): con `SURREAL_URL=127.0.0.1:...` y `SURREAL_NS=flashcard`
/// en `backend/.env`, `is_production` daba `true` en local solo por esta cláusula, forzando el
/// atajo de Gemini directo incluso en dev — nunca se ejercitaba el pipeline local Ollama+ComfyUI
/// ni se respetaba la elección Gemini/Local del diálogo del frontend. Por eso esta cláusula solo
/// cuenta si `SURREAL_URL` además apunta a un host remoto (no localhost/127.0.0.1) — así sigue
/// detectando prod/QA reales (comparten DB remota) sin falsos positivos en local.
fn compute_is_production(database_url: &str, surreal_url: &str, surreal_ns: &str) -> bool {
    let surreal_url_is_local =
        surreal_url.contains("localhost") || surreal_url.contains("127.0.0.1");
    (!database_url.is_empty()
        && !database_url.contains("localhost")
        && !database_url.contains("127.0.0.1")
        && !database_url.contains("db"))
        || (!surreal_url.is_empty() && !surreal_url_is_local)
        || (surreal_ns == "flashcard" && !surreal_url_is_local)
}

impl Settings {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenv().ok();

        let gemini_api_key = env::var("GEMINI_API_KEY").ok();
        let database_url = env::var("DATABASE_URL").unwrap_or_default();
        let surreal_url = env::var("SURREAL_URL").unwrap_or_default();
        let surreal_ns = env::var("SURREAL_NS").unwrap_or_default();
        let is_production = compute_is_production(&database_url, &surreal_url, &surreal_ns);

        let flashcard_prompt_engine = if is_production {
            "gemini".to_string()
        } else {
            env::var("FLASHCARD_PROMPT_ENGINE")
                .unwrap_or_else(|_| "gemini".to_string())
                .to_ascii_lowercase()
        };
        let uses_local_prompt_llm = matches!(flashcard_prompt_engine.as_str(), "ollama" | "qwen3");
        let image_ai_enabled = env::var("IMAGE_AI_ENABLED")
            .unwrap_or_else(|_| "true".to_string())
            .parse::<bool>()
            .unwrap_or(true);
        let workspace_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap_or_else(|_| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.."));
        let allowed_command_prefixes = env::var("LOCAL_AGENT_ALLOWED_COMMANDS")
            .unwrap_or_else(|_| {
                [
                    "cargo check",
                    "cargo test",
                    "cargo fmt",
                    "git status",
                    "git diff",
                    "git log",
                ]
                .join(",")
            })
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| {
                value
                    .split_whitespace()
                    .map(|part| part.to_string())
                    .collect()
            })
            .collect();

        let settings = Settings {
            project_id: env::var("PROJECT_ID").unwrap_or_else(|_| "xrubi-fd22e".to_string()),
            region: env::var("REGION").unwrap_or_else(|_| "us-east1".to_string()),
            gcs_json_prefix: env::var("GCS_JSON_PREFIX").unwrap_or_else(|_| "json".to_string()),
            gcs_images_prefix: env::var("GCS_IMAGES_PREFIX")
                .unwrap_or_else(|_| "card_images".to_string()),
            gcs_audio_prefix: env::var("GCS_AUDIO_PREFIX")
                .unwrap_or_else(|_| "card_audio".to_string()),
            database_url: env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgresql://postgres:postgres@localhost:5432/flashcard_db".to_string()
            }),
            gemini_api_key: gemini_api_key.clone(),
            image_ai_enabled: image_ai_enabled
                && (uses_local_prompt_llm
                    || gemini_api_key
                        .as_deref()
                        .map(|k| !k.is_empty() && k != "DISABLED")
                        .unwrap_or(false)),
            gemini_tts_api_key: env::var("GEMINI_TTS_API_KEY").ok(),
            gemini_image_api_key: env::var("GEMINI_IMAGE_API_KEY").ok(),
            gemini_tts_api_key_backup: env::var("GEMINI_TTS_API_KEY_BACKUP").ok(),
            gcp_api_key: env::var("GCP_API_KEY").ok(),
            comfy_url: env::var("COMFY_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:8188".to_string()),
            // El feedback se guarda en el filesystem local durante desarrollo.
            // Usar "." hacía que la ruta dependiera del directorio desde el
            // que se lanzara el binario; al recargar podía leerse otro archivo.
            local_storage_path: env::var("LOCAL_STORAGE_PATH").unwrap_or_else(|_| {
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("../..")
                    .canonicalize()
                    .unwrap_or_else(|_| {
                        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
                    })
                    .to_string_lossy()
                    .to_string()
            }),
            sync_to_oracle: env::var("SYNC_TO_ORACLE")
                .unwrap_or_else(|_| "false".to_string())
                .parse::<bool>()
                .unwrap_or(false),
            oracle_repository_only: env::var("ORACLE_REPOSITORY_ONLY")
                .unwrap_or_else(|_| "true".to_string())
                .parse::<bool>()
                .unwrap_or(true),
            oracle_host: env::var("ORACLE_HOST").unwrap_or_else(|_| "35.188.162.50".to_string()),
            oracle_ssh_password: env::var("ORACLE_SSH_PASSWORD").unwrap_or_else(|_| "".to_string()),
            oracle_remote_path: env::var("ORACLE_REMOTE_PATH")
                .unwrap_or_else(|_| "/root/smart-proxy/repository/flashcard".to_string()),
            public_base_url: env::var("PUBLIC_BASE_URL")
                .unwrap_or_else(|_| "https://fluency.lat".to_string()),
            // Oracle es el default seguro: funciona aunque Cloudflare todavía no
            // esté proxying el dominio. Cambiar una sola variable activa el CDN.
            media_delivery_provider: env::var("MEDIA_DELIVERY_MODE")
                .unwrap_or_else(|_| "oracle".to_string())
                .trim()
                .to_ascii_lowercase(),
            elevenlabs_api_key: env::var("ELEVENLABS_API_KEY").ok(),
            elevenlabs_model_id: env::var("ELEVENLABS_MODEL_ID").ok(),
            lemon_squeezy_api_key: env::var("LEMON_SQUEEZY_API_KEY").ok(),
            lemon_squeezy_store_id: env::var("LEMON_SQUEEZY_STORE_ID").ok(),
            lemon_squeezy_variant_monthly: env::var("LEMON_SQUEEZY_VARIANT_MONTHLY").ok(),
            lemon_squeezy_variant_annual: env::var("LEMON_SQUEEZY_VARIANT_ANNUAL").ok(),
            lemon_squeezy_webhook_secret: env::var("LEMON_SQUEEZY_WEBHOOK_SECRET").ok(),
            ollama_url: env::var("OLLAMA_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string()),
            local_agent_model: env::var("LOCAL_AGENT_MODEL")
                .or_else(|_| env::var("OLLAMA_MODEL"))
                .unwrap_or_else(|_| "deepseek-r1:32b".to_string()),
            local_agent_workspace_root: env::var("LOCAL_AGENT_WORKSPACE_ROOT")
                .unwrap_or_else(|_| workspace_root.to_string_lossy().to_string()),
            local_agent_max_steps: env::var("LOCAL_AGENT_MAX_STEPS")
                .unwrap_or_else(|_| "8".to_string())
                .parse::<u32>()
                .unwrap_or(8),
            local_agent_allowed_command_prefixes: allowed_command_prefixes,
            is_production,
        };

        Ok(settings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Valores reales de `backend/.env` a la fecha del bug (5 ago 2026): SurrealDB local
    /// (`127.0.0.1:8001`) pero con el namespace por defecto compartido con producción
    /// ("flashcard"), y un `DATABASE_URL` de Postgres apuntando a un host remoto legado que ya
    /// no se usa como DB del producto (ver CLAUDE.md raíz: "Postgres solo existe en
    /// docker-compose local, sin uso en producción") pero que la heurística igual evalúa.
    #[test]
    fn local_dev_with_shared_namespace_is_not_production() {
        assert!(!compute_is_production(
            "postgresql://postgres:x@172.202.197.64:5432/flashcard_db?sslmode=disable",
            "127.0.0.1:8001",
            "flashcard",
        ));
    }

    #[test]
    fn local_dev_with_empty_database_url_is_not_production() {
        assert!(!compute_is_production("", "127.0.0.1:8001", "flashcard"));
    }

    #[test]
    fn gcp_production_is_detected() {
        assert!(compute_is_production("", "10.128.0.5:8080", "flashcard"));
    }

    #[test]
    fn qa_sharing_the_production_surrealdb_host_is_detected() {
        // QA vive en la misma instancia remota que prod, diferenciada solo por namespace
        // (backend/CLAUDE.md §Persistencia) — para el propósito de esta heurística (¿hay
        // ComfyUI/Ollama locales alcanzables?) QA se comporta igual que producción.
        assert!(compute_is_production("", "10.128.0.5:8080", "qa_flashcard"));
    }

    #[test]
    fn remote_database_url_without_surreal_vars_is_production() {
        // Sin sustituir "flashcard_db" por otro nombre: el propio `compute_is_production`
        // excluye URLs con "db" en el string (alias típico de un host docker-compose local
        // llamado "db"), así que un nombre de base con "db" en el medio no debe usarse aquí.
        assert!(compute_is_production(
            "postgresql://user:pass@203.0.113.9:5432/flashcard_prod",
            "",
            "",
        ));
    }
}
