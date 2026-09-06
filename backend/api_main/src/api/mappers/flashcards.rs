use axum::{http::StatusCode, response::IntoResponse, response::Response, Json};
use mod_flashcards::audio_use_cases::AudioSynthRequest;
use mod_flashcards::card_creation_use_cases::{CreateWordOutcome, WordPreview};
use mod_flashcards::image_use_cases::{ImageGenRequest, UploadImageRequest};
use mod_flashcards::DeleteCardOutcome;

use crate::api::dto::generation::{DeleteAudioBody, GenerateImageBody, SynthesizeSpeechBody};
use crate::api::dto::personal_words::{
    CreateWordResponse, PreviewWordCandidate, PreviewWordResponse,
};

pub fn to_audio_synth_request(body: SynthesizeSpeechBody) -> AudioSynthRequest {
    AudioSynthRequest {
        category: body.category,
        deck: body.deck,
        text: body.text,
        voice_name: body.voice_name,
        verb_name: body.verb_name.filter(|s| !s.is_empty()),
        tone: body.tone.filter(|s| !s.is_empty()),
        lang: body.lang.filter(|s| !s.is_empty()),
        course_direction: body.course_direction.filter(|s| !s.is_empty()),
        exclude_voice: body.exclude_voice.filter(|s| !s.is_empty()),
        force_regenerate: body.force_regenerate.unwrap_or(false),
    }
}

pub fn to_delete_audio_request(body: DeleteAudioBody) -> AudioSynthRequest {
    AudioSynthRequest {
        category: body.category,
        deck: body.deck,
        text: body.text,
        voice_name: body.voice_name,
        verb_name: body.verb_name.filter(|s| !s.is_empty()),
        tone: body.tone.filter(|s| !s.is_empty()),
        lang: body.lang.filter(|s| !s.is_empty()),
        course_direction: body.course_direction.filter(|s| !s.is_empty()),
        exclude_voice: body.exclude_voice.filter(|s| !s.is_empty()),
        force_regenerate: false,
    }
}

pub fn to_image_gen_request(body: GenerateImageBody) -> ImageGenRequest {
    ImageGenRequest {
        category: body.category,
        deck: body.deck,
        index: body.index,
        def_index: body.def_index,
        course_direction: body.course_direction.filter(|s| !s.is_empty()),
        prompt: body.prompt,
        meaning: body.meaning,
        usage_example: body.usage_example,
        usage_context: body.usage_context.filter(|s| !s.trim().is_empty()),
        alternative_example: body.alternative_example.filter(|s| !s.trim().is_empty()),
        force_generation: body.force_generation,
        form: body.form,
        legacy_image_path: body.legacy_image_path.filter(|s| !s.trim().is_empty()),
        prompt_engine: body.prompt_engine.filter(|s| !s.trim().is_empty()),
        scene_complement: body.scene_complement.filter(|s| !s.trim().is_empty()),
    }
}

pub fn to_upload_image_request(
    category: String,
    deck: String,
    card_index: usize,
    def_index: usize,
    course_direction: Option<String>,
    form: Option<String>,
    file_data: Vec<u8>,
    file_name: String,
    content_type: String,
) -> UploadImageRequest {
    UploadImageRequest {
        category,
        deck,
        card_index,
        def_index,
        course_direction: course_direction.filter(|s| !s.is_empty()),
        form,
        file_data,
        file_name,
        content_type,
    }
}

// ── Salida: resultado del caso de uso → respuesta HTTP ───────────────────────────────────────
// Los enums de resultado (`DeleteCardOutcome`, `CreateWordOutcome`) son tipos de `mod_flashcards`:
// traducirlos a status + cuerpo es trabajo de mapper, no del handler (regla "HTTP delgado",
// `docs/ARQUITECTURA_MODULAR.md` §3.3 — los endpoints no importan tipos de `mod_flashcards`).

/// El borrado es **idempotente**: reintentar sobre una tarjeta ya retirada devuelve 200, no error —
/// así el cliente queda consistente al avanzar aunque haya reenviado la petición.
pub fn delete_card_outcome_to_response(
    outcome: DeleteCardOutcome,
) -> Result<Response, (StatusCode, String)> {
    match outcome {
        DeleteCardOutcome::Deleted { remaining_active } => Ok(Json(serde_json::json!({
            "success": true,
            "message": "Tarjeta eliminada del catálogo",
            "already_deleted": false,
            "remaining_active": remaining_active,
        }))
        .into_response()),
        DeleteCardOutcome::AlreadyDeleted { remaining_active } => Ok(Json(serde_json::json!({
            "success": true,
            "message": "La tarjeta ya estaba eliminada",
            "already_deleted": true,
            "remaining_active": remaining_active,
        }))
        .into_response()),
        DeleteCardOutcome::OutOfRange => Err((
            StatusCode::NOT_FOUND,
            "No existe ninguna tarjeta en esa posición del mazo".to_string(),
        )),
        DeleteCardOutcome::WordMismatch { actual } => Err((
            StatusCode::CONFLICT,
            format!(
                "El mazo cambió: en esa posición ahora está «{actual}». Recargá el mazo y volvé a intentar."
            ),
        )),
    }
}

/// `Duplicate` no es un error: significa que la palabra ya estaba y NO se llamó a ningún proveedor
/// de IA. El frontend distingue por el flag `duplicate`, no por el status.
pub fn create_word_outcome_to_response(outcome: CreateWordOutcome) -> Response {
    let body = match outcome {
        CreateWordOutcome::Duplicate {
            category, level, ..
        } => CreateWordResponse {
            duplicate: true,
            category,
            level,
            is_new_deck: false,
            card: None,
        },
        CreateWordOutcome::Created {
            category,
            level,
            is_new_deck,
            card,
        } => CreateWordResponse {
            duplicate: false,
            category,
            level,
            is_new_deck,
            card: Some(card),
        },
    };
    (StatusCode::OK, Json(body)).into_response()
}

pub fn word_previews_to_response(previews: Vec<WordPreview>) -> Response {
    let candidates = previews
        .into_iter()
        .map(|c| PreviewWordCandidate {
            duplicate: c.duplicate,
            category: c.category,
            level: c.level,
            name: c.name,
            is_new_deck: c.is_new_deck,
            existing_topic_name: c.existing_topic_name,
        })
        .collect();
    (StatusCode::OK, Json(PreviewWordResponse { candidates })).into_response()
}
