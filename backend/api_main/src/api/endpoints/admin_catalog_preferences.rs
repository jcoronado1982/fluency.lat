use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};

use crate::api::middleware::auth::{extract_claims, require_admin_role, resolve_effective_role};
use crate::AppState;

/// POST /api/admin/catalog-preferences/reset
/// Limpia las preferencias de orden de catálogo para todos los usuarios.
pub async fn reset_all_catalog_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_admin_role(&role)?;

    let cleared = state
        .auth_use_cases
        .reset_all_catalog_preferences()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "cleared": cleared,
    })))
}
