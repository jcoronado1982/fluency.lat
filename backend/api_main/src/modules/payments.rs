use axum::{
    routing::{get, post},
    Router,
};

use crate::{api, AppState};

pub fn register_routes(app: Router<AppState>) -> Router<AppState> {
    app.route(
        "/api/checkout/session",
        post(api::endpoints::payments::create_checkout_session),
    )
    .route(
        "/api/webhooks/lemonsqueezy",
        post(api::endpoints::payments::lemonsqueezy_webhook),
    )
    .route(
        "/api/subscriptions/me",
        get(api::endpoints::admin::get_my_subscription),
    )
    .route(
        "/api/admin/subscriptions",
        get(api::endpoints::admin::list_subscriptions),
    )
    .route(
        "/api/admin/subscriptions/activate",
        post(api::endpoints::admin::activate_subscription),
    )
    .route(
        "/api/admin/subscriptions/cancel",
        post(api::endpoints::admin::cancel_subscription),
    )
}
