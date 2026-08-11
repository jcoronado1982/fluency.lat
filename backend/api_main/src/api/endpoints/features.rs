use axum::{response::IntoResponse, Json};
use serde::Serialize;

#[derive(Serialize)]
pub struct FeatureFlagsResponse {
    pub flashcards: bool,
    pub auth: bool,
    pub pronoun_practice: bool,
    pub payments: bool,
    pub subscriptions: bool,
}

pub async fn get_features() -> impl IntoResponse {
    Json(FeatureFlagsResponse {
        flashcards: cfg!(feature = "flashcards"),
        auth: cfg!(feature = "auth"),
        pronoun_practice: cfg!(feature = "pronoun_practice"),
        payments: cfg!(feature = "payments"),
        subscriptions: cfg!(feature = "subscriptions"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        routing::get,
        Router,
    };
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[tokio::test]
    async fn feature_contract_is_stable_through_the_axum_router() {
        let response = Router::new()
            .route("/api/features", get(get_features))
            .oneshot(
                Request::builder()
                    .uri("/api/features")
                    .body(Body::empty())
                    .expect("valid request"),
            )
            .await
            .expect("in-memory router response");

        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("response body")
            .to_bytes();
        let payload: serde_json::Value =
            serde_json::from_slice(&body).expect("valid JSON response");

        // El snapshot refleja el conjunto `default` de features (lo que compila el binario de
        // producción). `payments`/`subscriptions` están en true desde que el cobro real con
        // LemonSqueezy se despliega por defecto — ver [features] en Cargo.toml.
        insta::assert_json_snapshot!(payload, @r###"
        {
          "auth": true,
          "flashcards": true,
          "payments": true,
          "pronoun_practice": false,
          "subscriptions": true
        }
        "###);
    }
}
