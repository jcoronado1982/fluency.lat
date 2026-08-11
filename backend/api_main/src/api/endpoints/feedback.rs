use crate::api::middleware::auth::extract_claims;
use crate::api::middleware::client_ip::{extract_client_ip, resolve_country};
use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use mod_shell::demo_feedback_use_cases::{DemoFeedbackSubmission, DemoFeedbackUseCases};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct DemoFeedbackBody {
    pub comment: String,
    #[serde(default)]
    pub rating: Option<u8>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Serialize)]
struct DemoFeedbackReview {
    user_name: String,
    rating: u8,
    comment: String,
    created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    picture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_handle: Option<String>,
}

#[derive(Serialize)]
struct DemoFeedbackSummary {
    average: f64,
    count: u32,
}

#[derive(Serialize)]
struct DemoFeedbackListResponse {
    summary: DemoFeedbackSummary,
    reviews: Vec<DemoFeedbackReview>,
}

#[derive(Deserialize)]
pub struct DemoFeedbackListQuery {
    #[serde(default = "default_list_limit")]
    pub limit: usize,
}

fn default_list_limit() -> usize {
    20
}

fn full_display_name(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        "Usuario".to_string()
    } else {
        trimmed.to_string()
    }
}

fn email_handle(email: &str) -> String {
    let local = email.split('@').next().unwrap_or("user").trim();
    if local.is_empty() {
        "@user".to_string()
    } else {
        format!("@{local}")
    }
}

fn feedback_submit_response(stored_records: usize) -> serde_json::Value {
    serde_json::json!({
        "success": true,
        "audit": {
            "persisted": true,
            "stored_records": stored_records
        }
    })
}

pub async fn list_demo_feedback(
    State(state): State<AppState>,
    Query(query): Query<DemoFeedbackListQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let result = state
        .demo_feedback_use_cases
        .list(query.limit)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let reviews = result
        .reviews
        .into_iter()
        .map(|record| DemoFeedbackReview {
            user_name: full_display_name(&record.user_name),
            rating: record.rating,
            comment: record.comment,
            created_at: record.created_at.to_rfc3339(),
            picture: record.picture,
            country: record.country,
            user_handle: record
                .user_handle
                .or_else(|| Some(email_handle(&record.user_email))),
        })
        .collect();

    Ok(Json(DemoFeedbackListResponse {
        summary: DemoFeedbackSummary {
            average: result.summary.average,
            count: result.summary.count,
        },
        reviews,
    }))
}

pub async fn submit_demo_feedback(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<DemoFeedbackBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;

    let comment = DemoFeedbackUseCases::validate_comment(&body.comment)
        .map_err(|msg| (StatusCode::BAD_REQUEST, msg))?;

    let rating = body.rating.ok_or((
        StatusCode::BAD_REQUEST,
        "Selecciona una calificación de 1 a 5 estrellas".to_string(),
    ))?;
    DemoFeedbackUseCases::validate_rating(rating).map_err(|msg| (StatusCode::BAD_REQUEST, msg))?;

    let (user_name, picture) = {
        #[cfg(feature = "auth")]
        {
            match state.auth_use_cases.get_user_profile(&claims.email).await {
                Ok(Some(user)) => (user.name, user.picture),
                _ => (claims.name.clone(), None),
            }
        }
        #[cfg(not(feature = "auth"))]
        {
            (claims.name.clone(), None)
        }
    };

    let client_ip = extract_client_ip(&headers);
    let country = resolve_country(&headers, client_ip.as_deref()).await;

    let submission = DemoFeedbackSubmission {
        user_email: claims.email.clone(),
        user_name: full_display_name(&user_name),
        comment: comment.to_string(),
        rating,
        language: body.language.clone(),
        source: body.source.clone(),
        picture,
        country,
        user_handle: Some(email_handle(&claims.email)),
    };

    let stored_records = state
        .demo_feedback_use_cases
        .submit(submission)
        .await
        .map_err(|e| {
            tracing::error!(
                target: "demo_feedback_audit",
                user = %claims.email,
                error = %e,
                "POST feedback: no se pudo guardar en SurrealDB"
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "El comentario no pudo guardarse".to_string(),
            )
        })?;

    tracing::info!(
        target: "demo_feedback_audit",
        user = %claims.email,
        rating,
        stored_records,
        "POST feedback: guardado en SurrealDB"
    );

    Ok(Json(feedback_submit_response(stored_records)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_display_name_keeps_complete_name() {
        assert_eq!(
            full_display_name("Jesús Alberto Coronado"),
            "Jesús Alberto Coronado"
        );
        assert_eq!(full_display_name("Ana"), "Ana");
        assert_eq!(full_display_name(""), "Usuario");
    }

    #[test]
    fn email_handle_from_email() {
        assert_eq!(email_handle("jesus@fluency.lat"), "@jesus");
        assert_eq!(email_handle("@fluency.lat"), "@user");
        assert_eq!(email_handle("plain-user"), "@plain-user");
    }

    #[test]
    fn submit_success_response_matches_the_frontend_contract() {
        assert_eq!(
            feedback_submit_response(7),
            serde_json::json!({
                "success": true,
                "audit": {
                    "persisted": true,
                    "stored_records": 7
                }
            })
        );
    }
}
