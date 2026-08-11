use crate::api::dto::pronoun_practice::UpdateProgressRequest;
use crate::api::mappers::pronoun_practice::to_progress_update;
use crate::api::middleware::auth::extract_claims;
use crate::AppState;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct ProgressQuery {
    pub user_id: String,
    pub story_id: i32,
}

pub async fn get_progress(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<ProgressQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != query.user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "No autorizado para ver el progreso de otro usuario".to_string(),
        ));
    }
    match state
        .pronoun_practice_use_cases
        .get_progress(&query.user_id, query.story_id)
        .await
    {
        Ok(res) => Ok((StatusCode::OK, Json(res)).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_episode_screens(
    State(state): State<AppState>,
    Path(episode_id): Path<i32>,
) -> impl IntoResponse {
    match state
        .pronoun_practice_use_cases
        .get_episode_screens(episode_id)
        .await
    {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn update_progress(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<UpdateProgressRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let update = to_progress_update(payload);
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != update.user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "No autorizado para modificar el progreso de otro usuario".to_string(),
        ));
    }
    match state
        .pronoun_practice_use_cases
        .update_progress(update)
        .await
    {
        Ok(res) => Ok((StatusCode::OK, Json(res)).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_next_episode(
    State(state): State<AppState>,
    Path(episode_id): Path<i32>,
) -> impl IntoResponse {
    match state
        .pronoun_practice_use_cases
        .get_next_episode_id(episode_id)
        .await
    {
        Ok(next_id) => (
            StatusCode::OK,
            Json(serde_json::json!({ "next_episode_id": next_id })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_story_full_history(
    State(state): State<AppState>,
    Path(story_id): Path<i32>,
) -> impl IntoResponse {
    match state
        .pronoun_practice_use_cases
        .get_story_full_history(story_id)
        .await
    {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn reset_progress(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<ProgressQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != query.user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "No autorizado para modificar el progreso de otro usuario".to_string(),
        ));
    }
    match state
        .pronoun_practice_use_cases
        .reset_progress(&query.user_id, query.story_id)
        .await
    {
        Ok(_) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "message": "Progress reset successfully" })),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}
