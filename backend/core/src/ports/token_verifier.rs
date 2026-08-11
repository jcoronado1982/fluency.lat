use crate::domain::models::user::{ApplePayload, GooglePayload};
use anyhow::Result;
use async_trait::async_trait;

/// Verifica tokens de identidad OAuth (Google/Apple) contra el proveedor externo.
/// El caso de uso (`AuthUseCases`) nunca habla HTTP directo ni conoce JWKS —
/// eso es responsabilidad del adapter concreto en `api_main/src/infrastructure`.
#[async_trait]
pub trait TokenVerifier: Send + Sync {
    async fn verify_google_id_token(&self, id_token: &str) -> Result<GooglePayload>;
    async fn verify_apple_id_token(&self, id_token: &str) -> Result<ApplePayload>;
}
