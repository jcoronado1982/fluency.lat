use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
#[allow(dead_code)]
pub trait ImageGenerator: Send + Sync {
    async fn generate(&self, prompt: &str) -> Result<Vec<u8>>;

    /// Ensambla el prompt final enviado a `generate()` a partir de la descripción visual (ya
    /// mejorada por `AITutor`) y el complemento opcional de escena del usuario. Cada proveedor
    /// concreto conoce el formato/hints que su propia API espera (aspect_ratio, estilo, etc.) —
    /// el caso de uso nunca debe construir ese texto a mano ni conocer detalles de un proveedor
    /// concreto. Implementación por defecto: prompt fotográfico genérico sin hints de proveedor.
    fn finalize_prompt(&self, visual_description: &str, scene_complement: Option<&str>) -> String {
        let mut prompt = format!(
            "A natural, unedited candid snapshot, shot on 35mm lens, f/2.8 aperture, soft diffused ambient indoor/outdoor daylight. Balanced natural exposure with rich midtones — NOT overexposed, NOT washed out, NO blown-out white window highlights, NO harsh camera flash flare. Neutral skin tones with healthy balanced complexions — NOT reddish, NOT flushed, NOT oversaturated. Muted realistic color profile, gentle even shadows across faces and walls — NOT high-contrast, NOT studio bright, NOT digitally retouched. Authentic skin textures, realistic pores, subtle natural highlights. Avoid CGI-clean surfaces, avoid artificial white glare, avoid airbrushed skin: {}. An unposed, everyday life scene in a realistic setting. No text, no words, no captions, no signage, no watermarks.",
            visual_description
        );
        if let Some(c) = scene_complement.map(str::trim).filter(|s| !s.is_empty()) {
            prompt.push_str(&format!(" Also include: {}.", c));
        }
        prompt
    }
}
