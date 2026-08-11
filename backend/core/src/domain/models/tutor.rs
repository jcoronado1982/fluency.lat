use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TutorRequest {
    pub user_input: String,
    pub correct_answer: String,
    pub context_spanish: String,
    pub original_explanation: Option<String>,
    pub user_id: Option<String>,
    pub story_id: Option<i32>,
    pub screen_id: Option<i32>,
}
