use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemoFeedback {
    pub created_at: DateTime<Utc>,
    pub user_email: String,
    pub user_name: String,
    pub comment: String,
    pub rating: u8,
    pub language: Option<String>,
    pub source: Option<String>,
    pub picture: Option<String>,
    pub country: Option<String>,
    pub user_handle: Option<String>,
}
