use crate::config::Settings;
use crate::domain::models::subscription::SubscriptionPlan;
use crate::domain::repositories::payment::{PaymentProvider, PaymentRef};
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use serde::Serialize;

const API_BASE: &str = "https://api.lemonsqueezy.com/v1";

/// Proveedor de pago LemonSqueezy.
///
/// LemonSqueezy no tiene un paso previo de "crear cliente"/"crear suscripción" al estilo
/// Stripe: el cliente y la suscripción los crea LemonSqueezy al completar el checkout, y nos
/// enteramos vía webhook (`api::endpoints::payments::lemonsqueezy_webhook`). Por eso:
/// - `create_customer` no hace HTTP: solo devuelve el email, que viaja como `customer_id` hasta
///   `get_checkout_url` (donde se usa como prefill del formulario de pago hospedado).
/// - `create_subscription` es casi un no-op: solo es alcanzable desde el flujo manual de admin
///   (`SubscriptionUseCases::activate`), que en un deployment con LemonSqueezy sigue siendo una
///   concesión local, no un cobro real — LemonSqueezy no permite crear una suscripción cobrada
///   sin pasar por su checkout.
/// - `cancel_subscription` y `get_checkout_url` sí llaman a la API real.
pub struct LemonSqueezyProvider {
    api_key: String,
    store_id: String,
    variant_monthly: String,
    variant_annual: String,
    client: reqwest::Client,
}

impl LemonSqueezyProvider {
    pub fn from_settings(settings: &Settings) -> Option<Self> {
        let api_key = settings
            .lemon_squeezy_api_key
            .as_ref()
            .filter(|k| !k.is_empty())?;
        let store_id = settings
            .lemon_squeezy_store_id
            .as_ref()
            .filter(|v| !v.is_empty())?;
        let variant_monthly = settings
            .lemon_squeezy_variant_monthly
            .as_ref()
            .filter(|v| !v.is_empty())?;
        let variant_annual = settings
            .lemon_squeezy_variant_annual
            .as_ref()
            .filter(|v| !v.is_empty())?;
        Some(Self {
            api_key: api_key.clone(),
            store_id: store_id.clone(),
            variant_monthly: variant_monthly.clone(),
            variant_annual: variant_annual.clone(),
            client: reqwest::Client::new(),
        })
    }

    fn variant_id_for(&self, plan: &SubscriptionPlan) -> &str {
        match plan {
            SubscriptionPlan::Monthly => &self.variant_monthly,
            SubscriptionPlan::Annual => &self.variant_annual,
        }
    }
}

#[derive(Serialize)]
struct CheckoutRequest {
    data: CheckoutData,
}

#[derive(Serialize)]
struct CheckoutData {
    #[serde(rename = "type")]
    kind: &'static str,
    attributes: CheckoutAttributes,
    relationships: CheckoutRelationships,
}

#[derive(Serialize)]
struct CheckoutAttributes {
    checkout_data: CheckoutCustomerData,
    product_options: CheckoutProductOptions,
}

#[derive(Serialize)]
struct CheckoutCustomerData {
    email: String,
    custom: CheckoutCustomFields,
}

/// Email de la CUENTA de Fluency. LemonSqueezy lo devuelve tal cual en `meta.custom_data` de
/// cada webhook, y es la única forma de saber a qué cuenta atar la suscripción: el comprador
/// puede cambiar el email del formulario y entonces `data.attributes.user_email` es otro.
#[derive(Serialize)]
struct CheckoutCustomFields {
    user_email: String,
}

#[derive(Serialize)]
struct CheckoutProductOptions {
    redirect_url: String,
}

#[derive(Serialize)]
struct CheckoutRelationships {
    store: Relationship,
    variant: Relationship,
}

#[derive(Serialize)]
struct Relationship {
    data: RelationshipData,
}

#[derive(Serialize)]
struct RelationshipData {
    #[serde(rename = "type")]
    kind: &'static str,
    id: String,
}

