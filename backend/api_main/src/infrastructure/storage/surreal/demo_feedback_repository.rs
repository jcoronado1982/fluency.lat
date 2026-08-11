use super::connection::SurrealConnection;
use crate::domain::models::feedback::DemoFeedback;
use crate::domain::repositories::db_repository::DemoFeedbackRepository;
use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;
use surrealdb::types::{SerdeWrapper, SurrealValue};

pub struct SurrealDemoFeedbackRepository(pub Arc<SurrealConnection>);

#[derive(SurrealValue)]
struct FeedbackSummaryRow {
    total: u32,
    avg_rating: Option<f64>,
}

#[async_trait]
impl DemoFeedbackRepository for SurrealDemoFeedbackRepository {
    async fn add_feedback(&self, feedback: DemoFeedback) -> Result<()> {
        self.0
            .db()
            .query("CREATE demo_feedback CONTENT $data")
            .bind(("data", SerdeWrapper(feedback)))
            .await?;
        Ok(())
    }

    async fn list_feedback(&self, limit: usize) -> Result<Vec<DemoFeedback>> {
        let mut res = self
            .0
            .db()
            .query("SELECT * FROM demo_feedback ORDER BY created_at DESC LIMIT $limit")
            .bind(("limit", i64::try_from(limit).unwrap_or(50)))
            .await?;
        let rows: Vec<SerdeWrapper<DemoFeedback>> = res.take(0)?;
        Ok(rows.into_iter().map(|w| w.0).collect())
    }

    async fn feedback_summary(&self) -> Result<(f64, u32)> {
        let mut res = self
            .0
            .db()
            .query(
                "SELECT count() AS total, math::mean(rating) AS avg_rating \
                 FROM demo_feedback GROUP ALL",
            )
            .await?;
        let row: Option<FeedbackSummaryRow> = res.take(0)?;
        Ok(match row {
            Some(r) => (
                ((r.avg_rating.unwrap_or(0.0)) * 10.0).round() / 10.0,
                r.total,
            ),
            None => (0.0, 0),
        })
    }
}
