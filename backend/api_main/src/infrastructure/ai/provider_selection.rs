//! Composition factories para los puertos de IA (`AITutor`, `AudioGenerator`).
//!
//! Mismo patrón que `infrastructure::media_delivery::provider_from_name` y
//! `infrastructure::payment` (ver docs/ARQUITECTURA_MODULAR.md §1): el nombre del
//! proveedor viene de una env var, el composition root (`main.rs`) es el único que
//! conoce los tipos concretos, y `mod_shell`/`mod_flashcards` solo ven `Arc<dyn Trait>`.
//! Hoy solo hay un proveedor registrado por puerto (Gemini); agregar Claude u otro
//! proveedor de tutor es agregar un `match` arm aquí, no tocar el composition root a mano.

use crate::config::Settings;
use crate::infrastructure::ai::gemini_grpc_provider::GeminiGrpcProvider;
use anyhow::Result;
use fluency_core::ports::tutor::AITutor;
use std::sync::Arc;

/// Composition factory del tutor de IA (`AITutor`). Env var: `AI_TUTOR_PROVIDER` (default `gemini`).
pub fn ai_tutor_provider_from_name(name: &str, settings: &Settings) -> Result<Arc<dyn AITutor>> {
    match name.trim().to_ascii_lowercase().as_str() {
        "gemini" => Ok(Arc::new(GeminiGrpcProvider::new(settings)?)),
        other => anyhow::bail!("AI_TUTOR_PROVIDER inválido: '{other}'. Proveedores: gemini"),
    }
}

#[cfg(feature = "flashcards")]
mod audio {
    use super::*;
    use crate::infrastructure::ai::routing_tts_provider::RoutingTtsProvider;
    use fluency_core::ports::audio::AudioGenerator;

    /// Composition factory del TTS principal (`AudioGenerator`). Env var: `AUDIO_TTS_PROVIDER`
    /// (default `gemini`). Distinto del TTS de landing-demo (ElevenLabs), que es un fallback
    /// opcional independiente, no una selección de proveedor.
    pub async fn audio_provider_from_name(
        name: &str,
        settings: &Settings,
    ) -> Result<Arc<dyn AudioGenerator>> {
        match name.trim().to_ascii_lowercase().as_str() {
            "gemini" => Ok(Arc::new(RoutingTtsProvider::new(settings).await?)),
            other => anyhow::bail!("AUDIO_TTS_PROVIDER inválido: '{other}'. Proveedores: gemini"),
        }
    }
}
#[cfg(feature = "flashcards")]
pub use audio::audio_provider_from_name;

#[cfg(test)]
mod tests {
    use super::*;

    fn test_settings() -> Settings {
        // Mismo patrón que gemini_grpc_provider::tests: instalar el CryptoProvider de rustls
        // una sola vez por proceso de test (ClientTlsConfig::new lo requiere).
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
        Settings::from_env().expect("Settings::from_env no debería fallar (todo tiene default)")
    }

    #[test]
    fn ai_tutor_factory_rejects_unknown_provider() {
        let settings = test_settings();
        match ai_tutor_provider_from_name("claude", &settings) {
            Ok(_) => panic!("se esperaba un error para un proveedor desconocido"),
            Err(e) => assert!(e.to_string().contains("AI_TUTOR_PROVIDER inválido")),
        }
    }

    #[tokio::test]
    async fn ai_tutor_factory_accepts_gemini_case_insensitive() {
        let settings = test_settings();
        assert!(ai_tutor_provider_from_name("Gemini", &settings).is_ok());
        assert!(ai_tutor_provider_from_name(" GEMINI ", &settings).is_ok());
    }
}
