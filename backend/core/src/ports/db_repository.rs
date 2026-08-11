use crate::domain::models::feedback::DemoFeedback;
use crate::domain::models::srs::{CardProgressUpdate, SrsReviewCandidate};
use crate::domain::models::story::{ProgressUpdate, StoryScreen, UserProgress};
use crate::domain::models::subscription::Subscription;
use crate::domain::models::user::{CatalogPreferences, User};
use crate::domain::models::user_activity::{
    ClientInfo, DailyStats, LearningStats, UserActivityStats,
};
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn get_user_by_email(&self, email: &str) -> Result<Option<User>>;
    async fn upsert_user(&self, user: User) -> Result<User>;
    async fn set_onboarding_completed(&self, email: &str, completed: bool) -> Result<Option<User>>;
    async fn update_study_language(
        &self,
        email: &str,
        study_language: &str,
    ) -> Result<Option<User>>;
    async fn update_catalog_preferences(
        &self,
        email: &str,
        preferences: Option<CatalogPreferences>,
    ) -> Result<Option<User>>;
    async fn reset_all_catalog_preferences(&self) -> Result<u64>;
    async fn list_all_users(&self) -> Result<Vec<User>>;
}

#[async_trait]
pub trait UserActivityRepository: Send + Sync {
    async fn increment_visit_count(&self, email: &str) -> Result<()>;
    async fn add_session_duration(&self, email: &str, secs: i64) -> Result<()>;
    async fn get_stats(&self, email: &str) -> Result<UserActivityStats>;
    async fn get_all_stats(&self) -> Result<Vec<UserActivityStats>>;
    async fn update_last_client(&self, email: &str, client: &ClientInfo) -> Result<()>;
    async fn update_last_location(
        &self,
        email: &str,
        ip: Option<&str>,
        country: Option<&str>,
    ) -> Result<()>;
    async fn record_study_day(&self, email: &str) -> Result<()>;
    async fn get_learning_stats(
        &self,
        email: &str,
        mastered_count: i32,
        target_count: i32,
    ) -> Result<LearningStats>;
}

#[async_trait]
pub trait DailyStatsRepository: Send + Sync {
    /// Sobrescribe (o crea) el snapshot del día indicado en `stats.date`.
    async fn upsert_daily_stats(&self, stats: DailyStats) -> Result<()>;
    /// Últimos `days` snapshots, ordenados cronológicamente (más antiguo primero).
    async fn list_daily_stats(&self, days: usize) -> Result<Vec<DailyStats>>;
}

#[async_trait]
pub trait SubscriptionRepository: Send + Sync {
    async fn get_subscription(&self, email: &str) -> Result<Option<Subscription>>;
    async fn upsert_subscription(&self, sub: Subscription) -> Result<Subscription>;
    async fn list_subscriptions(&self, limit: usize, offset: usize) -> Result<Vec<Subscription>>;
    async fn cancel_subscription(&self, email: &str) -> Result<()>;
    async fn bulk_expire_subscriptions(&self) -> Result<usize>;
}

#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait CardProgressRepository: Send + Sync {
    async fn upsert_card_progress(
        &self,
        user_id: &str,
        category: &str,
        deck: &str,
        card_index: i32,
        learned: bool,
    ) -> Result<()>;
    async fn get_learned_cards(
        &self,
        user_id: &str,
        category: &str,
        deck: &str,
    ) -> Result<Vec<i32>>;
    async fn reset_card_progress(&self, user_id: &str, category: &str, deck: &str) -> Result<()>;
    async fn reset_category_progress(&self, user_id: &str, category: &str) -> Result<()>;
    async fn count_learned_cards(&self, user_id: &str) -> Result<i32>;
    async fn count_learned_cards_by_deck_prefix(
        &self,
        user_id: &str,
        deck_prefix: &str,
    ) -> Result<i32>;
    async fn count_learned_cards_by_category(
        &self,
        user_id: &str,
        category: &str,
    ) -> Result<std::collections::HashMap<String, usize>>;
    async fn get_all_learned_cards(
        &self,
        user_id: &str,
    ) -> Result<Vec<(String, String, i32, Option<chrono::DateTime<chrono::Utc>>)>>;

    /// Guarda el estado de múltiples tarjetas en una sola operación.
    /// Reduce N peticiones HTTP a 1 cuando el frontend hace flush del lote.
    async fn upsert_cards_batch(
        &self,
        user_id: &str,
        category: &str,
        deck: &str,
        cards: &[CardProgressUpdate],
    ) -> Result<()>;

    /// Devuelve solo coordenadas y estado SRS. No calcula urgencia ni arma decks.
    async fn get_srs_review_candidates(
        &self,
        user_id: &str,
        category_prefix: &str,
        now: chrono::DateTime<chrono::Utc>,
        limit: usize,
    ) -> Result<Vec<SrsReviewCandidate>>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn card_progress_port_supports_isolated_mocks() {
        let mut repository = MockCardProgressRepository::new();
        repository
            .expect_count_learned_cards()
            .with(mockall::predicate::eq("local-test-user"))
            .times(1)
            .returning(|_| Ok(7));

        let learned = repository
            .count_learned_cards("local-test-user")
            .await
            .expect("mocked port should return its configured value");

        assert_eq!(learned, 7);
    }
}

#[async_trait]
pub trait DemoFeedbackRepository: Send + Sync {
    async fn add_feedback(&self, feedback: DemoFeedback) -> Result<()>;
    /// Ya ordenado (más reciente primero) y limitado en la query: el GET es público, sin auth,
    /// y no debe traer la tabla completa a memoria en cada carga del landing.
    async fn list_feedback(&self, limit: usize) -> Result<Vec<DemoFeedback>>;
    /// Promedio de rating y conteo total, agregados en SurrealDB (`GROUP ALL`) — no transfiere
    /// filas a Rust, solo el resultado ya calculado.
    async fn feedback_summary(&self) -> Result<(f64, u32)>;
}

#[async_trait]
pub trait PronounPracticeRepository: Send + Sync {
    async fn log_user_error(
        &self,
        user_id: &str,
        story_id: i32,
        screen_id: i32,
        user_input: &str,
        correct_answer: &str,
        error_type: &str,
        explanation: &str,
    ) -> Result<()>;

    async fn get_progress(&self, user_id: &str, story_id: i32) -> Result<Option<UserProgress>>;
    async fn create_progress(
        &self,
        user_id: &str,
        story_id: i32,
        episode_id: i32,
    ) -> Result<UserProgress>;
    async fn update_progress(&self, update: ProgressUpdate) -> Result<UserProgress>;
    async fn reset_progress(&self, user_id: &str, story_id: i32) -> Result<()>;

    async fn get_story_title(&self, story_id: i32) -> Result<String>;
    async fn get_episode_title(&self, episode_id: i32) -> Result<String>;
    async fn get_first_episode_id(&self, story_id: i32) -> Result<i32>;
    async fn get_next_episode_id(&self, current_episode_id: i32) -> Result<Option<i32>>;

    async fn get_episode_screens(&self, episode_id: i32) -> Result<Vec<StoryScreen>>;
    async fn update_screen_content(&self, screen_id: i32, content: serde_json::Value)
        -> Result<()>;
    async fn get_story_full_history(&self, story_id: i32) -> Result<serde_json::Value>;
    async fn get_episodes_by_story(&self, story_id: i32) -> Result<Vec<(i32, String)>>;
}
