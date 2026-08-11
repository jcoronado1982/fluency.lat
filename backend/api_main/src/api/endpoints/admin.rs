use crate::api::middleware::auth::{extract_claims, require_admin_role, resolve_effective_role};
use crate::domain::models::subscription::SubscriptionPlan;
use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ActivateSubscriptionBody {
    pub email: String,
    pub plan: String,
}

#[derive(Deserialize)]
pub struct CancelSubscriptionBody {
    pub email: String,
}

#[derive(Deserialize)]
pub struct PaginationQuery {
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

fn default_limit() -> usize {
    50
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/// POST /api/admin/subscriptions/activate
/// Activa o renueva la suscripción de un usuario (admin only).
pub async fn activate_subscription(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<ActivateSubscriptionBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_admin_role(&role)?;

    let plan = body.plan.parse::<SubscriptionPlan>().map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            format!("Plan inválido: '{}'. Use 'monthly' o 'annual'", body.plan),
        )
    })?;

    let sub = state
        .subscription_use_cases
        .activate(&body.email, plan)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(sub))
}

/// POST /api/admin/subscriptions/cancel
/// Cancela la suscripción de un usuario (admin only).
pub async fn cancel_subscription(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<CancelSubscriptionBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_admin_role(&role)?;

    state
        .subscription_use_cases
        .cancel(&body.email)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/admin/subscriptions?limit=50&offset=0
/// Lista suscripciones paginadas (admin only). Máximo 100 por página.
pub async fn list_subscriptions(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(pagination): Query<PaginationQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_admin_role(&role)?;

    let subs = state
        .subscription_use_cases
        .list_all(pagination.limit, pagination.offset)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(subs))
}

/// GET /api/subscriptions/me
/// Devuelve la suscripción del usuario autenticado.
pub async fn get_my_subscription(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;

    let sub = state
        .subscription_use_cases
        .get(&claims.email)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(sub))
}
