use crate::AppState;
use axum::http::StatusCode;
#[cfg(feature = "auth")]
pub use mod_shell::auth::Claims;

#[cfg(not(feature = "auth"))]
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub name: String,
    #[serde(default)]
    pub picture: Option<String>,
    pub role: String,
    pub exp: usize,
}

/// Extrae JWT si existe; si no, devuelve un viewer invitado (solo lectura de caché global).
#[cfg(feature = "flashcards")]
pub fn extract_claims_or_guest(state: &AppState, headers: &axum::http::HeaderMap) -> Claims {
    extract_claims(state, headers).unwrap_or_else(|_| Claims {
        sub: "guest".to_string(),
        email: "guest@fluency.lat".to_string(),
        name: "Guest".to_string(),
        picture: None,
        role: "viewer".to_string(),
        exp: 9999999999,
    })
}

/// Extrae y valida el JWT del header `Authorization: Bearer <token>`.
pub fn extract_claims(
    state: &AppState,
    headers: &axum::http::HeaderMap,
) -> Result<Claims, (StatusCode, String)> {
    #[cfg(feature = "auth")]
    {
        let auth = headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        if !auth.starts_with("Bearer ") {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Falta token de autenticación".to_string(),
            ));
        }
        state
            .auth_use_cases
            .validate_jwt(&auth[7..])
            .map_err(|e| (StatusCode::UNAUTHORIZED, format!("Token inválido: {}", e)))
    }
    #[cfg(not(feature = "auth"))]
    {
        // Si auth está desactivado, devolvemos un claim de admin de prueba para no bloquear llamadas
        Ok(Claims {
            sub: "admin".to_string(),
            email: "admin@local.com".to_string(),
            name: "Local Admin (No Auth)".to_string(),
            picture: None,
            role: "admin".to_string(),
            exp: 9999999999,
        })
    }
}

/// Verifica que el rol sea `admin`.
#[allow(dead_code)]
pub fn require_admin(claims: &Claims) -> Result<(), (StatusCode, String)> {
    require_admin_role(&claims.role)
}

/// Verifica que el rol sea `admin` o `premium`.
/// Los viewers solo pueden consumir contenido global, no generar ni modificar.
#[allow(dead_code)]
pub fn require_premium(claims: &Claims) -> Result<(), (StatusCode, String)> {
    require_premium_role(&claims.role)
}

pub fn require_admin_role(role: &str) -> Result<(), (StatusCode, String)> {
    #[cfg(feature = "auth")]
    {
        if mod_shell::auth::AuthUseCases::is_admin_role(role) {
            return Ok(());
        }
    }
    #[cfg(not(feature = "auth"))]
    {
        let _ = role;
        return Ok(());
    }
    Err((StatusCode::FORBIDDEN, "Se requiere rol admin".to_string()))
}

pub fn require_premium_role(role: &str) -> Result<(), (StatusCode, String)> {
    #[cfg(feature = "auth")]
    {
        if mod_shell::auth::AuthUseCases::is_premium_role(role) {
            return Ok(());
        }
    }
    #[cfg(not(feature = "auth"))]
    {
        let _ = role;
        return Ok(());
    }
    Err((
        StatusCode::FORBIDDEN,
        "Se requiere plan Premium para esta acción".to_string(),
    ))
}

/// Resuelve el rol efectivo consultando DB/suscripción (no solo el JWT).
#[cfg(feature = "auth")]
pub async fn resolve_effective_role(state: &AppState, claims: &Claims) -> String {
    state
        .auth_use_cases
        .resolve_effective_role(&claims.email, &claims.role)
        .await
}

#[cfg(not(feature = "auth"))]
pub async fn resolve_effective_role(_state: &AppState, claims: &Claims) -> String {
    claims.role.clone()
}
