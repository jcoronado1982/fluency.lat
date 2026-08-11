use axum::{
    routing::{delete, get, post},
    Router,
};

use crate::{api, AppState};

pub fn register_routes(app: Router<AppState>) -> Router<AppState> {
    app.route(
        "/api/progress",
        get(api::endpoints::pronoun_practice::get_progress),
    )
    .route(
        "/api/progress/update",
        post(api::endpoints::pronoun_practice::update_progress),
    )
    .route(
        "/api/progress/reset",
        delete(api::endpoints::pronoun_practice::reset_progress),
    )
    .route(
        "/api/episodes/:episode_id/screens",
        get(api::endpoints::pronoun_practice::get_episode_screens),
    )
    .route(
        "/api/episodes/:episode_id/next",
        get(api::endpoints::pronoun_practice::get_next_episode),
    )
    .route(
        "/api/stories/:story_id/full-history",
        get(api::endpoints::pronoun_practice::get_story_full_history),
    )
}
