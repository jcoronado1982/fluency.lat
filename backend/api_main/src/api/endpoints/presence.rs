use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::Deserialize;
use serde_json::json;

use crate::api::middleware::auth::extract_claims;
use crate::api::middleware::client_ip::{country_from_headers, extract_client_ip};
use crate::domain::models::user_activity::ClientInfo;
use crate::AppState;

#[derive(Deserialize, Default)]
pub struct HeartbeatBody {
    #[serde(default)]
    pub device_type: String,
    #[serde(default)]
    pub browser: String,
    #[serde(default)]
    pub os: String,
}

/// POST /api/presence/heartbeat
/// Mantiene la sesión activa del usuario autenticado.
pub async fn heartbeat(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    body: Option<Json<HeartbeatBody>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let client = body
        .map(|Json(b)| ClientInfo {
            device_type: normalize_field(&b.device_type, "unknown"),
            browser: normalize_field(&b.browser, "unknown"),
            os: normalize_field(&b.os, "unknown"),
        })
        .unwrap_or_default();

    let client_ip = extract_client_ip(&headers);
    let header_country = country_from_headers(&headers);

    state
        .presence_use_cases
        .heartbeat(
            &claims.email,
            &claims.name,
            None,
            client,
            client_ip,
            header_country,
        )
        .await;

    Ok(Json(json!({ "ok": true })))
}

fn normalize_field(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

/// POST /api/presence/leave
/// Cierra la sesión activa (logout o cierre de pestaña).
pub async fn leave(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;

    state.presence_use_cases.leave(&claims.email).await;

    Ok(Json(json!({ "ok": true })))
}
