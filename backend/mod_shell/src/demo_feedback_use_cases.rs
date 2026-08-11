use anyhow::Result;
use chrono::Utc;
use fluency_core::domain::models::feedback::DemoFeedback;
use fluency_core::ports::db_repository::DemoFeedbackRepository;
use std::sync::Arc;

pub struct DemoFeedbackSubmission {
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

pub struct DemoFeedbackSummary {
    pub average: f64,
    pub count: u32,
}

pub struct DemoFeedbackListResult {
    pub summary: DemoFeedbackSummary,
    pub reviews: Vec<DemoFeedback>,
}

pub struct DemoFeedbackUseCases {
    repository: Arc<dyn DemoFeedbackRepository>,
}

impl DemoFeedbackUseCases {
    pub fn new(repository: Arc<dyn DemoFeedbackRepository>) -> Self {
        Self { repository }
    }

    pub fn validate_comment(raw: &str) -> Result<&str, String> {
        let comment = raw.trim();
        if comment.is_empty() {
            return Err("El comentario está vacío".to_string());
        }
        if comment.chars().count() > 500 {
            return Err("El comentario supera 500 caracteres".to_string());
        }
        Ok(comment)
    }

    pub fn validate_rating(rating: u8) -> Result<(), String> {
        if !(1..=5).contains(&rating) {
            return Err("La calificación debe ser entre 1 y 5 estrellas".to_string());
        }
        Ok(())
    }

    /// El comentario ya pasó por `validate_comment` (nunca vacío), así que el conteo
    /// del resumen agregado en la DB refleja exactamente lo que hay guardado.
    pub async fn submit(&self, submission: DemoFeedbackSubmission) -> Result<usize> {
        let feedback = DemoFeedback {
            created_at: Utc::now(),
            user_email: submission.user_email,
            user_name: submission.user_name,
            comment: submission.comment,
            rating: submission.rating,
            language: submission.language,
            source: submission.source,
            picture: submission.picture,
            country: submission.country,
            user_handle: submission.user_handle,
        };
        self.repository.add_feedback(feedback).await?;
        let (_, count) = self.repository.feedback_summary().await?;
        Ok(count as usize)
    }

    /// `limit` acota solo las reseñas devueltas (ya ordenadas y limitadas en la query, el
    /// GET es público y sin auth); el resumen (promedio/conteo) se agrega en SurrealDB sobre
    /// el conjunto completo, sin traer todas las filas a memoria.
    pub async fn list(&self, limit: usize) -> Result<DemoFeedbackListResult> {
        let limit = limit.clamp(1, 50);
        let reviews = self.repository.list_feedback(limit).await?;
        let (average, count) = self.repository.feedback_summary().await?;

        Ok(DemoFeedbackListResult {
            summary: DemoFeedbackSummary { average, count },
            reviews,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(
        created_at: &str,
        name: &str,
        email: &str,
        comment: &str,
        rating: u8,
    ) -> DemoFeedback {
        DemoFeedback {
            created_at: created_at.parse().expect("valid rfc3339 fixture"),
            user_email: email.to_string(),
            user_name: name.to_string(),
            comment: comment.to_string(),
            rating,
            language: Some("es".to_string()),
            source: Some("landing-demo".to_string()),
            picture: None,
            country: None,
            user_handle: None,
        }
    }

    /// Simula el comportamiento de la query real: ordena por `created_at` DESC y limita,
    /// igual que hace `ORDER BY created_at DESC LIMIT $limit` en SurrealDB.
    struct FakeRepository {
        records: Vec<DemoFeedback>,
    }

    #[async_trait::async_trait]
    impl DemoFeedbackRepository for FakeRepository {
        async fn add_feedback(&self, _feedback: DemoFeedback) -> Result<()> {
            Ok(())
        }

        async fn list_feedback(&self, limit: usize) -> Result<Vec<DemoFeedback>> {
            let mut records = self.records.clone();
            records.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            records.truncate(limit);
            Ok(records)
        }

        async fn feedback_summary(&self) -> Result<(f64, u32)> {
            let count = self.records.len() as u32;
            if count == 0 {
                return Ok((0.0, 0));
            }
            let sum: u32 = self.records.iter().map(|r| u32::from(r.rating)).sum();
            let average = ((sum as f64 / f64::from(count)) * 10.0).round() / 10.0;
            Ok((average, count))
        }
    }

    #[test]
    fn comment_validation_trims_and_counts_unicode_characters() {
        assert_eq!(
            DemoFeedbackUseCases::validate_comment("  excelente  ").unwrap(),
            "excelente"
        );
        assert!(DemoFeedbackUseCases::validate_comment(&"á".repeat(500)).is_ok());
        assert!(DemoFeedbackUseCases::validate_comment(&"á".repeat(501)).is_err());
        assert!(DemoFeedbackUseCases::validate_comment(" \n\t ").is_err());
    }

    #[test]
    fn rating_accepts_only_one_through_five() {
        for rating in 1..=5 {
            assert!(DemoFeedbackUseCases::validate_rating(rating).is_ok());
        }
        assert!(DemoFeedbackUseCases::validate_rating(0).is_err());
        assert!(DemoFeedbackUseCases::validate_rating(6).is_err());
    }

    #[tokio::test]
    async fn feedback_list_sorts_limits_and_summarizes_over_the_full_set() {
        let repo = Arc::new(FakeRepository {
            records: vec![
                record("2026-01-01T00:00:00Z", "Old", "old@example.com", "Bien", 4),
                record(
                    "2026-01-03T00:00:00Z",
                    "Newest",
                    "new@example.com",
                    "Excelente",
                    5,
                ),
                record(
                    "2025-12-31T00:00:00Z",
                    "Legacy",
                    "legacy@example.com",
                    "Útil",
                    5,
                ),
            ],
        });
        let use_cases = DemoFeedbackUseCases::new(repo);

        let result = use_cases.list(2).await.expect("list succeeds");

        assert_eq!(result.summary.count, 3);
        assert_eq!(result.summary.average, 4.7);
        assert_eq!(result.reviews.len(), 2);
        assert_eq!(result.reviews[0].user_name, "Newest");
        assert_eq!(result.reviews[1].user_name, "Old");
    }

    #[tokio::test]
    async fn feedback_list_empty_and_limit_edges_are_stable() {
        let empty_repo = Arc::new(FakeRepository { records: vec![] });
        let empty = DemoFeedbackUseCases::new(empty_repo)
            .list(0)
            .await
            .expect("list succeeds");
        assert_eq!(empty.summary.count, 0);
        assert_eq!(empty.summary.average, 0.0);
        assert!(empty.reviews.is_empty());

        let many_repo = Arc::new(FakeRepository {
            records: (0..55)
                .map(|index| {
                    record(
                        &format!("2026-01-{day:02}T00:00:00Z", day = (index % 28) + 1),
                        "User",
                        "user@example.com",
                        "Comentario",
                        5,
                    )
                })
                .collect(),
        });
        let many = DemoFeedbackUseCases::new(many_repo)
            .list(usize::MAX)
            .await
            .expect("list succeeds");
        // `list()` acota el límite pedido a 50 antes de llamar al repositorio.
        assert_eq!(many.reviews.len(), 50);
    }
}
