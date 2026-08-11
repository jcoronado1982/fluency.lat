use crate::api::middleware::auth::extract_claims;
use crate::domain::models::srs::{CardProgressUpdate, SrsSchedule};
use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

fn default_course_direction() -> String {
    "es_en".to_string()
}

/// Un ítem dentro del lote de actualización de progreso.
#[derive(Debug, Deserialize)]
pub struct CardUpdateItem {
    pub index: usize,
    pub learned: bool,
    #[serde(default)]
    pub box_level: Option<i32>,
    #[serde(default)]
    pub ease_factor: Option<f64>,
    #[serde(default)]
    pub interval_days: Option<f64>,
    #[serde(default)]
    pub next_review_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Payload del endpoint bulk: envía N actualizaciones en una sola petición.
#[derive(Debug, Deserialize)]
pub struct UpdateBatchRequest {
    pub user_id: String,
    pub category: String,
    pub deck: String,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    pub cards: Vec<CardUpdateItem>,
}

/// HTTP request DTO — lives in the API layer, not in domain.
#[derive(Debug, Deserialize)]
pub struct UpdateStatusRequest {
    pub user_id: String,
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub learned: bool,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
}

/// HTTP request DTO — lives in the API layer, not in domain.
#[derive(Debug, Deserialize)]
pub struct ResetRequest {
    pub user_id: String,
    pub category: String,
    pub deck: String,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub confirm: bool,
}

#[derive(Deserialize)]
pub struct CategoryQuery {
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    pub category: String,
}

#[derive(Deserialize)]
pub struct DeckQuery {
    pub user_id: String,
    pub category: String,
    pub deck: String,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
}

#[derive(Default, Deserialize)]
pub struct CourseDirectionQuery {
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    #[serde(default = "default_include_counts")]
    pub include_counts: bool,
}

#[derive(Deserialize)]
pub struct SrsDueQuery {
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    #[serde(default = "default_srs_candidate_limit")]
    pub limit: usize,
}

/// Traduce el DTO HTTP a `CardProgressUpdate`. Solo verifica la forma del
/// payload (campos SRS presentes en grupo); las reglas de negocio del
/// estado SRS (rangos, invariantes) viven en `mod_flashcards::validate_srs_schedule`.
fn build_progress_updates(
    cards: &[CardUpdateItem],
) -> Result<Vec<CardProgressUpdate>, (StatusCode, String)> {
    let mut updates = Vec::with_capacity(cards.len());
    for card in cards {
        let has_srs = card.box_level.is_some()
            || card.ease_factor.is_some()
            || card.interval_days.is_some()
            || card.next_review_at.is_some();
        let srs = if has_srs {
            let box_level = card.box_level.ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "box_level es obligatorio en una actualización SRS".to_string(),
                )
            })?;
            let ease_factor = card.ease_factor.ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "ease_factor es obligatorio en una actualización SRS".to_string(),
                )
            })?;
            let interval_days = card.interval_days.ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "interval_days es obligatorio en una actualización SRS".to_string(),
                )
            })?;
            let schedule = SrsSchedule {
                box_level,
                ease_factor,
                interval_days,
                next_review_at: card.next_review_at,
            };
            mod_flashcards::validate_srs_schedule(&schedule)
                .map_err(|detail| (StatusCode::BAD_REQUEST, detail))?;
            Some(schedule)
        } else {
            None
        };
        let card_index = i32::try_from(card.index).map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "Índice de tarjeta fuera de rango".to_string(),
            )
        })?;
        updates.push(CardProgressUpdate {
            card_index,
            learned: card.learned,
            srs,
        });
    }
    Ok(updates)
}

fn default_srs_candidate_limit() -> usize {
    5_000
}

fn default_include_counts() -> bool {
    true
}

