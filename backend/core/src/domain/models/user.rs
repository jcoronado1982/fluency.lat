use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CatalogPreferences {
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub groups: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub version: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: Option<String>,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub role: String,
    pub onboarding_completed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub study_language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalog_preferences: Option<CatalogPreferences>,
    pub created_at: DateTime<Utc>,
    pub last_login: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GooglePayload {
    pub sub: String, // Google ID
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub email_verified: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplePayload {
    pub sub: String, // Apple ID
    pub email: Option<String>,
    pub email_verified: Option<serde_json::Value>, // Apple returns boolean or string
}
