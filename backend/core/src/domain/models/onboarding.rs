use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct OnboardingGuideRequest {
    pub locale: String,
    pub step_id: String,
    pub step_index: u32,
    pub step_total: u32,
    /// enter | correct_tap | wrong_tap | hint | state_timeout | element_missing
    pub event: String,
    pub target_label: String,
    pub target_hint: String,
    pub wrong_target_label: Option<String>,
    pub user_name: Option<String>,
    pub ui_state: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OnboardingGuideResponse {
    pub message: String,
}
