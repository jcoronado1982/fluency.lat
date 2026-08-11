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
