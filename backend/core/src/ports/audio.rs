use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait AudioGenerator: Send + Sync {
    async fn synthesize(&self, text: &str, voice_name: &str, lang: Option<&str>)
        -> Result<Vec<u8>>;
    async fn synthesize_ssml(
        &self,
        ssml: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>>;

    /// Elige una voz al azar del catálogo propio de este proveedor, excluyendo opcionalmente
    /// una voz (para "generar de nuevo con otra voz"). Devuelve `(label, voice_id)`: el label es
    /// lo que se guarda como metadata/UI, `voice_id` es lo que se pasa a `synthesize`. Para
    /// proveedores con un solo namespace (ej. Gemini) ambos valores son iguales. El caso de uso
    /// nunca debe conocer nombres de voz concretos de un proveedor — eso vive en el adapter.
    fn pick_voice(&self, exclude: Option<&str>) -> (String, String) {
        let _ = exclude;
        ("default".to_string(), "default".to_string())
    }
}
