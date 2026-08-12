use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait AITutor: Send + Sync {
    async fn analyze_error(
        &self,
        user_input: &str,
        correct_answer: &str,
        context_spanish: &str,
    ) -> Result<String>;
    async fn explain_like_child(
        &self,
        user_input: &str,
        correct_answer: &str,
        context_spanish: &str,
        original_explanation: Option<&str>,
    ) -> Result<String>;
    async fn improve_visual_prompts_batch(
        &self,
        story_data: &serde_json::Value,
        context: &str,
    ) -> Result<Vec<String>>;
    async fn improve_prompt_for_image(
        &self,
        phrase: &str,
        pos_category: &str,
        meaning: Option<&str>,
        usage_example: Option<&str>,
    ) -> Result<String>;
    /// Landing demo — pipeline de prompt aislado por proveedor (contenido concreto en
    /// `api_main::infrastructure::ai::gemini_landing_demo_prompts` para el adapter Gemini).
    async fn improve_prompt_for_landing_demo_image(
        &self,
        phrase: &str,
        pos_category: &str,
        meaning: Option<&str>,
        usage_example: Option<&str>,
        scene_complement: Option<&str>,
    ) -> Result<String>;
    async fn refine_audio_ssml(&self, text: &str, tone: &str) -> Result<String>;
    /// Genera 1 o 2 borradores de flashcard nueva a partir de una sola palabra/frase escrita por
    /// el usuario ("Crear palabra" — mazo personal, ver `mod_flashcards::card_creation_use_cases`).
    /// Cada elemento devuelto tiene la MISMA forma que ya usan las cards del catálogo (`name`,
    /// `phonetic`, `spoken_phonetic_us`, `search_term`, `is_verb`, `group_name`,
    /// `definitions[0]{...}`) más la clave `category` con la categoría gramatical detectada (una de
    /// las 9 ya existentes en el catálogo). SIEMPRE vía Gemini — nunca el pipeline local
    /// Ollama/ComfyUI.
    ///
    /// - Sin `category_override`/`level_override` (clasificación libre): devuelve 1 elemento, o 2
    ///   solo cuando la palabra tiene un segundo uso gramatical realmente común y cotidiano (ej.
    ///   función de verbo Y de sustantivo) — nunca acepciones raras/formales.
    /// - Con AMBOS overrides presentes (el usuario ya eligió categoría/nivel en el preview):
    ///   SIEMPRE devuelve exactamente 1 elemento, con `category`/`level` forzados a esos valores —
    ///   el contenido (definición/ejemplo) se escribe específicamente para esa lectura de la
    ///   palabra, no para la que Gemini hubiera elegido libremente.
    async fn generate_word_card_draft(
        &self,
        word: &str,
        course_direction: &str,
        category_override: Option<&str>,
        level_override: Option<&str>,
    ) -> Result<Vec<serde_json::Value>>;
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
    ) -> Result<String>;
}
