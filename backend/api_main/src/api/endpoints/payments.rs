use crate::api::middleware::auth::extract_claims;
use crate::domain::models::subscription::{SubscriptionPlan, SubscriptionStatus};
use crate::AppState;
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use mod_shell::subscription_use_cases::WebhookSubscriptionEvent;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateCheckoutSessionBody {
    pub plan: String,
}

#[derive(Serialize)]
pub struct CheckoutSessionResponse {
    pub checkout_url: String,
}

/// Subconjunto de `data.attributes` que nos interesa de un evento de suscripción de
/// LemonSqueezy. Ver https://docs.lemonsqueezy.com/help/webhooks#event-types.
#[derive(Deserialize)]
struct LemonSqueezySubscriptionAttributes {
    variant_id: i64,
    customer_id: i64,
    user_email: String,
    status: String,
    renews_at: Option<DateTime<Utc>>,
    ends_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
struct LemonSqueezyWebhookData {
    id: String,
    attributes: LemonSqueezySubscriptionAttributes,
}

#[derive(Deserialize)]
struct LemonSqueezyWebhookMeta {
    event_name: String,
    /// Eco de `checkout_data.custom` que enviamos al crear el checkout
    /// (`LemonSqueezyProvider::get_checkout_url`).
    #[serde(default)]
    custom_data: Option<LemonSqueezyCustomData>,
}

/// El comprador PUEDE cambiar el email en el checkout hospedado de LemonSqueezy, así que
/// `data.attributes.user_email` no identifica la cuenta de Fluency: si difiere, la suscripción
/// quedaría atada a un email sin cuenta y el usuario pagaría sin volverse premium. Por eso el
/// checkout viaja con el email de los claims en `custom_data` y este es el campo autoritativo.
#[derive(Deserialize)]
struct LemonSqueezyCustomData {
    #[serde(default)]
    user_email: Option<String>,
}

#[derive(Deserialize)]
struct LemonSqueezyWebhookPayload {
    meta: LemonSqueezyWebhookMeta,
    data: LemonSqueezyWebhookData,
}

/// Eventos de ciclo de vida de suscripción: el payload trae el estado *completo* actual,
/// no un delta, así que despacharlos todos a `sync_from_webhook` es naturalmente idempotente.
/// `subscription_payment_success`/`_failed` se excluden a propósito: `subscription_updated`
/// ya trae el status/renews_at autoritativo del mismo evento de cobro.
const HANDLED_EVENTS: &[&str] = &[
    "subscription_created",
    "subscription_updated",
    "subscription_cancelled",
    "subscription_resumed",
    "subscription_expired",
    "subscription_paused",
    "subscription_unpaused",
];

/// Origen al que LemonSqueezy devuelve al usuario después de pagar.
///
/// El header `Origin` lo controla el cliente, así que NO puede viajar tal cual a LemonSqueezy:
/// sería un redirect abierto hacia un dominio ajeno. Se acepta solo si coincide con
/// `PUBLIC_BASE_URL` o si es un host de desarrollo local (`npm run dev`); cualquier otro valor
/// cae al configurado. Sin este ajuste, `PUBLIC_BASE_URL` de prod rompía el checkout en local.
fn resolve_return_origin(configured_base_url: &str, origin_header: Option<&str>) -> String {
    let configured = configured_base_url.trim_end_matches('/').to_string();

    let Some(origin) = origin_header
        .map(|s| s.trim().trim_end_matches('/'))
        .filter(|s| !s.is_empty())
    else {
        return configured;
    };

    if origin.eq_ignore_ascii_case(&configured) || is_local_dev_origin(origin) {
        return origin.to_string();
    }

    tracing::warn!(
        origin = %origin,
        "⚠️ Origin no permitido para el retorno del checkout; se usa PUBLIC_BASE_URL"
    );
    configured
}

/// `http://localhost:PUERTO` / `http://127.0.0.1:PUERTO` — el Vite del frontend en desarrollo.
fn is_local_dev_origin(origin: &str) -> bool {
    let host = origin
        .strip_prefix("http://")
        .or_else(|| origin.strip_prefix("https://"))
        .unwrap_or(origin);
    let host = host.split('/').next().unwrap_or(host);
    let host = host.split(':').next().unwrap_or(host);
    matches!(host, "localhost" | "127.0.0.1")
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/// POST /api/checkout/session
/// Crea una sesión de checkout de LemonSqueezy para el plan indicado. JWT requerido: el email
/// se toma de los claims, nunca del cliente, para que la suscripción quede atada a la cuenta.
pub async fn create_checkout_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateCheckoutSessionBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    tracing::info!(
        email = %claims.email,
        raw_plan = %body.plan,
        "💳 [PASO 1/3] Solicitud de checkout recibida"
    );

    let plan = body.plan.parse::<SubscriptionPlan>().map_err(|_| {
        tracing::warn!(email = %claims.email, raw_plan = %body.plan, "⚠️ Plan de suscripción inválido");
        (
            StatusCode::BAD_REQUEST,
            format!("Plan inválido: '{}'. Use 'monthly' o 'annual'", body.plan),
        )
    })?;

    let return_url = format!(
        "{}/checkout?status=success",
        resolve_return_origin(
            &state.settings.public_base_url,
            headers.get("origin").and_then(|h| h.to_str().ok()),
        )
    );
    tracing::info!(
        email = %claims.email,
        plan = ?plan,
        return_url = %return_url,
        "💳 [PASO 2/3] Solicitando URL de checkout a LemonSqueezy API"
    );

    let checkout_url = state
        .subscription_use_cases
        .checkout_url(&claims.email, plan, &return_url)
        .await
        .map_err(|e| {
            tracing::error!(email = %claims.email, error = %e, "❌ [PASO 3/3 ERROR] Fallo al generar la sesión de checkout");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    // La URL de checkout es un enlace de pago con token: se registra en debug, no en los
    // logs de producción.
    tracing::info!(
        email = %claims.email,
        "✅ [PASO 3/3 OK] URL de checkout generada exitosamente"
    );
    tracing::debug!(email = %claims.email, checkout_url = %checkout_url, "URL de checkout");

    Ok(Json(CheckoutSessionResponse { checkout_url }))
}

/// POST /api/webhooks/lemonsqueezy
/// Recibe eventos de suscripción de LemonSqueezy. Verificado por firma HMAC-SHA256
/// (header `X-Signature`), sin JWT — lo llama LemonSqueezy directamente, no el frontend.
pub async fn lemonsqueezy_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("🔔 [WEBHOOK PASO 1/5] Evento HTTP recibido en /api/webhooks/lemonsqueezy");

    let secret = state
        .settings
        .lemon_squeezy_webhook_secret
        .as_deref()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            tracing::error!(
                "❌ [WEBHOOK ERROR] Falta LEMON_SQUEEZY_WEBHOOK_SECRET en configuración"
            );
            (
                StatusCode::UNAUTHORIZED,
                "Webhook de LemonSqueezy no configurado (falta LEMON_SQUEEZY_WEBHOOK_SECRET)"
                    .to_string(),
            )
        })?;

