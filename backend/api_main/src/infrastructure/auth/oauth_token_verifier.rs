use anyhow::{anyhow, Result};
use async_trait::async_trait;
use fluency_core::domain::models::user::{ApplePayload, GooglePayload};
use fluency_core::ports::token_verifier::TokenVerifier;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Cache de las llaves públicas de un proveedor OAuth (JWKS).
/// Los proveedores rotan estas llaves cada pocas horas; las cacheamos 1 hora para evitar
/// un round-trip HTTP externo en cada login bajo alta concurrencia.
struct JwksCache {
    value: serde_json::Value,
    fetched_at: Instant,
}

impl JwksCache {
    const TTL: Duration = Duration::from_secs(3600); // 1 hora

    fn is_valid(&self) -> bool {
        self.fetched_at.elapsed() < Self::TTL
    }
}

/// Verifica ID tokens de Google y Apple contra sus JWKS públicos (RS256).
/// Único adapter que habla HTTP para autenticación — `AuthUseCases` solo conoce
/// el puerto `TokenVerifier`.
pub struct OAuthTokenVerifier {
    http_client: reqwest::Client,
    google_jwks_cache: RwLock<Option<JwksCache>>,
    apple_jwks_cache: RwLock<Option<JwksCache>>,
    google_client_id: String,
    apple_client_id: String,
}

impl OAuthTokenVerifier {
    pub fn new() -> Self {
        Self {
            http_client: reqwest::Client::new(),
            google_jwks_cache: RwLock::new(None),
            apple_jwks_cache: RwLock::new(None),
            google_client_id: std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default(),
            apple_client_id: std::env::var("APPLE_CLIENT_ID").unwrap_or_default(),
        }
    }

    async fn fetch_jwks(&self, url: &str) -> Result<serde_json::Value> {
        let response = self.http_client.get(url).send().await?;
        let jwks = response.json::<serde_json::Value>().await?;
        Ok(jwks)
    }

    async fn cached_jwks(
        &self,
        cache: &RwLock<Option<JwksCache>>,
        url: &str,
    ) -> Result<serde_json::Value> {
        // Intento con caché (solo lock de lectura — sin contención)
        let cached = {
            let guard = cache.read().await;
            guard
                .as_ref()
                .and_then(|c| c.is_valid().then(|| c.value.clone()))
        };
        if let Some(v) = cached {
            return Ok(v);
        }

        // Caché vacío o expirado: refrescar (lock de escritura exclusiva)
        let fresh = self.fetch_jwks(url).await?;
        let mut guard = cache.write().await;
        *guard = Some(JwksCache {
            value: fresh.clone(),
            fetched_at: Instant::now(),
        });
        Ok(fresh)
    }
}

impl Default for OAuthTokenVerifier {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl TokenVerifier for OAuthTokenVerifier {
    async fn verify_google_id_token(&self, id_token: &str) -> Result<GooglePayload> {
        let header = jsonwebtoken::decode_header(id_token)?;
        let kid = header
            .kid
            .ok_or_else(|| anyhow!("Missing kid in token header"))?;

        let jwks = self
            .cached_jwks(
                &self.google_jwks_cache,
                "https://www.googleapis.com/oauth2/v3/certs",
            )
            .await?;

        let keys = jwks["keys"]
            .as_array()
            .ok_or_else(|| anyhow!("Invalid JWKS format"))?;
        let key_data = keys
            .iter()
            .find(|k| k["kid"].as_str() == Some(&kid))
            .ok_or_else(|| anyhow!("Key ID not found in Google JWKS"))?;

        let n = key_data["n"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing n in key"))?;
        let e = key_data["e"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing e in key"))?;
        let decoding_key = DecodingKey::from_rsa_components(n, e)?;

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[&self.google_client_id]);
        validation.set_issuer(&["https://accounts.google.com", "accounts.google.com"]);

        let token_data = decode::<GooglePayload>(id_token, &decoding_key, &validation)?;

        if !token_data.claims.email_verified {
            return Err(anyhow!("Google email not verified"));
        }

        Ok(token_data.claims)
    }

    async fn verify_apple_id_token(&self, id_token: &str) -> Result<ApplePayload> {
        let header = jsonwebtoken::decode_header(id_token)?;
        let kid = header
            .kid
            .ok_or_else(|| anyhow!("Missing kid in Apple token header"))?;

        let jwks = self
            .cached_jwks(
                &self.apple_jwks_cache,
                "https://appleid.apple.com/auth/keys",
            )
            .await?;

        let keys = jwks["keys"]
            .as_array()
            .ok_or_else(|| anyhow!("Invalid Apple JWKS format"))?;
        let key_data = keys
            .iter()
            .find(|k| k["kid"].as_str() == Some(&kid))
            .ok_or_else(|| anyhow!("Key ID not found in Apple JWKS"))?;

        let n = key_data["n"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing n in Apple key"))?;
        let e = key_data["e"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing e in Apple key"))?;
        let decoding_key = DecodingKey::from_rsa_components(n, e)?;

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[&self.apple_client_id]);
        validation.set_issuer(&["https://appleid.apple.com"]);

        let token_data = decode::<ApplePayload>(id_token, &decoding_key, &validation)?;

        Ok(token_data.claims)
    }
}