#[derive(Serialize)]
struct CancelSubscriptionRequest {
    data: CancelSubscriptionData,
}

#[derive(Serialize)]
struct CancelSubscriptionData {
    #[serde(rename = "type")]
    kind: &'static str,
    id: String,
    attributes: CancelSubscriptionAttributes,
}

#[derive(Serialize)]
struct CancelSubscriptionAttributes {
    cancelled: bool,
}

#[async_trait]
impl PaymentProvider for LemonSqueezyProvider {
    fn name(&self) -> &str {
        "lemonsqueezy"
    }

    async fn create_customer(&self, email: &str) -> Result<String> {
        Ok(email.to_string())
    }

    async fn create_subscription(
        &self,
        _customer_id: &str,
        _plan: &SubscriptionPlan,
    ) -> Result<PaymentRef> {
        Ok(PaymentRef {
            external_subscription_id: String::new(),
        })
    }

    async fn cancel_subscription(&self, external_subscription_id: &str) -> Result<()> {
        let url = format!("{API_BASE}/subscriptions/{external_subscription_id}");
        let body = CancelSubscriptionRequest {
            data: CancelSubscriptionData {
                kind: "subscriptions",
                id: external_subscription_id.to_string(),
                attributes: CancelSubscriptionAttributes { cancelled: true },
            },
        };

        let res = self
            .client
            .patch(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Accept", "application/vnd.api+json")
            .header("Content-Type", "application/vnd.api+json")
            .json(&body)
            .send()
            .await
            .context("LemonSqueezy: fallo al cancelar la suscripción")?;

        if !res.status().is_success() {
            let status = res.status();
            let detail = res.text().await.unwrap_or_default();
            return Err(anyhow!("LemonSqueezy HTTP {status}: {detail}"));
        }

        Ok(())
    }

    /// Genera una URL de checkout hospedado por LemonSqueezy. `customer_id` es en realidad el
    /// email (ver docstring del struct) y se usa como prefill; `return_url` es a dónde redirige
    /// LemonSqueezy tras el pago.
    async fn get_checkout_url(
        &self,
        customer_id: &str,
        plan: &SubscriptionPlan,
        return_url: &str,
    ) -> Result<String> {
        let variant_id = self.variant_id_for(plan);
        tracing::info!(
            customer_email = customer_id,
            store_id = %self.store_id,
            variant_id = %variant_id,
            return_url = return_url,
            "🌐 [LEMONSQUEEZY API REST] Enviando POST /v1/checkouts"
        );

        let body = CheckoutRequest {
            data: CheckoutData {
                kind: "checkouts",
                attributes: CheckoutAttributes {
                    checkout_data: CheckoutCustomerData {
                        email: customer_id.to_string(),
                        custom: CheckoutCustomFields {
                            user_email: customer_id.to_string(),
                        },
                    },
                    product_options: CheckoutProductOptions {
                        redirect_url: return_url.to_string(),
                    },
                },
                relationships: CheckoutRelationships {
                    store: Relationship {
                        data: RelationshipData {
                            kind: "stores",
                            id: self.store_id.clone(),
                        },
                    },
                    variant: Relationship {
                        data: RelationshipData {
                            kind: "variants",
                            id: variant_id.to_string(),
                        },
                    },
                },
            },
        };

        let res = self
            .client
            .post(format!("{API_BASE}/checkouts"))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Accept", "application/vnd.api+json")
            .header("Content-Type", "application/vnd.api+json")
            .json(&body)
            .send()
            .await
            .context("LemonSqueezy: fallo al crear el checkout")?;

        if !res.status().is_success() {
            let status = res.status();
            let detail = res.text().await.unwrap_or_default();
            tracing::error!(
                status = %status,
                detail = %detail,
                "❌ [LEMONSQUEEZY API ERROR] Respuesta no exitosa al crear checkout"
            );
            return Err(anyhow!("LemonSqueezy HTTP {status}: {detail}"));
        }

        let parsed: serde_json::Value = res
            .json()
            .await
            .context("LemonSqueezy: respuesta de checkout no es JSON válido")?;

        let url = parsed["data"]["attributes"]["url"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow!("LemonSqueezy: la respuesta de checkout no trae 'url'"))?;

        // La URL es un enlace de pago con token: fuera de los logs de producción.
        tracing::info!(
            customer_email = customer_id,
            "✅ [LEMONSQUEEZY API OK] URL de checkout recibida exitosamente"
        );
        tracing::debug!(checkout_url = %url, "LemonSqueezy: URL de checkout");

        Ok(url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider() -> LemonSqueezyProvider {
        LemonSqueezyProvider {
            api_key: "test_key".to_string(),
            store_id: "12345".to_string(),
            variant_monthly: "111".to_string(),
            variant_annual: "222".to_string(),
            client: reqwest::Client::new(),
        }
    }

    #[test]
    fn name_is_lemonsqueezy() {
        assert_eq!(provider().name(), "lemonsqueezy");
    }

    #[test]
    fn maps_each_plan_to_its_variant_id() {
        let provider = provider();
        assert_eq!(provider.variant_id_for(&SubscriptionPlan::Monthly), "111");
        assert_eq!(provider.variant_id_for(&SubscriptionPlan::Annual), "222");
    }

    #[tokio::test]
    async fn create_customer_echoes_the_email_without_http() {
        let email = provider().create_customer("guest@local.dev").await.unwrap();
        assert_eq!(email, "guest@local.dev");
    }

    #[tokio::test]
    async fn create_subscription_is_a_no_op() {
        let payment_ref = provider()
            .create_subscription("guest@local.dev", &SubscriptionPlan::Monthly)
            .await
            .unwrap();
        assert_eq!(payment_ref.external_subscription_id, "");
    }

    #[test]
    fn from_settings_requires_all_four_lemonsqueezy_fields() {
        let mut settings = base_settings();
        settings.lemon_squeezy_api_key = Some("key".to_string());
        // store_id, variant_monthly, variant_annual siguen ausentes.
        assert!(LemonSqueezyProvider::from_settings(&settings).is_none());

        settings.lemon_squeezy_store_id = Some("1".to_string());
        settings.lemon_squeezy_variant_monthly = Some("2".to_string());
        settings.lemon_squeezy_variant_annual = Some("3".to_string());
        assert!(LemonSqueezyProvider::from_settings(&settings).is_some());
    }

    fn base_settings() -> Settings {
        Settings {
            project_id: String::new(),
            region: String::new(),
            gcs_json_prefix: String::new(),
            gcs_images_prefix: String::new(),
            gcs_audio_prefix: String::new(),
            database_url: String::new(),
            gemini_api_key: None,
            image_ai_enabled: false,
            gemini_tts_api_key: None,
            gemini_image_api_key: None,
            gemini_tts_api_key_backup: None,
            gcp_api_key: None,
            comfy_url: String::new(),
            local_storage_path: String::new(),
            sync_to_oracle: false,
            oracle_repository_only: false,
            oracle_host: String::new(),
            oracle_ssh_password: String::new(),
            oracle_remote_path: String::new(),
            public_base_url: String::new(),
            media_delivery_provider: String::new(),
            elevenlabs_api_key: None,
            elevenlabs_model_id: None,
            lemon_squeezy_api_key: None,
            lemon_squeezy_store_id: None,
            lemon_squeezy_variant_monthly: None,
            lemon_squeezy_variant_annual: None,
            lemon_squeezy_webhook_secret: None,
            ollama_url: String::new(),
            local_agent_model: String::new(),
            local_agent_workspace_root: String::new(),
            local_agent_max_steps: 0,
            local_agent_allowed_command_prefixes: Vec::new(),
            is_production: false,
        }
    }
}
