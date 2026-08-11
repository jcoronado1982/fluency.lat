use axum::{routing::get, Router};

use crate::{api, AppState};

/// Rutas compartidas del shell (independientes de módulos de negocio).
/// Media estática: flashcards, pronoun practice y futuros módulos usan
/// `/card_images` y `/card_audio` vía `StorageRepository` (Oracle/local).
pub fn register_routes(app: Router<AppState>) -> Router<AppState> {
    app.route(
        "/card_images/*file_path",
        get(api::endpoints::assets::redirect_images),
    )
    .route(
        "/card_audio/*file_path",
        get(api::endpoints::assets::redirect_audio),
    )
}
