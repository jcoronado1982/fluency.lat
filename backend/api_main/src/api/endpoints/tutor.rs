use crate::api::middleware::auth::extract_claims;
use crate::domain::models::onboarding::OnboardingGuideRequest;
use crate::domain::models::tutor::TutorRequest;
use crate::AppState;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};

pub async fn analyze_error(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<TutorRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    if let Some(ref uid) = payload.user_id {
        if claims.role != "admin" && claims.email != *uid {
            return Err((
                StatusCode::FORBIDDEN,
                "No autorizado para analizar errores de otro usuario".to_string(),
            ));
        }
    }

    match state.tutor_use_cases.analyze_error(payload).await {
        Ok(result_str) => {
            // Match Python backend: return { "success": true, "explanation": "JSON_STRING", "usage": {} }
            Ok((
                StatusCode::OK,
                Json(serde_json::json!({
                    "success": true,
                    "explanation": result_str,
                    "usage": {}
                })),
            )
                .into_response())
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn explain_like_child(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<TutorRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let _claims = extract_claims(&state, &headers)?;

    match state.tutor_use_cases.explain_like_child(payload).await {
        Ok(result_str) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "explanation": result_str,
                "usage": {}
            })),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn guide_onboarding(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<OnboardingGuideRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let _claims = extract_claims(&state, &headers)?;

    match state.tutor_use_cases.guide_onboarding_step(payload).await {
        Ok(message) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": message,
            })),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}