/// POST /api/update-batch — persiste hasta BATCH_SIZE tarjetas en una sola petición.
pub async fn update_cards_batch(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<UpdateBatchRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    use crate::api::middleware::auth::extract_claims;
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != payload.user_id {
        return Err((StatusCode::FORBIDDEN, "No autorizado".to_string()));
    }
    if payload.cards.is_empty() {
        return Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "saved": 0 })),
        )
            .into_response());
    }
    const MAX_BATCH: usize = 50;
    if payload.cards.len() > MAX_BATCH {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("El lote no puede superar {} tarjetas", MAX_BATCH),
        ));
    }
    let updates = build_progress_updates(&payload.cards)?;
    match state
        .deck_use_cases
        .update_cards_batch(
            &payload.user_id,
            &payload.category,
            &payload.deck,
            &updates,
            &payload.course_direction,
        )
        .await
    {
        Ok(_) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "saved": updates.len() })),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// GET /api/srs/due — proyección mínima; toda la priorización ocurre en React.
pub async fn get_srs_due_cards(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<SrsDueQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    match state
        .deck_use_cases
        .get_srs_review_candidates(
            &claims.email,
            &query.course_direction,
            chrono::Utc::now(),
            query.limit,
        )
        .await
    {
        Ok(cards) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "cards": cards })),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_categories(
    State(state): State<AppState>,
    Query(query): Query<CourseDirectionQuery>,
) -> impl IntoResponse {
    let result = if query.include_counts {
        state
            .deck_use_cases
            .list_categories_with_counts(&query.course_direction)
            .await
    } else {
        state
            .deck_use_cases
            .list_categories(&query.course_direction)
            .await
            .map(|categories| {
                categories
                    .into_iter()
                    .map(|name| serde_json::json!({ "name": name }))
                    .collect()
            })
    };

    match result {
        Ok(categories) => (
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "categories": categories })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_available_decks(
    State(state): State<AppState>,
    Query(query): Query<CategoryQuery>,
) -> impl IntoResponse {
    match state
        .deck_use_cases
        .list_decks(&query.category, &query.course_direction)
        .await
    {
        Ok(decks) => {
            let active_file = decks.first().cloned().unwrap_or_default();
            (StatusCode::OK, Json(serde_json::json!({ "success": true, "files": decks, "active_file": active_file }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_deck_summaries(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<CategoryQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    match state
        .deck_use_cases
        .get_deck_summaries(&claims.email, &query.category, &query.course_direction)
        .await
    {
        Ok(summaries) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "summaries": summaries })),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_deck_data(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<DeckQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != query.user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "No autorizado para ver el progreso de otro usuario".to_string(),
        ));
    }
    match state
        .deck_use_cases
        .get_deck_data(
            &query.user_id,
            &query.category,
            &query.deck,
            &query.course_direction,
        )
        .await
    {
        Ok(data) => Ok((StatusCode::OK, Json(data)).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn update_card_status(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<UpdateStatusRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != payload.user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "No autorizado para modificar el progreso de otro usuario".to_string(),
        ));
    }
    match state.deck_use_cases.update_card_status(
        &payload.user_id,
        &payload.category,
        &payload.deck,
        payload.index,
        payload.learned,
        &payload.course_direction,
    ).await {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true, "message": format!("Tarjeta {} actualizada.", payload.index) }))).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn reset_all_statuses(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<ResetRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != payload.user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "No autorizado para modificar el progreso de otro usuario".to_string(),
        ));
    }
    if !payload.confirm {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "detail": "Confirmación requerida" })),
        )
            .into_response());
    }

    let reset_result = if payload.scope.as_deref() == Some("category") {
        state
            .deck_use_cases
            .reset_category_status(
                &payload.user_id,
                &payload.category,
                &payload.course_direction,
            )
            .await
    } else {
        state
            .deck_use_cases
            .reset_deck_status(
                &payload.user_id,
                &payload.category,
                &payload.deck,
                &payload.course_direction,
            )
            .await
    };

    match reset_result {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true, "message": format!("Progreso de '{}' reseteado.", payload.category) }))).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_phonics_data(State(state): State<AppState>) -> impl IntoResponse {
    match state.deck_use_cases.get_phonics_data().await {
        Ok(data) => (StatusCode::OK, Json(data)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_learning_stats(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<CourseDirectionQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    match state
        .deck_use_cases
        .get_learning_stats(&claims.email, &query.course_direction)
        .await
    {
        Ok(stats) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "stats": stats })),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn touch_study_day(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    match state.deck_use_cases.touch_study_day(&claims.email).await {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn card(index: usize) -> CardUpdateItem {
        CardUpdateItem {
            index,
            learned: false,
            box_level: None,
            ease_factor: None,
            interval_days: None,
            next_review_at: None,
        }
    }

    #[test]
    fn plain_and_mastered_updates_preserve_the_contract() {
        let mut mastered = card(9);
        mastered.learned = true;
        mastered.box_level = Some(99);
        mastered.ease_factor = Some(2.5);
        mastered.interval_days = Some(365.0);

        let updates = build_progress_updates(&[card(3), mastered]).expect("valid updates");
        assert_eq!(updates[0].card_index, 3);
        assert!(updates[0].srs.is_none());
        assert_eq!(updates[1].srs.as_ref().map(|srs| srs.box_level), Some(99));
        assert!(updates[1].srs.as_ref().unwrap().next_review_at.is_none());
    }

    #[test]
    fn incomplete_and_out_of_range_srs_states_are_rejected() {
        let mut incomplete = card(1);
        incomplete.box_level = Some(1);
        assert_eq!(
            build_progress_updates(&[incomplete]).unwrap_err().1,
            "ease_factor es obligatorio en una actualización SRS"
        );

        let invalid_states = [
            (-1, 2.5, 1.0),
            (100, 2.5, 1.0),
            (1, 1.29, 1.0),
            (1, 5.01, 1.0),
            (1, 2.5, 0.99),
            (1, 2.5, 36_501.0),
        ];
        for (box_level, ease_factor, interval_days) in invalid_states {
            let mut invalid = card(1);
            invalid.box_level = Some(box_level);
            invalid.ease_factor = Some(ease_factor);
            invalid.interval_days = Some(interval_days);
            invalid.next_review_at = Some(chrono::Utc::now());
            assert_eq!(
                build_progress_updates(&[invalid]).unwrap_err().1,
                "Estado SRS inválido"
            );
        }
    }

    #[test]
    fn non_mastered_srs_requires_a_due_date() {
        let mut update = card(1);
        update.box_level = Some(2);
        update.ease_factor = Some(2.5);
        update.interval_days = Some(3.0);
        assert!(build_progress_updates(&[update])
            .unwrap_err()
            .1
            .contains("next_review_at"));
    }

    proptest! {
        #[test]
        fn every_valid_srs_state_round_trips(
            index in 0usize..=i32::MAX as usize,
            box_level in 0i32..99,
            ease_factor in 1.3f64..=5.0,
            interval_days in 1.0f64..=36_500.0,
        ) {
            let due = chrono::Utc::now() + chrono::Duration::days(1);
            let update = CardUpdateItem {
                index,
                learned: false,
                box_level: Some(box_level),
                ease_factor: Some(ease_factor),
                interval_days: Some(interval_days),
                next_review_at: Some(due),
            };
            let result = build_progress_updates(&[update]).expect("generated valid state");
            let persisted = result[0].srs.as_ref().expect("SRS schedule");
            prop_assert_eq!(result[0].card_index, index as i32);
            prop_assert_eq!(persisted.box_level, box_level);
            prop_assert_eq!(persisted.ease_factor, ease_factor);
            prop_assert_eq!(persisted.interval_days, interval_days);
            prop_assert_eq!(persisted.next_review_at, Some(due));
        }
    }
}
