use anyhow::Result;
use fluency_core::domain::models::onboarding::OnboardingGuideRequest;
use fluency_core::domain::models::tutor::TutorRequest;
use fluency_core::ports::tutor::AITutor;
use std::sync::Arc;

pub struct TutorUseCases {
    ai_tutor: Arc<dyn AITutor>,
}

impl TutorUseCases {
    pub fn new(ai_tutor: Arc<dyn AITutor>) -> Self {
        Self { ai_tutor }
    }

    pub async fn analyze_error(&self, request: TutorRequest) -> Result<String> {
        self.ai_tutor
            .analyze_error(
                &request.user_input,
                &request.correct_answer,
                &request.context_spanish,
            )
            .await
    }

    pub async fn explain_like_child(&self, request: TutorRequest) -> Result<String> {
        self.ai_tutor
            .explain_like_child(
                &request.user_input,
                &request.correct_answer,
                &request.context_spanish,
                request.original_explanation.as_deref(),
            )
            .await
    }

    pub async fn improve_prompt_for_image(
        &self,
        phrase: &str,
        pos_category: &str,
        meaning: Option<&str>,
        usage_example: Option<&str>,
    ) -> Result<String> {
        self.ai_tutor
            .improve_prompt_for_image(phrase, pos_category, meaning, usage_example)
            .await
    }

    pub async fn guide_onboarding_step(&self, request: OnboardingGuideRequest) -> Result<String> {
        let raw = self
            .ai_tutor
            .guide_onboarding_step(
                &request.locale,
                &request.step_id,
                request.step_index,
                request.step_total,
                &request.event,
                &request.target_label,
                &request.target_hint,
                request.wrong_target_label.as_deref(),
                request.user_name.as_deref(),
                request.ui_state.as_deref(),
            )
            .await?;

        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(message) = parsed["message"].as_str() {
                return Ok(message.to_string());
            }
        }

        Ok(raw)
    }
}
