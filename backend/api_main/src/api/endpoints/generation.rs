use crate::api::dto::generation::{
    DeleteAudioBody, DeleteDefinitionBody, DeleteImageBody, GenerateImageBody,
    GenerateImageResponse, ResolveImageBody, SynthesizeSpeechBody, SynthesizeSpeechResponse,
};
use crate::api::mappers::flashcards::{
    to_audio_synth_request, to_delete_audio_request, to_image_gen_request, to_upload_image_request,
};
use crate::api::middleware::auth::{
    extract_claims, extract_claims_or_guest, require_premium_role, resolve_effective_role,
};
use crate::AppState;
use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use mod_flashcards::is_landing_demo_namespace;

const MAX_TTS_TEXT_LEN: usize = 500;
const MAX_IMAGE_PROMPT_LEN: usize = 1_200;
const MAX_SCENE_COMPLEMENT_LEN: usize = 500;
const MAX_UPLOAD_IMAGE_BYTES: usize = 8 * 1024 * 1024;

async fn reject_media_mutation_during_local_gate(
    state: &AppState,
) -> Result<(), (StatusCode, String)> {
    if state.storage_repo.is_locked_for_local_preprod().await {
        return Err((
            StatusCode::LOCKED,
            "Media bloqueada temporalmente por el gate local de preproducción".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod media_lock_tests {
    use super::{require_image_customization_role, validate_len};
    use axum::http::StatusCode;

    #[test]
    fn text_validation_uses_unicode_characters_not_utf8_bytes() {
        assert!(validate_len(&"á".repeat(500), 500, "text").is_ok());

        let err = validate_len(&"á".repeat(501), 500, "text").unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert!(err.1.contains("500 caracteres"));
    }

    #[test]
    fn text_validation_rejects_blank_and_accepts_exact_boundary() {
        assert_eq!(
            validate_len(" \n\t ", 500, "text").unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
        assert!(validate_len(&"x".repeat(500), 500, "text").is_ok());
        assert_eq!(
            validate_len(&"x".repeat(501), 500, "text").unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn image_customization_is_admin_only() {
        assert!(require_image_customization_role("admin").is_ok());
        for role in ["guest", "free", "premium", ""] {
            assert_eq!(
                require_image_customization_role(role).unwrap_err().0,
                StatusCode::FORBIDDEN
            );
        }
    }
}

fn require_image_customization_role(role: &str) -> Result<(), (StatusCode, String)> {
    if role == "admin" {
        Ok(())
    } else {
        Err((
            StatusCode::FORBIDDEN,
            "Las imágenes personalizadas estarán disponibles con el futuro plan Platinum"
                .to_string(),
        ))
    }
}

fn validate_len(value: &str, max: usize, field: &str) -> Result<(), (StatusCode, String)> {
    if value.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, format!("{field} está vacío")));
    }
    if value.chars().count() > max {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{field} supera el límite de {max} caracteres"),
        ));
    }
    Ok(())
}

/// Solo busca audio en disco (sin TTS). El cliente luego hace GET a /card_audio/… vía Caddy.
pub async fn resolve_audio(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<SynthesizeSpeechBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims_or_guest(&state, &headers);
    let role = resolve_effective_role(&state, &claims).await;
    validate_len(&body.text, MAX_TTS_TEXT_LEN, "text")?;
    let req = to_audio_synth_request(body);

    match state
        .audio_use_cases
        .resolve_audio(&req, &claims.email, &role)
        .await
    {
        Ok(Some(result)) => Ok(Json(SynthesizeSpeechResponse {
            audio_url: result.audio_url,
            voice_name: result.voice_name,
            from_cache: result.from_cache,
        })),
        Ok(None) => Err((StatusCode::NOT_FOUND, "Audio no encontrado".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn synthesize_speech(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<SynthesizeSpeechBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    reject_media_mutation_during_local_gate(&state).await?;
    let claims = extract_claims_or_guest(&state, &headers);
    let role = resolve_effective_role(&state, &claims).await;

    // Viewers: caché global. Namespace landing-demo: invitados pueden generar audio aislado.
    validate_len(&body.text, MAX_TTS_TEXT_LEN, "text")?;
    let req = to_audio_synth_request(body);

    state
        .audio_use_cases
        .get_or_synthesize_audio(&req, &claims.email, &role)
        .await
        .map(|result| {
            Json(SynthesizeSpeechResponse {
                audio_url: result.audio_url,
                voice_name: result.voice_name,
                from_cache: result.from_cache,
            })
        })
        .map_err(|e| {
            let msg = e.to_string();
            if msg == "audio_not_found" {
                (
                    StatusCode::NOT_FOUND,
                    "Audio no disponible (requiere plan Premium para generar)".to_string(),
                )
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg)
            }
        })
}

/// Resuelve la ruta AVIF a mostrar (sin generar).
/// Todos los planes actuales resuelven la biblioteca global; la capa personal
/// queda reservada para el futuro plan Platinum.
pub async fn resolve_image(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<ResolveImageBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = if is_landing_demo_namespace(&body.category) {
        extract_claims_or_guest(&state, &headers)
    } else {
        extract_claims(&state, &headers)?
    };
    let role = resolve_effective_role(&state, &claims).await;

    match state
        .image_use_cases
        .resolve_image_path(
            &body.category,
            &body.deck,
            body.index,
            body.def_index,
            body.course_direction.as_deref(),
            body.form.as_deref(),
            &claims.email,
            &role,
        )
        .await
    {
        Ok(Some(path)) => Ok(Json(GenerateImageResponse { path }).into_response()),
        Ok(None) => Err((StatusCode::NOT_FOUND, "Imagen no encontrada".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn generate_image(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<GenerateImageBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    reject_media_mutation_during_local_gate(&state).await?;
    let is_demo = is_landing_demo_namespace(&body.category);
    let claims = if is_demo {
        extract_claims_or_guest(&state, &headers)
    } else {
        extract_claims(&state, &headers)?
    };
    let role = resolve_effective_role(&state, &claims).await;
    validate_len(&body.prompt, MAX_IMAGE_PROMPT_LEN, "prompt")?;
    if let Some(scene) = body.scene_complement.as_deref() {
        if scene.chars().count() > MAX_SCENE_COMPLEMENT_LEN {
            return Err((
                StatusCode::BAD_REQUEST,
                format!(
                    "scene_complement supera el límite de {MAX_SCENE_COMPLEMENT_LEN} caracteres"
                ),
            ));
        }
    }
    if !is_demo {
        require_image_customization_role(&role)?;
    }

    let req = to_image_gen_request(body);

    state
        .image_use_cases
        .get_or_generate_image(&req, &claims.email, &role)
        .await
        .map(|(path, _is_new)| {
            (StatusCode::OK, Json(GenerateImageResponse { path })).into_response()
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn delete_audio(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<DeleteAudioBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    reject_media_mutation_during_local_gate(&state).await?;
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_premium_role(&role)?;
    validate_len(&body.text, MAX_TTS_TEXT_LEN, "text")?;
    let is_admin = role == "admin";

    let req = to_delete_audio_request(body);

    match state
        .audio_use_cases
        .rotate_audio(&req, &claims.email, is_admin)
        .await
    {
        Ok(Some(previous)) => Ok(Json(serde_json::json!({
            "success": true,
            "message": "Audio archivado; se generará otra voz aleatoria",
            "previous_voice": previous
        })).into_response()),
        Ok(None) => Ok((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "success": false, "message": "No hay audio activo para rotar" })),
        ).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn delete_image(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<DeleteImageBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    reject_media_mutation_during_local_gate(&state).await?;
    let is_demo = is_landing_demo_namespace(&body.category);
    let claims = if is_demo {
        extract_claims_or_guest(&state, &headers)
    } else {
        extract_claims(&state, &headers)?
    };
    let role = resolve_effective_role(&state, &claims).await;
    if !is_demo {
        require_image_customization_role(&role)?;
    }
    let is_admin = role == "admin" || is_demo;

    match state
        .image_use_cases
        .delete_image(
            &body.category,
            &body.deck,
            body.index,
            body.def_index,
            body.course_direction.as_deref(),
            body.form.as_deref(),
            &claims.email,
            is_admin,
        )
        .await
    {
        Ok(true) => Ok(Json(
            serde_json::json!({ "success": true,  "message": "Imagen eliminada" }),
        )
        .into_response()),
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            "No se encontró ninguna imagen para borrar".to_string(),
        )),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// Elimina permanentemente una `definitions[def_index]` del contenido del deck (no es media:
/// edita `json/`). Admin-only — misma gate que `delete_image`. No borra la imagen/audio
/// asociados a esa posición (quedan huérfanos); tampoco reordena las demás direcciones de
/// curso — si `def_index` no es la última definición del card, puede desalinear las imágenes
/// compartidas por posición con otras direcciones (ver `docs/modules/flashcards.md`).
pub async fn delete_definition(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<DeleteDefinitionBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_image_customization_role(&role)?;

    match state
        .deck_use_cases
        .delete_definition(
            &body.category,
            &body.deck,
            body.index,
            body.def_index,
            body.form.as_deref(),
            body.course_direction.as_deref().unwrap_or("es_en"),
        )
        .await
    {
        Ok(true) => Ok(
            Json(serde_json::json!({ "success": true, "message": "Frase eliminada" }))
                .into_response(),
        ),
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            "No se encontró ninguna definición para borrar".to_string(),
        )),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn upload_image(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    reject_media_mutation_during_local_gate(&state).await?;
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_image_customization_role(&role)?;
    let is_admin = role == "admin";

    let mut category = String::new();
    let mut deck = String::new();
    let mut card_index: usize = 0;
    let mut def_index: usize = 0;
    let mut course_direction: Option<String> = None;
    let mut form: Option<String> = None;
    let mut file_data: Vec<u8> = Vec::new();
    let mut file_name = String::new();
    let mut content_type = String::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        let name = field.name().unwrap_or_default().to_string();
        match name.as_str() {
            "category" => {
                category = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
            }
            "deck" => {
                deck = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
            }
            "card_index" => {
                card_index = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                    .parse()
                    .unwrap_or(0)
            }
            "def_index" => {
                def_index = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                    .parse()
                    .unwrap_or(0)
            }
            "course_direction" => {
                course_direction = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?,
                )
            }
            "form" => {
                form = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?,
                )
            }
            "file" => {
                file_name = field.file_name().unwrap_or("upload.png").to_string();
                content_type = field.content_type().unwrap_or("image/png").to_string();
                file_data = field
                    .bytes()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                    .to_vec();
                if file_data.len() > MAX_UPLOAD_IMAGE_BYTES {
                    return Err((
                        StatusCode::PAYLOAD_TOO_LARGE,
                        "La imagen supera el límite de 8 MB".to_string(),
                    ));
                }
            }
            _ => {}
        }
    }

    if category.is_empty() || deck.is_empty() || file_data.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Faltan campos obligatorios o el archivo está vacío".to_string(),
        ));
    }
    if !matches!(
        content_type.as_str(),
        "image/avif" | "image/jpeg" | "image/png" | "image/webp"
    ) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Tipo de imagen no permitido".to_string(),
        ));
    }

    let req = to_upload_image_request(
        category,
        deck,
        card_index,
        def_index,
        course_direction,
        form,
        file_data,
        file_name,
        content_type,
    );

    state
        .image_use_cases
        .upload_image(req, &claims.email, is_admin)
        .await
        .map(|path| Json(GenerateImageResponse { path }).into_response())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
