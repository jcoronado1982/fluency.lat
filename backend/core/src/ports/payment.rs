use crate::domain::models::subscription::SubscriptionPlan;
use anyhow::Result;
use async_trait::async_trait;

/// Referencia opaca devuelta por el proveedor al crear una suscripción externa.
pub struct PaymentRef {
    pub external_subscription_id: String,
}

/// Port de pago: abstracción que permite intercambiar LemonSqueezy, Stripe, PayPal
/// u otro gateway sin modificar la capa de aplicación (OCP + DIP).
///
/// La implementación activa se inyecta en `SubscriptionUseCases` desde `main.rs`.
/// Cuando no hay proveedor configurado se usa `NullPaymentProvider`, que permite
/// el flujo de activación manual por parte de un admin.
#[async_trait]
pub trait PaymentProvider: Send + Sync {
    /// Identificador del proveedor ("lemonsqueezy", "stripe", "null", …).
    fn name(&self) -> &str;

    /// Crea o recupera un cliente en el proveedor externo.
    /// Devuelve el `external_customer_id` para almacenar en `Subscription`.
    async fn create_customer(&self, email: &str) -> Result<String>;

    /// Crea una suscripción recurrente en el proveedor externo.
    /// Devuelve una `PaymentRef` con el `external_subscription_id`.
    async fn create_subscription(
        &self,
        customer_id: &str,
        plan: &SubscriptionPlan,
    ) -> Result<PaymentRef>;

    /// Cancela la suscripción en el proveedor externo.
    /// El acceso local se mantiene hasta `expires_at`; el proveedor deja de cobrar.
    async fn cancel_subscription(&self, external_subscription_id: &str) -> Result<()>;

    /// Genera una URL de pago/checkout (p. ej. Stripe Checkout Session).
    /// `return_url` es a donde redirigir al usuario después del pago.
    async fn get_checkout_url(
        &self,
        customer_id: &str,
        plan: &SubscriptionPlan,
        return_url: &str,
    ) -> Result<String>;
}
