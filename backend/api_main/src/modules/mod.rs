use axum::Router;

use crate::AppState;

#[cfg(feature = "flashcards")]
mod flashcards;
#[cfg(feature = "subscriptions")]
mod payments;
#[cfg(feature = "pronoun_practice")]
mod pronoun_practice;
mod shell;

pub fn register_routes(app: Router<AppState>) -> Router<AppState> {
    let app = shell::register_routes(app);

    #[allow(unused_mut)]
    let mut app = app;

    #[cfg(feature = "flashcards")]
    {
        app = flashcards::register_routes(app);
    }

    #[cfg(feature = "pronoun_practice")]
    {
        app = pronoun_practice::register_routes(app);
    }

    #[cfg(feature = "subscriptions")]
    {
        app = payments::register_routes(app);
    }

    app
}
