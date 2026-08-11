use crate::api::middleware::auth::{extract_claims, resolve_effective_role};
use crate::AppState;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use fluency_core::domain::models::user::CatalogPreferences;
use mod_shell::auth::AuthUseCases;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct GoogleLoginRequest {
    pub id_token: String,
}

#[derive(Deserialize)]
pub struct AppleLoginRequest {
    pub id_token: String,
    pub name: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateOnboardingRequest {
    pub completed: bool,
}

#[derive(Deserialize)]
pub struct UpdateCatalogPreferencesRequest {
    pub catalog_preferences: Option<CatalogPreferences>,
}

#[derive(Deserialize)]
pub struct UpdateStudyLanguageRequest {
    pub study_language: String,
}

/// POST /api/auth/dev-guest — solo desarrollo; emite JWT válido para pruebas locales.
pub async fn dev_guest_login(State(state): State<AppState>) -> impl IntoResponse {
    if !AuthUseCases::dev_guest_token_allowed() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "success": false, "detail": "Not available" })),
        )
            .into_response();
    }
    match state.auth_use_cases.dev_guest_login() {
        Ok(response) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "token": response.token,
                "user": response.user
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn google_login(
    State(state): State<AppState>,
    Json(payload): Json<GoogleLoginRequest>,
) -> impl IntoResponse {
    match state.auth_use_cases.google_login(&payload.id_token).await {
        Ok(response) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "token": response.token,
                "user": response.user
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "success": false,
                "detail": e.to_string()
            })),
        )
            .into_response(),
    }
}

pub async fn apple_login(
    State(state): State<AppState>,
    Json(payload): Json<AppleLoginRequest>,
) -> impl IntoResponse {
    match state
        .auth_use_cases
        .apple_login(&payload.id_token, payload.name.as_deref())
        .await
    {
        Ok(response) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "token": response.token,
                "user": response.user
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "success": false,
                "detail": e.to_string()
            })),
        )
            .into_response(),
    }
}

/// GET /api/auth/me — rol real en servidor (JWT puede estar desactualizado vs localStorage).
pub async fn get_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let effective_role = resolve_effective_role(&state, &claims).await;
    let user = state
        .auth_use_cases
        .get_user_profile(&claims.email)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let onboarding_completed = user
        .as_ref()
        .map(|u| u.onboarding_completed)
        .unwrap_or(false);

    // La suscripción solo existe si el módulo de pagos está compilado. Sin la feature el campo
    // viaja como `null` y el frontend cae a `effective_role`, que ya resuelve premium por BD.
    #[cfg(feature = "subscriptions")]
    let subscription_data = state
        .subscription_use_cases
        .get(&claims.email)
        .await
        .ok()
        .flatten()
        .map(|s| {
            serde_json::json!({
                "plan": s.plan,
                "status": s.status,
                "expires_at": s.expires_at,
            })
        });
    #[cfg(not(feature = "subscriptions"))]
    let subscription_data: Option<serde_json::Value> = None;

    Ok(Json(serde_json::json!({
        "email": claims.email,
        "name": claims.name,
        "jwt_role": claims.role,
        "effective_role": effective_role,
        "onboarding_completed": onboarding_completed,
        "picture": user.as_ref().and_then(|u| u.picture.clone()).or_else(|| claims.picture.clone()),
        "catalog_preferences": user.as_ref().and_then(|u| u.catalog_preferences.clone()),
        "study_language": user.as_ref().and_then(|u| u.study_language.clone()),
        "is_admin": AuthUseCases::is_admin_role(&effective_role),
        "is_premium": AuthUseCases::is_premium_role(&effective_role),
        "subscription": subscription_data,
    })))
}

pub async fn update_study_language(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateStudyLanguageRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let study_language = match payload.study_language.as_str() {
        "en" => "en",
        "es" => "es",
        "de" => "de",
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "study_language debe ser 'en', 'es' o 'de'".to_string(),
            ))
        }
    };
    let user = state
        .auth_use_cases
        .update_study_language(&claims.email, study_language)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match user {
        Some(user) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "user": user
            })),
        )),
        None => Err((StatusCode::NOT_FOUND, "User not found".to_string())),
    }
}

pub async fn update_onboarding(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateOnboardingRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let user = state
        .auth_use_cases
        .set_onboarding_completed(&claims.email, payload.completed)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match user {
        Some(user) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "user": user
            })),
        )),
        None => {
            let user = state
                .auth_use_cases
                .ensure_user_from_claims(&claims, payload.completed)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            Ok((
                StatusCode::OK,
                Json(serde_json::json!({
                    "success": true,
                    "user": user
                })),
            ))
        }
    }
}

pub async fn update_catalog_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateCatalogPreferencesRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let user = state
        .auth_use_cases
        .update_catalog_preferences(&claims.email, payload.catalog_preferences)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match user {
        Some(user) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "user": user
            })),
        )),
        None => Err((StatusCode::NOT_FOUND, "User not found".to_string())),
    }
}