    let signature = headers
        .get("X-Signature")
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| {
            tracing::error!("❌ [WEBHOOK ERROR] Header X-Signature ausente en la petición");
            (
                StatusCode::UNAUTHORIZED,
                "Falta el header X-Signature".to_string(),
            )
        })?;

    if !verify_signature(secret, &body, signature) {
        tracing::error!("❌ [WEBHOOK ERROR] Firma HMAC-SHA256 no coincide (petición rechazada)");
        return Err((
            StatusCode::UNAUTHORIZED,
            "Firma de webhook inválida".to_string(),
        ));
    }
    tracing::info!("🔒 [WEBHOOK PASO 2/5] Firma HMAC-SHA256 validada correctamente");

    let payload: LemonSqueezyWebhookPayload = serde_json::from_slice(&body).map_err(|e| {
        tracing::error!(error = %e, "❌ [WEBHOOK ERROR] Imposible deserializar payload de LemonSqueezy");
        (
            StatusCode::BAD_REQUEST,
            format!("Payload de webhook inválido: {e}"),
        )
    })?;

    tracing::info!(
        event_name = %payload.meta.event_name,
        subscription_id = %payload.data.id,
        user_email = %payload.data.attributes.user_email,
        "📦 [WEBHOOK PASO 3/5] Evento de suscripción identificado"
    );

    if !HANDLED_EVENTS.contains(&payload.meta.event_name.as_str()) {
        tracing::info!(
            event = %payload.meta.event_name,
            "ℹ️ [WEBHOOK IGNORED] Evento no requiere cambio de estado (omitido de forma segura)"
        );
        return Ok(Json(serde_json::json!({ "ok": true })));
    }

    let attrs = &payload.data.attributes;
    let plan = plan_for_variant(&state, attrs.variant_id).ok_or_else(|| {
        tracing::error!(
            variant_id = attrs.variant_id,
            "❌ [WEBHOOK ERROR] Variant ID no registrado en backend"
        );
        (
            StatusCode::BAD_REQUEST,
            format!(
                "variant_id {} no coincide con ningún plan configurado",
                attrs.variant_id
            ),
        )
    })?;

    // Email de la CUENTA (claims del JWT que creó el checkout), no el que el comprador haya
    // escrito en el formulario de LemonSqueezy — ver `LemonSqueezyCustomData`.
    let account_email = account_email_for(&payload);
    let mapped_status = map_status(&attrs.status);
    tracing::info!(
        user_email = %account_email,
        buyer_email = %attrs.user_email,
        plan = ?plan,
        raw_status = %attrs.status,
        mapped_status = ?mapped_status,
        "🔄 [WEBHOOK PASO 4/5] Mapeando estado de suscripción para sincronización"
    );

    let event = WebhookSubscriptionEvent {
        user_email: account_email.clone(),
        plan,
        status: mapped_status.clone(),
        external_customer_id: attrs.customer_id.to_string(),
        external_subscription_id: payload.data.id.clone(),
        expires_at: attrs.ends_at.or(attrs.renews_at).unwrap_or_else(Utc::now),
    };

    state
        .subscription_use_cases
        .sync_from_webhook(event)
        .await
        .map_err(|e| {
            tracing::error!(user_email = %account_email, error = %e, "❌ [WEBHOOK PASO 5/5 ERROR] Fallo al guardar en base de datos");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    tracing::info!(
        user_email = %account_email,
        subscription_id = %payload.data.id,
        status = ?mapped_status,
        "✅ [WEBHOOK PASO 5/5 OK] Estado de suscripción persistido en SurrealDB exitosamente"
    );

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Email con el que se guarda la suscripción: `meta.custom_data.user_email` (el de la cuenta,
/// que nosotros mandamos al crear el checkout) y, si falta —checkouts creados antes de que
/// enviáramos `custom`, o desde el dashboard de LemonSqueezy—, el del comprador.
fn account_email_for(payload: &LemonSqueezyWebhookPayload) -> String {
    payload
        .meta
        .custom_data
        .as_ref()
        .and_then(|c| c.user_email.as_deref())
        .map(str::trim)
        .filter(|e| !e.is_empty())
        .unwrap_or_else(|| payload.data.attributes.user_email.trim())
        .to_string()
}

fn plan_for_variant(state: &AppState, variant_id: i64) -> Option<SubscriptionPlan> {
    let variant_id = variant_id.to_string();
    if state.settings.lemon_squeezy_variant_monthly.as_deref() == Some(variant_id.as_str()) {
        Some(SubscriptionPlan::Monthly)
    } else if state.settings.lemon_squeezy_variant_annual.as_deref() == Some(variant_id.as_str()) {
        Some(SubscriptionPlan::Annual)
    } else {
        None
    }
}

/// LemonSqueezy: `on_trial`/`active` ⇒ Active, `cancelled` ⇒ Cancelled, `expired` ⇒ Expired.
/// Cualquier otro estado (`paused`, `past_due`, `unpaid`) se mapea a `Cancelled` — revocar
/// acceso premium ante un estado no reconocido es más seguro que otorgarlo por defecto.
fn map_status(status: &str) -> SubscriptionStatus {
    match status {
        "active" | "on_trial" => SubscriptionStatus::Active,
        "cancelled" => SubscriptionStatus::Cancelled,
        "expired" => SubscriptionStatus::Expired,
        other => {
            tracing::warn!(
                status = other,
                "LemonSqueezy: estado no reconocido, tratado como Cancelled"
            );
            SubscriptionStatus::Cancelled
        }
    }
}

fn verify_signature(secret: &str, body: &[u8], header_hex: &str) -> bool {
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(body);
    let Ok(sig_bytes) = hex::decode(header_hex) else {
        return false;
    };
    mac.verify_slice(&sig_bytes).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_signature_accepts_a_correctly_signed_body() {
        let secret = "whsec_test";
        let body = b"{\"meta\":{}}";
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        let signature = hex::encode(mac.finalize().into_bytes());

        assert!(verify_signature(secret, body, &signature));
    }

    #[test]
    fn verify_signature_rejects_a_tampered_body() {
        let secret = "whsec_test";
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(b"{\"meta\":{}}");
        let signature = hex::encode(mac.finalize().into_bytes());

        assert!(!verify_signature(
            secret,
            b"{\"meta\":{\"tampered\":true}}",
            &signature
        ));
    }

    #[test]
    fn verify_signature_rejects_malformed_hex() {
        assert!(!verify_signature("whsec_test", b"{}", "not-hex"));
    }

    fn webhook_payload(
        buyer_email: &str,
        custom_email: Option<&str>,
    ) -> LemonSqueezyWebhookPayload {
        let custom = match custom_email {
            Some(email) => format!(",\"custom_data\":{{\"user_email\":\"{email}\"}}"),
            None => String::new(),
        };
        let raw = format!(
            r#"{{"meta":{{"event_name":"subscription_created"{custom}}},
                 "data":{{"id":"42","attributes":{{"variant_id":1,"customer_id":2,
                 "user_email":"{buyer_email}","status":"active",
                 "renews_at":null,"ends_at":null}}}}}}"#
        );
        serde_json::from_str(&raw).expect("payload de prueba válido")
    }

    // Regresión: el comprador puede cambiar el email en el checkout hospedado; la suscripción
    // debe quedar atada a la cuenta que inició el pago, no a lo que se escriba en el formulario.
    #[test]
    fn account_email_prefers_custom_data_over_the_buyer_email() {
        let payload = webhook_payload("otro@correo.com", Some("cuenta@fluency.lat"));
        assert_eq!(account_email_for(&payload), "cuenta@fluency.lat");
    }

    #[test]
    fn account_email_falls_back_to_the_buyer_email_without_custom_data() {
        let payload = webhook_payload("comprador@correo.com", None);
        assert_eq!(account_email_for(&payload), "comprador@correo.com");

        let payload = webhook_payload("comprador@correo.com", Some("   "));
        assert_eq!(account_email_for(&payload), "comprador@correo.com");
    }

    #[test]
    fn return_origin_accepts_the_configured_base_url_and_local_dev() {
        assert_eq!(
            resolve_return_origin("https://fluency.lat", Some("https://fluency.lat")),
            "https://fluency.lat"
        );
        assert_eq!(
            resolve_return_origin("https://fluency.lat/", Some("https://fluency.lat/")),
            "https://fluency.lat"
        );
        assert_eq!(
            resolve_return_origin("https://fluency.lat", Some("http://localhost:5173")),
            "http://localhost:5173"
        );
        assert_eq!(
            resolve_return_origin("https://fluency.lat", Some("http://127.0.0.1:4173")),
            "http://127.0.0.1:4173"
        );
    }

    // Un `Origin` ajeno no puede convertirse en el destino post-pago (redirect abierto).
    #[test]
    fn return_origin_rejects_foreign_origins_and_falls_back_to_the_configured_one() {
        assert_eq!(
            resolve_return_origin("https://fluency.lat", Some("https://atacante.tld")),
            "https://fluency.lat"
        );
        assert_eq!(
            resolve_return_origin(
                "https://fluency.lat",
                Some("https://fluency.lat.atacante.tld")
            ),
            "https://fluency.lat"
        );
        assert_eq!(
            resolve_return_origin("https://fluency.lat", Some("http://localhost.atacante.tld")),
            "https://fluency.lat"
        );
        assert_eq!(
            resolve_return_origin("https://fluency.lat", None),
            "https://fluency.lat"
        );
        assert_eq!(
            resolve_return_origin("https://fluency.lat", Some("  ")),
            "https://fluency.lat"
        );
    }

    #[test]
    fn map_status_defaults_unrecognized_states_to_cancelled() {
        assert_eq!(map_status("active"), SubscriptionStatus::Active);
        assert_eq!(map_status("on_trial"), SubscriptionStatus::Active);
        assert_eq!(map_status("cancelled"), SubscriptionStatus::Cancelled);
        assert_eq!(map_status("expired"), SubscriptionStatus::Expired);
        assert_eq!(map_status("past_due"), SubscriptionStatus::Cancelled);
        assert_eq!(map_status("paused"), SubscriptionStatus::Cancelled);
    }
}
