use crate::domain::models::feedback::DemoFeedback;
use crate::domain::models::srs::{CardProgressUpdate, SrsReviewCandidate};
use crate::domain::models::story::{ProgressUpdate, StoryScreen, UserProgress};
use crate::domain::models::subscription::Subscription;
use crate::domain::models::user::{CatalogPreferences, User};
use crate::domain::models::user_activity::{
    build_learning_stats, ClientInfo, DailyStats, LearningStats, UserActivityStats,
};
use crate::domain::repositories::db_repository::{
    CardProgressRepository, DailyStatsRepository, DemoFeedbackRepository,
    PronounPracticeRepository, SubscriptionRepository, UserActivityRepository, UserRepository,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;

/// No-op DB repository used when SurrealDB is not available (e.g. Cloud Run overflow).
/// Flashcard reads/writes still work (they use StorageRepository). Pronoun practice and auth
/// return errors gracefully instead of crashing the process.
pub struct NullDbRepository;

#[async_trait]
impl PronounPracticeRepository for NullDbRepository {
    async fn log_user_error(
        &self,
        _user_id: &str,
        _story_id: i32,
        _screen_id: i32,
        _user_input: &str,
        _correct_answer: &str,
        _error_type: &str,
        _explanation: &str,
    ) -> Result<()> {
        Ok(())
    }

    async fn get_progress(&self, _user_id: &str, _story_id: i32) -> Result<Option<UserProgress>> {
        Ok(None)
    }

    async fn create_progress(
        &self,
        _user_id: &str,
        _story_id: i32,
        _episode_id: i32,
    ) -> Result<UserProgress> {
        Err(anyhow!("DB no disponible en este entorno"))
    }

    async fn update_progress(&self, _update: ProgressUpdate) -> Result<UserProgress> {
        Err(anyhow!("DB no disponible en este entorno"))
    }

    async fn reset_progress(&self, _user_id: &str, _story_id: i32) -> Result<()> {
        Ok(())
    }

    async fn get_story_title(&self, story_id: i32) -> Result<String> {
        Ok(format!("Story {}", story_id))
    }

    async fn get_episode_title(&self, episode_id: i32) -> Result<String> {
        Ok(format!("Episode {}", episode_id))
    }

    async fn get_first_episode_id(&self, _story_id: i32) -> Result<i32> {
        Err(anyhow!("DB no disponible en este entorno"))
    }

    async fn get_next_episode_id(&self, _current_episode_id: i32) -> Result<Option<i32>> {
        Ok(None)
    }

    async fn get_episode_screens(&self, _episode_id: i32) -> Result<Vec<StoryScreen>> {
        Ok(vec![])
    }

    async fn update_screen_content(
        &self,
        _screen_id: i32,
        _content: serde_json::Value,
    ) -> Result<()> {
        Ok(())
    }

    async fn get_story_full_history(&self, _story_id: i32) -> Result<serde_json::Value> {
        Ok(serde_json::json!([]))
    }

    async fn get_episodes_by_story(&self, _story_id: i32) -> Result<Vec<(i32, String)>> {
        Ok(vec![])
    }
}

#[async_trait]
impl CardProgressRepository for NullDbRepository {
    async fn upsert_card_progress(
        &self,
        _user_id: &str,
        _category: &str,
        _deck: &str,
        _card_index: i32,
        _learned: bool,
    ) -> Result<()> {
        Ok(())
    }

    async fn get_learned_cards(
        &self,
        _user_id: &str,
        _category: &str,
        _deck: &str,
    ) -> Result<Vec<i32>> {
        Ok(vec![])
    }

    async fn reset_card_progress(
        &self,
        _user_id: &str,
        _category: &str,
        _deck: &str,
    ) -> Result<()> {
        Ok(())
    }

    async fn reset_category_progress(&self, _user_id: &str, _category: &str) -> Result<()> {
        Ok(())
    }

    async fn count_learned_cards(&self, _user_id: &str) -> Result<i32> {
        Ok(0)
    }

    async fn count_learned_cards_by_deck_prefix(
        &self,
        _user_id: &str,
        _deck_prefix: &str,
    ) -> Result<i32> {
        Ok(0)
    }

    async fn count_learned_cards_by_category(
        &self,
        _user_id: &str,
        _category: &str,
    ) -> Result<std::collections::HashMap<String, usize>> {
        Ok(std::collections::HashMap::new())
    }

    async fn get_all_learned_cards(
        &self,
        _user_id: &str,
    ) -> Result<Vec<(String, String, i32, Option<chrono::DateTime<chrono::Utc>>)>> {
        Ok(Vec::new())
    }

    async fn upsert_cards_batch(
        &self,
        _user_id: &str,
        _category: &str,
        _deck: &str,
        _cards: &[CardProgressUpdate],
    ) -> Result<()> {
        Ok(())
    }

    async fn get_srs_review_candidates(
        &self,
        _user_id: &str,
        _category_prefix: &str,
        _now: chrono::DateTime<chrono::Utc>,
        _limit: usize,
    ) -> Result<Vec<SrsReviewCandidate>> {
        Ok(Vec::new())
    }
}

#[async_trait]
impl UserRepository for NullDbRepository {
    async fn get_user_by_email(&self, _email: &str) -> Result<Option<User>> {
        Ok(None)
    }

    async fn upsert_user(&self, _user: User) -> Result<User> {
        Err(anyhow!(
            "Autenticación no disponible: DB no configurada en este entorno"
        ))
    }

    async fn set_onboarding_completed(
        &self,
        _email: &str,
        _completed: bool,
    ) -> Result<Option<User>> {
        Err(anyhow!(
            "Autenticación no disponible: DB no configurada en este entorno"
        ))
    }

    async fn update_catalog_preferences(
        &self,
        _email: &str,
        _preferences: Option<CatalogPreferences>,
    ) -> Result<Option<User>> {
        Err(anyhow!(
            "Preferencias no disponibles: DB no configurada en este entorno"
        ))
    }

    async fn update_study_language(
        &self,
        _email: &str,
        _study_language: &str,
    ) -> Result<Option<User>> {
        Err(anyhow!(
            "Preferencias no disponibles: DB no configurada en este entorno"
        ))
    }

    async fn reset_all_catalog_preferences(&self) -> Result<u64> {
        Ok(0)
    }

    async fn list_all_users(&self) -> Result<Vec<User>> {
        Ok(vec![])
    }
}

#[async_trait]
impl UserActivityRepository for NullDbRepository {
    async fn increment_visit_count(&self, _email: &str) -> Result<()> {
        Ok(())
    }

    async fn add_session_duration(&self, _email: &str, _secs: i64) -> Result<()> {
        Ok(())
    }

    async fn get_stats(&self, email: &str) -> Result<UserActivityStats> {
        Ok(UserActivityStats {
            email: email.to_string(),
            ..Default::default()
        })
    }

    async fn get_all_stats(&self) -> Result<Vec<UserActivityStats>> {
        Ok(vec![])
    }

    async fn update_last_client(&self, _email: &str, _client: &ClientInfo) -> Result<()> {
        Ok(())
    }

    async fn update_last_location(
        &self,
        _email: &str,
        _ip: Option<&str>,
        _country: Option<&str>,
    ) -> Result<()> {
        Ok(())
    }

    async fn record_study_day(&self, _email: &str) -> Result<()> {
        Ok(())
    }

    async fn get_learning_stats(
        &self,
        _email: &str,
        mastered_count: i32,
        target_count: i32,
    ) -> Result<LearningStats> {
        Ok(build_learning_stats(
            mastered_count,
            target_count,
            "B2",
            "A1",
            if target_count <= 0 {
                0
            } else {
                ((mastered_count as f64 / target_count as f64) * 100.0).round() as i32
            },
            Vec::new(),
            None,
            0,
            0,
            &chrono::Utc::now().format("%Y-%m-%d").to_string(),
            &(chrono::Utc::now() - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string(),
        ))
    }
}

#[async_trait]
impl DailyStatsRepository for NullDbRepository {
    async fn upsert_daily_stats(&self, _stats: DailyStats) -> Result<()> {
        Ok(())
    }

    async fn list_daily_stats(&self, _days: usize) -> Result<Vec<DailyStats>> {
        Ok(vec![])
    }
}

#[async_trait]
impl SubscriptionRepository for NullDbRepository {
    async fn get_subscription(&self, _email: &str) -> Result<Option<Subscription>> {
        Ok(None)
    }

    async fn upsert_subscription(&self, _sub: Subscription) -> Result<Subscription> {
        Err(anyhow!("DB no disponible en este entorno"))
    }

    async fn list_subscriptions(&self, _limit: usize, _offset: usize) -> Result<Vec<Subscription>> {
        Ok(vec![])
    }

    async fn cancel_subscription(&self, _email: &str) -> Result<()> {
        Ok(())
    }

    async fn bulk_expire_subscriptions(&self) -> Result<usize> {
        Ok(0)
    }
}

#[async_trait]
impl DemoFeedbackRepository for NullDbRepository {
    async fn add_feedback(&self, _feedback: DemoFeedback) -> Result<()> {
        Err(anyhow!("DB no disponible en este entorno"))
    }

    async fn list_feedback(&self, _limit: usize) -> Result<Vec<DemoFeedback>> {
        Ok(vec![])
    }

    async fn feedback_summary(&self) -> Result<(f64, u32)> {
        Ok((0.0, 0))
    }
}

#[cfg(test)]
mod tests {
    //! `NullDbRepository` es el Null Object (LSP) que mantiene la app arrancando sin SurrealDB
    //! (ver docs/ARQUITECTURA_MODULAR.md §8). Estos tests fijan su contrato: nunca debe entrar en
    //! pánico, y debe degradar cada operación a un valor vacío/por-defecto o a un error explícito
    //! y descriptivo — nunca silencioso ni ambiguo.
    use super::*;
    use crate::domain::models::user::User;
    use chrono::Utc;

    fn repo() -> NullDbRepository {
        NullDbRepository
    }

    fn sample_user() -> User {
        User {
            id: None,
            email: "guest@local.dev".to_string(),
            name: "Guest".to_string(),
            picture: None,
            role: "admin".to_string(),
            onboarding_completed: true,
            study_language: None,
            catalog_preferences: None,
            created_at: Utc::now(),
            last_login: Utc::now(),
        }
    }

    #[tokio::test]
    async fn pronoun_practice_reads_degrade_to_empty_and_writes_fail_explicitly() {
        let repo = repo();
        assert!(repo.get_progress("guest", 1).await.unwrap().is_none());
        assert_eq!(repo.get_next_episode_id(1).await.unwrap(), None);
        assert!(repo.get_episode_screens(1).await.unwrap().is_empty());
        assert_eq!(repo.get_episodes_by_story(1).await.unwrap(), vec![]);
        assert_eq!(repo.reset_progress("guest", 1).await.unwrap(), ());
        assert_eq!(repo.get_story_title(7).await.unwrap(), "Story 7");
        assert_eq!(repo.get_episode_title(7).await.unwrap(), "Episode 7");

        assert!(repo.create_progress("guest", 1, 1).await.is_err());
        assert!(repo
            .update_progress(ProgressUpdate {
                user_id: "guest".to_string(),
                story_id: 1,
                current_episode_id: 1,
                current_step_order: 0,
                score_increment: 0,
                status: "in_progress".to_string(),
            })
            .await
            .is_err());
        assert!(repo.get_first_episode_id(1).await.is_err());
    }

    #[tokio::test]
    async fn card_progress_reads_are_empty_and_writes_are_ok() {
        let repo = repo();
        assert_eq!(
            repo.get_learned_cards("guest", "verbs", "1-basic")
                .await
                .unwrap(),
            Vec::<i32>::new()
        );
        assert_eq!(repo.count_learned_cards("guest").await.unwrap(), 0);
        assert_eq!(
            repo.count_learned_cards_by_deck_prefix("guest", "1-basic")
                .await
                .unwrap(),
            0
        );
        assert!(repo
            .count_learned_cards_by_category("guest", "verbs")
            .await
            .unwrap()
            .is_empty());
        assert!(repo
            .get_all_learned_cards("guest")
            .await
            .unwrap()
            .is_empty());
        assert!(repo
            .get_srs_review_candidates("guest", "1-basic", Utc::now(), 20)
            .await
            .unwrap()
            .is_empty());

        assert!(repo
            .upsert_card_progress("guest", "verbs", "1-basic", 0, true)
            .await
            .is_ok());
        assert!(repo
            .reset_card_progress("guest", "verbs", "1-basic")
            .await
            .is_ok());
        assert!(repo.reset_category_progress("guest", "verbs").await.is_ok());
        assert!(repo
            .upsert_cards_batch("guest", "verbs", "1-basic", &[])
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn user_repository_reads_are_none_and_auth_writes_fail_explicitly() {
        let repo = repo();
        assert!(repo
            .get_user_by_email("guest@local.dev")
            .await
            .unwrap()
            .is_none());
        assert!(repo.list_all_users().await.unwrap().is_empty());
        assert_eq!(repo.reset_all_catalog_preferences().await.unwrap(), 0);

        let auth_err = repo.upsert_user(sample_user()).await.unwrap_err();
        assert!(auth_err.to_string().contains("Autenticación no disponible"));
        assert!(repo
            .set_onboarding_completed("guest@local.dev", true)
            .await
            .is_err());
        assert!(repo
            .update_catalog_preferences("guest@local.dev", None)
            .await
            .is_err());
        assert!(repo
            .update_study_language("guest@local.dev", "en")
            .await
            .is_err());
    }

    #[tokio::test]
    async fn user_activity_never_panics_and_get_stats_echoes_the_requested_email() {
        let repo = repo();
        assert!(repo.increment_visit_count("guest@local.dev").await.is_ok());
        assert!(repo
            .add_session_duration("guest@local.dev", 30)
            .await
            .is_ok());
        assert!(repo.record_study_day("guest@local.dev").await.is_ok());
        assert!(repo
            .update_last_client("guest@local.dev", &ClientInfo::default())
            .await
            .is_ok());
        assert!(repo
            .update_last_location("guest@local.dev", Some("127.0.0.1"), Some("CL"))
            .await
            .is_ok());
        assert!(repo.get_all_stats().await.unwrap().is_empty());

        let stats = repo.get_stats("guest@local.dev").await.unwrap();
        assert_eq!(stats.email, "guest@local.dev");

        let learning = repo
            .get_learning_stats("guest@local.dev", 50, 100)
            .await
            .unwrap();
        assert_eq!(learning.level_percent, 50);
    }

    #[tokio::test]
    async fn daily_stats_and_subscriptions_and_demo_feedback_degrade_without_panicking() {
        let repo = repo();
        assert!(repo
            .upsert_daily_stats(DailyStats {
                date: "2026-07-26".to_string(),
                dau: 0,
                new_signups: 0,
                total_users: 0,
                retained_7d: 0,
            })
            .await
            .is_ok());
        assert!(repo.list_daily_stats(7).await.unwrap().is_empty());

        assert!(repo
            .get_subscription("guest@local.dev")
            .await
            .unwrap()
            .is_none());
        assert!(repo.list_subscriptions(10, 0).await.unwrap().is_empty());
        assert!(repo.cancel_subscription("guest@local.dev").await.is_ok());
        assert_eq!(repo.bulk_expire_subscriptions().await.unwrap(), 0);
        assert!(repo
            .upsert_subscription(Subscription {
                user_email: "guest@local.dev".to_string(),
                plan: "premium".to_string(),
                status: "active".to_string(),
                starts_at: Utc::now(),
                expires_at: Utc::now(),
                payment_provider: None,
                external_customer_id: None,
                external_subscription_id: None,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            })
            .await
            .is_err());

        assert!(repo.list_feedback(20).await.unwrap().is_empty());
        assert_eq!(repo.feedback_summary().await.unwrap(), (0.0, 0));
        assert!(repo
            .add_feedback(DemoFeedback {
                created_at: Utc::now(),
                user_email: "guest@local.dev".to_string(),
                user_name: "Guest".to_string(),
                comment: "hola".to_string(),
                rating: 5,
                language: None,
                source: None,
                picture: None,
                country: None,
                user_handle: None,
            })
            .await
            .is_err());
    }
}
