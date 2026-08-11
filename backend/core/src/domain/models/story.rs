use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Story {
    pub id: i32,
    pub title: String,
    pub level: String,
    pub order_sequence: i32,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Episode {
    pub id: i32,
    pub story_id: i32,
    pub episode_number: i32,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoryScreen {
    pub id: i32,
    pub episode_id: i32,
    pub step_order: i32,
    pub content: serde_json::Value,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserProgress {
    pub user_id: String,
    pub story_id: i32,
    pub current_episode_id: i32,
    pub current_step_order: i32,
    pub total_score: i32,
    pub status: String,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProgressResponse {
    pub user_id: String,
    pub story_id: i32,
    pub current_episode_id: i32,
    pub story_title: String,
    pub current_episode_title: String,
    pub current_step_order: i32,
    pub total_score: i32,
    pub status: String,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ProgressUpdate {
    pub user_id: String,
    pub story_id: i32,
    pub current_episode_id: i32,
    pub current_step_order: i32,
    pub score_increment: i32,
    pub status: String,
}
