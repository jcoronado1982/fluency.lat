use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct UpdateProgressRequest {
    pub user_id: String,
    pub story_id: i32,
    pub current_episode_id: i32,
    pub current_step_order: i32,
    pub score_increment: i32,
    pub status: String,
}
