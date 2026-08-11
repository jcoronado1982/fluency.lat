use super::connection::SurrealConnection;
use super::models::SurrealStoryScreen;
use crate::domain::models::story::{ProgressUpdate, StoryScreen, UserProgress};
use crate::domain::repositories::db_repository::PronounPracticeRepository;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use std::sync::Arc;
use surrealdb::types::SurrealValue;

pub struct SurrealPronounRepository(pub Arc<SurrealConnection>);

// derive(SurrealValue) directo (datetime nativo) en vez de SerdeWrapper: esta
// tabla se escribe tanto por CONTENT completo (create_progress) como por SET
// de campos individuales (update_progress, bind directo de `now`), y un bind
// individual de chrono::DateTime<Utc> siempre produce datetime nativo — nunca
// mezclar con SerdeWrapper sobre la struct completa, que esperaría string.
#[derive(SurrealValue)]
struct SurrealUserProgress {
    user_id: String,
    story_id: i32,
    current_episode_id: i32,
    current_step_order: i32,
    total_score: i32,
    status: String,
    last_updated: chrono::DateTime<chrono::Utc>,
}

impl From<SurrealUserProgress> for UserProgress {
    fn from(value: SurrealUserProgress) -> Self {
        UserProgress {
            user_id: value.user_id,
            story_id: value.story_id,
            current_episode_id: value.current_episode_id,
            current_step_order: value.current_step_order,
            total_score: value.total_score,
            status: value.status,
            last_updated: value.last_updated,
        }
    }
}

impl From<UserProgress> for SurrealUserProgress {
    fn from(value: UserProgress) -> Self {
        SurrealUserProgress {
            user_id: value.user_id,
            story_id: value.story_id,
            current_episode_id: value.current_episode_id,
            current_step_order: value.current_step_order,
            total_score: value.total_score,
            status: value.status,
            last_updated: value.last_updated,
        }
    }
}

fn safe_record_user_id(user_id: &str) -> String {
    user_id.replace('\\', "\\\\").replace('\'', "\\'").replace('"', "\\\"")
}

fn format_user_progress_id(user_id: &str, story_id: i32) -> String {
    format!("user_progress:['{}', {}]", safe_record_user_id(user_id), story_id)
}

