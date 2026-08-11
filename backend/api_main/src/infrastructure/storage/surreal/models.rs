use crate::domain::models::story::StoryScreen;
use crate::domain::models::user::CatalogPreferences;
use crate::domain::models::user::User;
use surrealdb::types::{Datetime, RecordId, RecordIdKey, SerdeWrapper, SurrealValue};

#[derive(SurrealValue)]
pub struct SurrealUser {
    pub id: Option<RecordId>,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub role: String,
    pub onboarding_completed: Option<bool>,
    pub study_language: Option<String>,
    // CatalogPreferences vive en `core`, que por regla arquitectónica no puede
    // depender de `surrealdb` (backend/CLAUDE.md — "core no importa de
    // nadie"), así que no puede derivar SurrealValue directamente: se cruza
    // el límite infra/dominio con el puente oficial del SDK.
    pub catalog_preferences: Option<SerdeWrapper<CatalogPreferences>>,
    pub created_at: Datetime,
    pub last_login: Datetime,
}

impl From<SurrealUser> for User {
    fn from(value: SurrealUser) -> Self {
        User {
            id: value.id.map(|t| match t.key {
                RecordIdKey::String(s) => s,
                other => format!("{other:?}"),
            }),
            email: value.email,
            name: value.name,
            picture: value.picture,
            role: value.role,
            onboarding_completed: value.onboarding_completed.unwrap_or(false),
            study_language: value.study_language,
            catalog_preferences: value.catalog_preferences.map(|w| w.0),
            created_at: value.created_at.into_inner(),
            last_login: value.last_login.into_inner(),
        }
    }
}

#[derive(SurrealValue)]
pub struct SurrealStoryScreen {
    pub id: RecordId,
    pub episode_id: i32,
    pub step_order: i32,
    pub content: serde_json::Value,
}

impl From<SurrealStoryScreen> for StoryScreen {
    fn from(value: SurrealStoryScreen) -> Self {
        let numeric_id = match value.id.key {
            RecordIdKey::Number(n) => n as i32,
            RecordIdKey::String(s) => s.parse().unwrap_or(0),
            _ => 0,
        };
        StoryScreen {
            id: numeric_id,
            episode_id: value.episode_id,
            step_order: value.step_order,
            content: value.content,
        }
    }
}

#[cfg(test)]
mod tests {
    //! `SurrealX -> X` son las únicas funciones puras (sin round-trip a DB) de este módulo:
    //! traducen las rarezas del wire format de SurrealDB 3.2.3 (`RecordIdKey` no siempre es
    //! numérico, `onboarding_completed` puede faltar) a los modelos de dominio. Sin tests, un
    //! cambio de estas reglas de fallback pasaría inadvertido hasta producción.
    use super::*;

    fn record(table: &str, key: RecordIdKey) -> RecordId {
        RecordId::new(table, key)
    }

    #[test]
    fn surreal_user_keeps_a_string_id_as_is_and_defaults_missing_onboarding_to_false() {
        let surreal_user = SurrealUser {
            id: Some(record(
                "users",
                RecordIdKey::String("guest@local.dev".to_string()),
            )),
            email: "guest@local.dev".to_string(),
            name: "Guest".to_string(),
            picture: None,
            role: "admin".to_string(),
            onboarding_completed: None,
            study_language: Some("en".to_string()),
            catalog_preferences: None,
            created_at: Datetime::now(),
            last_login: Datetime::now(),
        };

        let user: User = surreal_user.into();

        assert_eq!(user.id, Some("guest@local.dev".to_string()));
        assert!(!user.onboarding_completed);
        assert_eq!(user.study_language, Some("en".to_string()));
        assert!(user.catalog_preferences.is_none());
    }

    #[test]
    fn surreal_user_falls_back_to_debug_format_for_non_string_ids() {
        let surreal_user = SurrealUser {
            id: Some(record("users", RecordIdKey::Number(42))),
            email: "guest@local.dev".to_string(),
            name: "Guest".to_string(),
            picture: None,
            role: "admin".to_string(),
            onboarding_completed: Some(true),
            study_language: None,
            catalog_preferences: None,
            created_at: Datetime::now(),
            last_login: Datetime::now(),
        };

        let user: User = surreal_user.into();

        // No-string keys se degradan al formato Debug del enum (incluye el nombre de variante),
        // no al valor crudo — comportamiento intencional del fallback, no un bug.
        assert_eq!(user.id, Some("Number(42)".to_string()));
        assert!(user.onboarding_completed);
    }

    #[test]
    fn surreal_user_unwraps_catalog_preferences_through_the_serde_bridge() {
        let prefs = CatalogPreferences {
            categories: vec!["verbs".to_string()],
            ..Default::default()
        };
        let surreal_user = SurrealUser {
            id: None,
            email: "guest@local.dev".to_string(),
            name: "Guest".to_string(),
            picture: None,
            role: "admin".to_string(),
            onboarding_completed: Some(true),
            study_language: None,
            catalog_preferences: Some(SerdeWrapper(prefs)),
            created_at: Datetime::now(),
            last_login: Datetime::now(),
        };

        let user: User = surreal_user.into();

        assert_eq!(user.id, None);
        assert_eq!(
            user.catalog_preferences.unwrap().categories,
            vec!["verbs".to_string()]
        );
    }

    #[test]
    fn story_screen_reads_a_numeric_record_id_as_is() {
        let surreal_screen = SurrealStoryScreen {
            id: record("story_screens", RecordIdKey::Number(7)),
            episode_id: 3,
            step_order: 1,
            content: serde_json::json!({"text": "hola"}),
        };

        let screen: StoryScreen = surreal_screen.into();

        assert_eq!(screen.id, 7);
        assert_eq!(screen.episode_id, 3);
    }

    #[test]
    fn story_screen_parses_a_numeric_looking_string_id() {
        let surreal_screen = SurrealStoryScreen {
            id: record("story_screens", RecordIdKey::String("12".to_string())),
            episode_id: 3,
            step_order: 1,
            content: serde_json::Value::Null,
        };

        let screen: StoryScreen = surreal_screen.into();

        assert_eq!(screen.id, 12);
    }

    #[test]
    fn story_screen_falls_back_to_zero_for_ids_it_cannot_interpret_as_a_number() {
        let non_numeric_string = SurrealStoryScreen {
            id: record(
                "story_screens",
                RecordIdKey::String("not-a-number".to_string()),
            ),
            episode_id: 3,
            step_order: 1,
            content: serde_json::Value::Null,
        };
        assert_eq!(<StoryScreen>::from(non_numeric_string).id, 0);

        let uuid_key = SurrealStoryScreen {
            id: record("story_screens", RecordIdKey::Uuid(Default::default())),
            episode_id: 3,
            step_order: 1,
            content: serde_json::Value::Null,
        };
        assert_eq!(<StoryScreen>::from(uuid_key).id, 0);
    }
}

#[derive(SurrealValue)]
pub struct SurrealUserActivityStats {
    pub email: String,
    pub visit_count: Option<i32>,
    pub total_duration_secs: Option<i64>,
    pub last_device_type: Option<String>,
    pub last_browser: Option<String>,
    pub last_os: Option<String>,
    pub last_ip: Option<String>,
    pub last_country: Option<String>,
    pub last_study_date: Option<String>,
    pub current_streak: Option<i32>,
    pub longest_streak: Option<i32>,
}
