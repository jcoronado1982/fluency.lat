use crate::domain::models::subscription::SubscriptionPlan;
use crate::domain::repositories::payment::{PaymentProvider, PaymentRef};
use anyhow::Result;
use async_trait::async_trait;

/// Proveedor de pago nulo: no interactúa con ningún gateway externo.
///
/// Es la implementación activa cuando no hay `STRIPE_SECRET_KEY` (u otra clave)
/// configurada en el entorno. Permite el flujo de activación manual por admin
/// y facilita el desarrollo local sin dependencias externas de pago.
pub struct NullPaymentProvider;

#[async_trait]
impl PaymentProvider for NullPaymentProvider {
    fn name(&self) -> &str {
        "null"
    }

    async fn create_customer(&self, _email: &str) -> Result<String> {
        Ok(String::new())
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

    async fn cancel_subscription(&self, _external_subscription_id: &str) -> Result<()> {
        Ok(())
    }

    async fn get_checkout_url(
        &self,
        _customer_id: &str,
        _plan: &SubscriptionPlan,
        _return_url: &str,
    ) -> Result<String> {
        Ok(String::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn null_provider_never_fails_and_returns_empty_placeholders() {
        let provider = NullPaymentProvider;
        assert_eq!(provider.name(), "null");
        assert_eq!(
            provider.create_customer("guest@local.dev").await.unwrap(),
            ""
        );
        assert_eq!(
            provider
                .create_subscription("cust_1", &SubscriptionPlan::Monthly)
                .await
                .unwrap()
                .external_subscription_id,
            ""
        );
        assert!(provider.cancel_subscription("sub_1").await.is_ok());
        assert_eq!(
            provider
                .get_checkout_url(
                    "cust_1",
                    &SubscriptionPlan::Annual,
                    "https://fluency.lat/back"
                )
                .await
                .unwrap(),
            ""
        );
    }
}