#[async_trait]
impl PronounPracticeRepository for SurrealPronounRepository {
    async fn log_user_error(
        &self,
        user_id: &str,
        story_id: i32,
        screen_id: i32,
        user_input: &str,
        correct_answer: &str,
        error_type: &str,
        explanation: &str,
    ) -> Result<()> {
        let now = chrono::Utc::now();
        let id = format!(
            "user_errors:['{}', {}, {}]",
            safe_record_user_id(user_id),
            story_id,
            now.timestamp_micros()
        );

        self.0
            .db()
            .query(
                "UPSERT type::record($id) MERGE {
            user_id: $user_id,
            story_id: $story_id,
            screen_id: $screen_id,
            user_input: $user_input,
            correct_answer: $correct_answer,
            error_type: $error_type,
            explanation: $explanation,
            created_at: $created_at
        }",
            )
            .bind(("id", id))
            .bind(("user_id", user_id))
            .bind(("story_id", story_id))
            .bind(("screen_id", screen_id))
            .bind(("user_input", user_input))
            .bind(("correct_answer", correct_answer))
            .bind(("error_type", error_type))
            .bind(("explanation", explanation))
            .bind(("created_at", now))
            .await?;
        Ok(())
    }

    async fn get_progress(&self, user_id: &str, story_id: i32) -> Result<Option<UserProgress>> {
        let id = format_user_progress_id(user_id, story_id);
        let mut res = self
            .0
            .db()
            .query("SELECT * FROM type::record($id)")
            .bind(("id", id))
            .await?;
        let progress: Option<SurrealUserProgress> = res.take(0)?;
        Ok(progress.map(Into::into))
    }

    async fn create_progress(
        &self,
        user_id: &str,
        story_id: i32,
        episode_id: i32,
    ) -> Result<UserProgress> {
        let now = chrono::Utc::now();

        let progress = UserProgress {
            user_id: user_id.to_string(),
            story_id,
            current_episode_id: episode_id,
            current_step_order: 1,
            total_score: 0,
            status: "active".to_string(),
            last_updated: now,
        };

        let id = format_user_progress_id(user_id, story_id);
        let mut res = self
            .0
            .db()
            .query("UPSERT type::record($id) CONTENT $data RETURN AFTER")
            .bind(("id", id))
            .bind(("data", SurrealUserProgress::from(progress)))
            .await?;

        let result: Option<SurrealUserProgress> = res.take(0)?;
        result
            .map(Into::into)
            .ok_or_else(|| anyhow!("Failed to create/update progress"))
    }

    async fn update_progress(&self, update: ProgressUpdate) -> Result<UserProgress> {
        let id = format_user_progress_id(&update.user_id, update.story_id);
        let now = chrono::Utc::now();

        let mut res = self
            .0
            .db()
            .query(
                "
            UPDATE type::record($id)
            SET current_episode_id = $episode,
                current_step_order = $step,
                status = $status,
                total_score += $score_inc,
                last_updated = $now
            RETURN AFTER
        ",
            )
            .bind(("id", id))
            .bind(("episode", update.current_episode_id))
            .bind(("step", update.current_step_order))
            .bind(("status", update.status))
            .bind(("score_inc", update.score_increment))
            .bind(("now", now))
            .await?;

        let result: Option<SurrealUserProgress> = res.take(0)?;
        result
            .map(Into::into)
            .ok_or_else(|| anyhow!("Failed to update progress"))
    }

    async fn reset_progress(&self, user_id: &str, story_id: i32) -> Result<()> {
        let id = format_user_progress_id(user_id, story_id);
        self.0
            .db()
            .query("DELETE type::record($id)")
            .bind(("id", id))
            .await?;
        Ok(())
    }


    async fn get_story_title(&self, story_id: i32) -> Result<String> {
        let mut res = self
            .0
            .db()
            .query("SELECT title FROM stories WHERE story_id = $id")
            .bind(("id", story_id))
            .await?;
        let title: Option<String> = res.take("title")?;
        Ok(title.unwrap_or_else(|| format!("Story {}", story_id)))
    }

    async fn get_episode_title(&self, episode_id: i32) -> Result<String> {
        let mut res = self
            .0
            .db()
            .query("SELECT title FROM episodes WHERE episode_id = $id")
            .bind(("id", episode_id))
            .await?;
        let title: Option<String> = res.take("title")?;
        Ok(title.unwrap_or_else(|| format!("Episode {}", episode_id)))
    }

    async fn get_first_episode_id(&self, story_id: i32) -> Result<i32> {
        let mut res = self
            .0
            .db()
            .query("SELECT episode_id, episode_order FROM episodes WHERE story_id = $id ORDER BY episode_order ASC LIMIT 1")
            .bind(("id", story_id))
            .await?;
        let id: Option<i32> = res.take("episode_id")?;
        id.ok_or_else(|| anyhow!("No episodes found for story {}", story_id))
    }

    async fn get_next_episode_id(&self, current_episode_id: i32) -> Result<Option<i32>> {
        let mut res = self
            .0
            .db()
            .query(
                "
            let $curr = (SELECT story_id, episode_order FROM episodes WHERE episode_id = $id)[0];
            SELECT episode_id, episode_order FROM episodes 
            WHERE story_id = $curr.story_id AND episode_order > $curr.episode_order 
            ORDER BY episode_order ASC LIMIT 1
        ",
            )
            .bind(("id", current_episode_id))
            .await?;
        let id: Option<i32> = res.take("episode_id")?;
        Ok(id)
    }

    async fn get_episode_screens(&self, episode_id: i32) -> Result<Vec<StoryScreen>> {
        let mut response = self
            .0
            .db()
            .query("SELECT * FROM story_screens WHERE episode_id = $episode_id ORDER BY step_order ASC LIMIT 100")
            .bind(("episode_id", episode_id))
            .await?;
        let surreal_screens: Vec<SurrealStoryScreen> = response.take(0)?;
        Ok(surreal_screens.into_iter().map(Into::into).collect())
    }

    async fn update_screen_content(
        &self,
        screen_id: i32,
        content: serde_json::Value,
    ) -> Result<()> {
        let id = format!("story_screens:{}", screen_id);
        self.0
            .db()
            .query("UPDATE type::record($id) MERGE { content: $content }")
            .bind(("id", id))
            .bind(("content", content))
            .await?;
        Ok(())
    }

    async fn get_story_full_history(&self, story_id: i32) -> Result<serde_json::Value> {
        let mut ep_res = self
            .0
            .db()
            .query("SELECT episode_id, title, episode_order, episode_order as episode_number FROM episodes WHERE story_id = $id ORDER BY episode_order ASC")
            .bind(("id", story_id))
            .await?;
        let episodes: Vec<serde_json::Value> = ep_res.take(0)?;

        let mut scr_res = self
            .0
            .db()
            .query(
                "SELECT * FROM story_screens WHERE story_id = $id ORDER BY episode_id, step_order",
            )
            .bind(("id", story_id))
            .await?;
        let surreal_screens: Vec<SurrealStoryScreen> = scr_res.take(0)?;
        let screens: Vec<StoryScreen> = surreal_screens.into_iter().map(Into::into).collect();

        let mut full_history = Vec::new();
        for mut ep in episodes {
            let ep_id = ep["episode_id"].as_i64().unwrap_or(0) as i32;
            let mut ep_screens = Vec::new();
            for s in &screens {
                if s.episode_id == ep_id {
                    ep_screens.push(s.clone());
                }
            }
            if let Some(obj) = ep.as_object_mut() {
                obj.insert("id".to_string(), serde_json::json!(ep_id));
                obj.insert("screens".to_string(), serde_json::json!(ep_screens));
            }
            full_history.push(ep);
        }

        Ok(serde_json::json!(full_history))
    }

    async fn get_episodes_by_story(&self, story_id: i32) -> Result<Vec<(i32, String)>> {
        let mut res = self
            .0
            .db()
            .query("SELECT episode_id, title, episode_order FROM episodes WHERE story_id = $id ORDER BY episode_order ASC")
            .bind(("id", story_id))
            .await?;

        #[derive(SurrealValue)]
        struct EpRow {
            episode_id: i32,
            title: String,
        }
        let rows: Vec<EpRow> = res.take(0)?;
        Ok(rows.into_iter().map(|r| (r.episode_id, r.title)).collect())
    }
}
