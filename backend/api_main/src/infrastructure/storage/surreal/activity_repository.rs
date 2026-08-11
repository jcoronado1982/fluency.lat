use super::connection::SurrealConnection;
use super::models::SurrealUserActivityStats;
use crate::domain::models::user_activity::{
    build_learning_stats, ClientInfo, LearningStats, UserActivityStats,
};
use crate::domain::repositories::db_repository::UserActivityRepository;
use anyhow::Result;
use async_trait::async_trait;
use moka::future::Cache;
use std::sync::Arc;
use std::time::Duration;

pub struct SurrealUserActivityRepository {
    conn: Arc<SurrealConnection>,
    /// email → última fecha (YYYY-MM-DD) ya registrada en la DB.
    /// Sin este cache, cada batch de tarjetas dispara un read-modify-write
    /// contra Surreal aunque el día de estudio ya esté registrado.
    study_day_cache: Cache<String, String>,
}

impl SurrealUserActivityRepository {
    pub fn new(conn: Arc<SurrealConnection>) -> Self {
        Self {
            conn,
            study_day_cache: Cache::builder()
                .max_capacity(10_000)
                .time_to_live(Duration::from_secs(25 * 60 * 60))
                .build(),
        }
    }
    async fn write_activity_stats(&self, stats: &UserActivityStats) -> Result<()> {
        self.conn
            .db()
            .query(
                "UPSERT type::record('user_activity_stats', $email) CONTENT {
                    email: $email,
                    visit_count: $visit_count,
                    total_duration_secs: $total_duration_secs,
                    last_device_type: $last_device_type,
                    last_browser: $last_browser,
                    last_os: $last_os,
                    last_ip: $last_ip,
                    last_country: $last_country,
                    last_study_date: $last_study_date,
                    current_streak: $current_streak,
                    longest_streak: $longest_streak
                }",
            )
            .bind(("email", stats.email.clone()))
            .bind(("visit_count", stats.visit_count))
            .bind(("total_duration_secs", stats.total_duration_secs))
            .bind(("last_device_type", stats.last_device_type.clone()))
            .bind(("last_browser", stats.last_browser.clone()))
            .bind(("last_os", stats.last_os.clone()))
            .bind(("last_ip", stats.last_ip.clone()))
            .bind(("last_country", stats.last_country.clone()))
            .bind(("last_study_date", stats.last_study_date.clone()))
            .bind(("current_streak", stats.current_streak))
            .bind(("longest_streak", stats.longest_streak))
            .await?;
        Ok(())
    }

    fn map_activity_stats(row: SurrealUserActivityStats) -> UserActivityStats {
        UserActivityStats {
            email: row.email,
            visit_count: row.visit_count.unwrap_or(0),
            total_duration_secs: row.total_duration_secs.unwrap_or(0),
            last_device_type: row.last_device_type,
            last_browser: row.last_browser,
            last_os: row.last_os,
            last_ip: row.last_ip,
            last_country: row.last_country,
            last_study_date: row.last_study_date,
            current_streak: row.current_streak.unwrap_or(0),
            longest_streak: row.longest_streak.unwrap_or(0),
        }
    }

    fn today_utc() -> String {
        chrono::Utc::now().format("%Y-%m-%d").to_string()
    }

    fn yesterday_utc() -> String {
        (chrono::Utc::now() - chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string()
    }
}

#[async_trait]
impl UserActivityRepository for SurrealUserActivityRepository {
    async fn increment_visit_count(&self, email: &str) -> Result<()> {
        let mut existing = self.get_stats(email).await?;
        existing.visit_count += 1;
        self.write_activity_stats(&existing).await
    }

    async fn add_session_duration(&self, email: &str, secs: i64) -> Result<()> {
        let mut existing = self.get_stats(email).await?;
        existing.total_duration_secs += secs;
        self.write_activity_stats(&existing).await
    }

    async fn update_last_client(&self, email: &str, client: &ClientInfo) -> Result<()> {
        let mut existing = self.get_stats(email).await?;
        existing.last_device_type = Some(client.device_type.clone());
        existing.last_browser = Some(client.browser.clone());
        existing.last_os = Some(client.os.clone());
        self.write_activity_stats(&existing).await
    }

    async fn update_last_location(
        &self,
        email: &str,
        ip: Option<&str>,
        country: Option<&str>,
    ) -> Result<()> {
        let mut existing = self.get_stats(email).await?;
        if let Some(ip) = ip {
            existing.last_ip = Some(ip.to_string());
        }
        if let Some(country) = country {
            existing.last_country = Some(country.to_string());
        }
        self.write_activity_stats(&existing).await
    }

    async fn get_stats(&self, email: &str) -> Result<UserActivityStats> {
        let mut res = self
            .conn
            .db()
            .query("SELECT * FROM type::record('user_activity_stats', $email)")
            .bind(("email", email))
            .await?;
        let row: Option<SurrealUserActivityStats> = res.take(0)?;
        Ok(row
            .map(Self::map_activity_stats)
            .unwrap_or_else(|| UserActivityStats {
                email: email.to_string(),
                ..Default::default()
            }))
    }

    async fn get_all_stats(&self) -> Result<Vec<UserActivityStats>> {
        let mut res = self
            .conn
            .db()
            .query("SELECT * FROM user_activity_stats")
            .await?;
        let rows: Vec<SurrealUserActivityStats> = res.take(0)?;
        Ok(rows.into_iter().map(Self::map_activity_stats).collect())
    }

    async fn record_study_day(&self, email: &str) -> Result<()> {
        let today = Self::today_utc();

        // Camino caliente: se llama en cada batch de tarjetas, pero solo la
        // primera del día necesita tocar la DB.
        if self.study_day_cache.get(email).await.as_deref() == Some(today.as_str()) {
            return Ok(());
        }

        let yesterday = Self::yesterday_utc();
        let mut existing = self.get_stats(email).await?;

        if existing.last_study_date.as_deref() == Some(today.as_str()) {
            self.study_day_cache.insert(email.to_string(), today).await;
            return Ok(());
        }

        if existing.last_study_date.as_deref() == Some(yesterday.as_str()) {
            existing.current_streak = existing.current_streak.max(0) + 1;
        } else {
            existing.current_streak = 1;
        }

        if existing.current_streak > existing.longest_streak {
            existing.longest_streak = existing.current_streak;
        }
        existing.last_study_date = Some(today.clone());
        self.write_activity_stats(&existing).await?;
        self.study_day_cache.insert(email.to_string(), today).await;
        Ok(())
    }

    async fn get_learning_stats(
        &self,
        email: &str,
        mastered_count: i32,
        target_count: i32,
    ) -> Result<LearningStats> {
        let stats = self.get_stats(email).await?;
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
            stats.last_study_date.as_deref(),
            stats.current_streak,
            stats.longest_streak,
            &Self::today_utc(),
            &Self::yesterday_utc(),
        ))
    }
}
