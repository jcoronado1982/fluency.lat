use crate::api::dto::personal_words::{
    CreateWordBody, PersonalDeckSummaryDto, PersonalWordsSummaryQuery, PersonalWordsSummaryResponse,
    RenamePersonalDeckBody,
};
use crate::api::mappers::flashcards::{
    create_word_outcome_to_response, word_previews_to_response,
};
use crate::api::middleware::auth::{extract_claims, require_premium_role, resolve_effective_role};
use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use fluency_core::ports::tutor::ExistingPersonalTopic;

const MAX_WORD_LEN: usize = 80;
const MAX_TOPIC_NAME_LEN: usize = 60;

/// "¿Dónde va a caer esta palabra?" — clasifica (categoría+nivel+duplicado+mazo existente) SIN
/// generar imagen/audio ni guardar nada. El frontend lo pide antes de confirmar la creación real,
/// para mostrar el destino de forma clara antes de la parte cara de la generación.
pub async fn preview_word(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<CreateWordBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_premium_role(&role)?;

    if body.word.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "word está vacío".to_string()));
    }
    if body.word.chars().count() > MAX_WORD_LEN {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("word supera el límite de {MAX_WORD_LEN} caracteres"),
        ));
    }

    let existing_topics: Vec<ExistingPersonalTopic> = body
        .existing_topics
        .iter()
        .map(|t| ExistingPersonalTopic {
            category: t.category.clone(),
            level: t.level.clone(),
            topic_name: t.topic_name.clone(),
        })
        .collect();

    match state
        .card_creation_use_cases
        .preview_personal_word(
            &claims.email,
            &role,
            &body.word,
            &body.course_direction,
            body.category_override.as_deref(),
            body.level_override.as_deref(),
            &existing_topics,
        )
        .await
    {
        Ok(candidates) => Ok(word_previews_to_response(candidates)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// "Crear palabra" — mazo personal por usuario. Admin/Premium únicamente; ver
/// `docs/modules/flashcards.md` §Personal Words.
pub async fn create_word(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<CreateWordBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_premium_role(&role)?;

    if body.word.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "word está vacío".to_string()));
    }
    if body.word.chars().count() > MAX_WORD_LEN {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("word supera el límite de {MAX_WORD_LEN} caracteres"),
        ));
    }

    match state
        .card_creation_use_cases
        .create_personal_word(
            &claims.email,
            &role,
            &body.word,
            &body.course_direction,
            body.category_override.as_deref(),
            body.level_override.as_deref(),
        )
        .await
    {
        Ok(outcome) => Ok(create_word_outcome_to_response(outcome)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// Resumen en vivo de los mazos personales del usuario para una categoría (0 a 3 niveles) — el
/// frontend lo pide justo después de cargar el catálogo general de esa categoría y antepone el
/// resultado a la lista ya mostrada (ver `useDeckSession.js` y
/// `docs/modules/flashcards.md` §Personal Words).
pub async fn get_personal_words_summary(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<PersonalWordsSummaryQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;

    match state
        .card_creation_use_cases
        .personal_words_summaries(&claims.email, &query.category, &query.course_direction)
        .await
    {
        Ok(summaries) => Ok((
            StatusCode::OK,
            Json(PersonalWordsSummaryResponse {
                decks: summaries
                    .into_iter()
                    .map(|s| PersonalDeckSummaryDto {
                        deck: s.deck,
                        total: s.total,
                        learned: s.learned,
                        topic_name: s.topic_name,
                    })
                    .collect(),
            }),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// "Ponerle nombre al mazo" — solo ofrecido por el frontend justo después de crear la primera
/// palabra de un mazo nuevo (`CreateWordResponse.is_new_deck`). Admin/Premium únicamente.
pub async fn rename_personal_deck(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<RenamePersonalDeckBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_premium_role(&role)?;

    if body.topic_name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "topic_name está vacío".to_string()));
    }
    if body.topic_name.chars().count() > MAX_TOPIC_NAME_LEN {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("topic_name supera el límite de {MAX_TOPIC_NAME_LEN} caracteres"),
        ));
    }

    match state
        .card_creation_use_cases
        .rename_personal_deck(
            &claims.email,
            &role,
            &body.category,
            &body.level,
            &body.topic_name,
            &body.course_direction,
        )
        .await
    {
        Ok(()) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}
