use super::connection::SurrealConnection;
use crate::domain::models::user_activity::DailyStats;
use crate::domain::repositories::db_repository::DailyStatsRepository;
use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;
use surrealdb::types::SerdeWrapper;

pub struct SurrealDailyStatsRepository(pub Arc<SurrealConnection>);

#[async_trait]
impl DailyStatsRepository for SurrealDailyStatsRepository {
    async fn upsert_daily_stats(&self, stats: DailyStats) -> Result<()> {
        self.0
            .db()
            .query(
                "UPSERT type::record('daily_stats', $date) CONTENT {
                    date: $date,
                    dau: $dau,
                    new_signups: $new_signups,
                    total_users: $total_users,
                    retained_7d: $retained_7d
                }",
            )
            .bind(("date", stats.date))
            .bind(("dau", stats.dau))
            .bind(("new_signups", stats.new_signups))
            .bind(("total_users", stats.total_users))
            .bind(("retained_7d", stats.retained_7d))
            .await?;
        Ok(())
    }

    async fn list_daily_stats(&self, days: usize) -> Result<Vec<DailyStats>> {
        let mut res = self
            .0
            .db()
            .query(
                "SELECT date, dau, new_signups, total_users, retained_7d FROM daily_stats \
                 ORDER BY date DESC LIMIT $limit",
            )
            .bind(("limit", i64::try_from(days).unwrap_or(30)))
            .await?;
        let mut rows: Vec<SerdeWrapper<DailyStats>> = res.take(0)?;
        rows.reverse();
        Ok(rows.into_iter().map(|w| w.0).collect())
    }
}
