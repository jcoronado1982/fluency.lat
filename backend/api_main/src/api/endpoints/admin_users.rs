use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

use crate::api::middleware::auth::{extract_claims, require_admin_role, resolve_effective_role};
use crate::AppState;

#[derive(Deserialize)]
pub struct PaginationQuery {
    #[serde(default = "default_page")]
    pub page: usize,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_page() -> usize {
    1
}
fn default_limit() -> usize {
    25
}

#[derive(Deserialize)]
pub struct DailyStatsQuery {
    #[serde(default = "default_days")]
    pub days: usize,
}

fn default_days() -> usize {
    30
}

/// GET /api/admin/users/activity?page=1&limit=25
/// Lista usuarios con estado online y estadísticas de uso (solo admin).
pub async fn list_users_activity(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(pagination): Query<PaginationQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_admin_role(&role)?;

    let result = state
        .presence_use_cases
        .get_admin_dashboard(pagination.page, pagination.limit)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(result))
}

/// GET /api/admin/users/countries
/// Cuenta usuarios registrados por país (solo admin).
pub async fn get_users_by_country(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_admin_role(&role)?;

    let result = state
        .presence_use_cases
        .get_country_stats()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(result))
}

/// GET /api/admin/stats/daily?days=30
/// Serie temporal de tracción: DAU, altas nuevas y total de usuarios por día (solo admin).
pub async fn get_daily_stats(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<DailyStatsQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_admin_role(&role)?;

    let result = state
        .daily_stats_use_cases
        .list_daily_stats(query.days)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(result))
}
