use super::connection::SurrealConnection;
use super::models::SurrealUser;
use crate::domain::models::user::{CatalogPreferences, User};
use crate::domain::repositories::db_repository::UserRepository;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use std::sync::Arc;
use surrealdb::types::{SerdeWrapper, SurrealValue};

pub struct SurrealUserRepository(pub Arc<SurrealConnection>);

#[async_trait]
impl UserRepository for SurrealUserRepository {
    async fn get_user_by_email(&self, email: &str) -> Result<Option<User>> {
        let mut res = self
            .0
            .db()
            .query("SELECT * FROM user WHERE email = $email")
            .bind(("email", email))
            .await?;
        let user: Option<SurrealUser> = res.take(0)?;
        Ok(user.map(Into::into))
    }

    async fn upsert_user(&self, user: User) -> Result<User> {
        // derive(SurrealValue) directo (datetime nativo), no SerdeWrapper sobre
        // la struct completa: se lee de vuelta con SurrealUser (models.rs), que
        // también deriva SurrealValue directo y por lo tanto espera datetime
        // nativo. Mezclar ambos rompía CADA login real (ver
        // scripts/troubleshooting_library.skill.md entrada 5) — catalog_preferences
        // sigue envuelto en SerdeWrapper solo a nivel de ESE campo, igual que en
        // SurrealUser, porque CatalogPreferences vive en `core` y no puede derivar
        // SurrealValue.
        #[derive(SurrealValue)]
        struct SurrealUserUpdate {
            email: String,
            name: String,
            picture: Option<String>,
            role: String,
            onboarding_completed: bool,
            study_language: Option<String>,
            catalog_preferences: Option<SerdeWrapper<CatalogPreferences>>,
            created_at: chrono::DateTime<chrono::Utc>,
            last_login: chrono::DateTime<chrono::Utc>,
        }

        let update_data = SurrealUserUpdate {
            email: user.email.clone(),
            name: user.name,
            picture: user.picture,
            role: user.role,
            onboarding_completed: user.onboarding_completed,
            study_language: user.study_language,
            catalog_preferences: user.catalog_preferences.map(SerdeWrapper),
            created_at: user.created_at,
            last_login: user.last_login,
        };

        let mut res = self
            .0
            .db()
            .query(
                "
            UPSERT type::record('user', $email) CONTENT $data;
            SELECT * FROM type::record('user', $email);
        ",
            )
            .bind(("email", update_data.email.clone()))
            .bind(("data", update_data))
            .await?;
        let updated: Option<SurrealUser> = res.take(1)?;
        updated
            .map(Into::into)
            .ok_or_else(|| anyhow!("Failed to upsert user"))
    }

    async fn set_onboarding_completed(&self, email: &str, completed: bool) -> Result<Option<User>> {
        let mut res = self
            .0
            .db()
            .query(
                "
            UPDATE user SET onboarding_completed = $completed WHERE email = $email;
            SELECT * FROM user WHERE email = $email LIMIT 1;
        ",
            )
            .bind(("email", email))
            .bind(("completed", completed))
            .await?;
        let updated: Option<SurrealUser> = res.take(1)?;
        Ok(updated.map(Into::into))
    }

    async fn update_catalog_preferences(
        &self,
        email: &str,
        preferences: Option<CatalogPreferences>,
    ) -> Result<Option<User>> {
        let mut res = self
            .0
            .db()
            .query(
                "
            UPDATE user SET catalog_preferences = $preferences WHERE email = $email;
            SELECT * FROM user WHERE email = $email LIMIT 1;
        ",
            )
            .bind(("email", email))
            .bind(("preferences", preferences.map(SerdeWrapper)))
            .await?;
        let updated: Option<SurrealUser> = res.take(1)?;
        Ok(updated.map(Into::into))
    }

    async fn update_study_language(
        &self,
        email: &str,
        study_language: &str,
    ) -> Result<Option<User>> {
        let normalized = match study_language {
            "es" => "es",
            "de" => "de",
            _ => "en",
        };
        let mut res = self
            .0
            .db()
            .query(
                "
            UPDATE user SET study_language = $study_language WHERE email = $email;
            SELECT * FROM user WHERE email = $email LIMIT 1;
        ",
            )
            .bind(("email", email))
            .bind(("study_language", normalized))
            .await?;
        let updated: Option<SurrealUser> = res.take(1)?;
        Ok(updated.map(Into::into))
    }

    async fn reset_all_catalog_preferences(&self) -> Result<u64> {
        let affected = self.list_all_users().await?.len() as u64;
        self.0
            .db()
            .query("UPDATE user SET catalog_preferences = NONE;")
            .await?;
        Ok(affected)
    }

    async fn list_all_users(&self) -> Result<Vec<User>> {
        let mut res = self
            .0
            .db()
            .query("SELECT * FROM user ORDER BY last_login DESC")
            .await?;
        let users: Vec<SurrealUser> = res.take(0)?;
        Ok(users.into_iter().map(Into::into).collect())
    }
}
