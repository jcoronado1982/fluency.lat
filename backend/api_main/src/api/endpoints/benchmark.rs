use crate::AppState;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use mod_shell::demo_feedback_use_cases::DemoFeedbackSubmission;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Default)]
pub struct DbBenchmarkPayload {
    #[serde(default)]
    pub tag: Option<String>,
}

#[derive(Serialize)]
pub struct DbBenchmarkResponse {
    pub status: &'static str,
    pub write_persisted: bool,
    pub read_count: u32,
    pub total_records: usize,
}

pub async fn db_cycle(
    State(state): State<AppState>,
    Json(payload): Json<DbBenchmarkPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let tag = payload
        .tag
        .unwrap_or_else(|| "benchmark_vu".to_string());

    let timestamp_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    let submission = DemoFeedbackSubmission {
        user_email: format!("benchmark_{timestamp_id}@fluency.lat"),
        user_name: "LoadTest VU".to_string(),
        comment: format!("Ciclo de prueba DB {tag}"),
        rating: 5,
        language: Some("es".to_string()),
        source: Some("load_test_k6".to_string()),
        picture: None,
        country: Some("US".to_string()),
        user_handle: Some("@loadtest".to_string()),
    };

    // 1. ESCRITURA EN SURREALDB
    let stored_records = state
        .demo_feedback_use_cases
        .submit(submission)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Error al escribir en SurrealDB: {e}"),
            )
        })?;

    // 2. LECTURA DESDE SURREALDB
    let list_result = state
        .demo_feedback_use_cases
        .list(5)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Error al leer desde SurrealDB: {e}"),
            )
        })?;

    Ok(Json(DbBenchmarkResponse {
        status: "ok",
        write_persisted: true,
        read_count: list_result.summary.count,
        total_records: stored_records,
    }))
}
