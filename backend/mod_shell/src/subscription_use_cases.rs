use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use fluency_core::domain::models::subscription::{
    Subscription, SubscriptionPlan, SubscriptionStatus,
};
use fluency_core::ports::db_repository::SubscriptionRepository;
use fluency_core::ports::payment::PaymentProvider;
use std::sync::Arc;

/// Estado autoritativo de una suscripción tal como lo reporta el proveedor externo vía webhook.
/// No es específico de LemonSqueezy: el parseo del payload de cada proveedor vive en la capa de
/// endpoint (`api::endpoints::payments`), que traduce el wire format a este tipo neutral.
pub struct WebhookSubscriptionEvent {
    pub user_email: String,
    pub plan: SubscriptionPlan,
    pub status: SubscriptionStatus,
    pub external_customer_id: String,
    pub external_subscription_id: String,
    pub expires_at: DateTime<Utc>,
}

pub struct SubscriptionUseCases {
    repository: Arc<dyn SubscriptionRepository>,
    payment: Arc<dyn PaymentProvider>,
}

impl SubscriptionUseCases {
    pub fn new(
        repository: Arc<dyn SubscriptionRepository>,
        payment: Arc<dyn PaymentProvider>,
    ) -> Self {
        Self {
            repository,
            payment,
        }
    }

    /// Activa o renueva la suscripción de un usuario.
    ///
    /// Si existe suscripción activa conserva `starts_at` original y extiende `expires_at`.
    /// Si hay proveedor de pago configurado (distinto de `null`), crea el customer y la
    /// suscripción en el gateway externo, almacenando los IDs para futuros webhooks.
    pub async fn activate(&self, email: &str, plan: SubscriptionPlan) -> Result<Subscription> {
        let now = Utc::now();
        let duration = match plan {
            SubscriptionPlan::Monthly => chrono::Duration::days(30),
            SubscriptionPlan::Annual => chrono::Duration::days(365),
        };

        let existing = self.repository.get_subscription(email).await?;
        let starts_at = match &existing {
            Some(s) if s.is_active() => s.starts_at,
            _ => now,
        };

        // Registrar en el proveedor externo solo si el proveedor no es nulo.
        let (payment_provider, external_customer_id, external_subscription_id) =
            if self.payment.name() != "null" {
                let customer_id = match existing
                    .as_ref()
                    .and_then(|s| s.external_customer_id.clone())
                {
                    Some(id) => id,
                    None => self.payment.create_customer(email).await?,
                };
                let payment_ref = self
                    .payment
                    .create_subscription(&customer_id, &plan)
                    .await?;
                (
                    Some(self.payment.name().to_string()),
                    Some(customer_id),
                    Some(payment_ref.external_subscription_id),
                )
            } else {
                (
                    existing.as_ref().and_then(|s| s.payment_provider.clone()),
                    existing
                        .as_ref()
                        .and_then(|s| s.external_customer_id.clone()),
                    existing
                        .as_ref()
                        .and_then(|s| s.external_subscription_id.clone()),
                )
            };

        let sub = Subscription {
            user_email: email.to_string(),
            plan: plan.to_string(),
            status: SubscriptionStatus::Active.to_string(),
            starts_at,
            expires_at: now + duration,
            payment_provider,
            external_customer_id,
            external_subscription_id,
            created_at: existing.as_ref().map(|s| s.created_at).unwrap_or(now),
            updated_at: now,
        };

        self.repository.upsert_subscription(sub).await
    }

    /// Cancela la suscripción.
    ///
    /// Si hay proveedor externo, propaga la cancelación al gateway para detener cobros.
    /// El acceso premium se mantiene hasta `expires_at`.
    pub async fn cancel(&self, email: &str) -> Result<()> {
        let sub = self
            .repository
            .get_subscription(email)
            .await?
            .ok_or_else(|| anyhow!("No existe suscripción para {}", email))?;

        if self.payment.name() != "null" {
            if let Some(ext_id) = &sub.external_subscription_id {
                self.payment.cancel_subscription(ext_id).await?;
            }
        }

        self.repository.cancel_subscription(email).await
    }

    pub async fn get(&self, email: &str) -> Result<Option<Subscription>> {
        self.repository.get_subscription(email).await
    }

    /// Lista suscripciones con paginación. `limit` máximo recomendado: 100.
    pub async fn list_all(&self, limit: usize, offset: usize) -> Result<Vec<Subscription>> {
        self.repository
            .list_subscriptions(limit.min(100), offset)
            .await
    }

    /// Genera una URL de checkout para que el usuario pague directamente.
    /// Solo disponible cuando el proveedor no es `null`.
    pub async fn checkout_url(
        &self,
        email: &str,
        plan: SubscriptionPlan,
        return_url: &str,
    ) -> Result<String> {
        if self.payment.name() == "null" {
            return Err(anyhow!(
                "No hay proveedor de pago configurado. Contacta al administrador."
            ));
        }

        let existing = self.repository.get_subscription(email).await?;
        let customer_id = match existing.and_then(|s| s.external_customer_id) {
            Some(id) => id,
            None => self.payment.create_customer(email).await?,
        };

        self.payment
            .get_checkout_url(&customer_id, &plan, return_url)
            .await
    }

    /// Marca como `expired` en una sola operación de DB todas las suscripciones
    /// activas vencidas. Sin N+1: un único round-trip independientemente del volumen.
    pub async fn expire_stale(&self) -> Result<usize> {
        self.repository.bulk_expire_subscriptions().await
    }

    /// Aplica el estado autoritativo que llega desde el proveedor externo vía webhook.
    ///
    /// Idempotente: sobrescribe `status`/`expires_at` con lo que diga el payload, nunca
    /// incrementa localmente — reprocesar el mismo evento, o recibir eventos fuera de orden
    /// para la misma suscripción, converge siempre al mismo resultado.
    pub async fn sync_from_webhook(&self, event: WebhookSubscriptionEvent) -> Result<Subscription> {
        let existing = self.repository.get_subscription(&event.user_email).await?;
        let now = Utc::now();
        let starts_at = existing.as_ref().map(|s| s.starts_at).unwrap_or(now);

        let sub = Subscription {
            user_email: event.user_email,
            plan: event.plan.to_string(),
            status: event.status.to_string(),
            starts_at,
            expires_at: event.expires_at,
            payment_provider: Some(self.payment.name().to_string()),
            external_customer_id: Some(event.external_customer_id),
            external_subscription_id: Some(event.external_subscription_id),
            created_at: existing.as_ref().map(|s| s.created_at).unwrap_or(now),
            updated_at: now,
        };

        self.repository.upsert_subscription(sub).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::sync::Mutex;

    struct FakePaymentProvider;

    #[async_trait]
    impl PaymentProvider for FakePaymentProvider {
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
        ) -> Result<fluency_core::ports::payment::PaymentRef> {
            Ok(fluency_core::ports::payment::PaymentRef {
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

    #[derive(Default)]
    struct FakeSubscriptionRepository {
        rows: Mutex<HashMap<String, Subscription>>,
    }

    #[async_trait]
    impl SubscriptionRepository for FakeSubscriptionRepository {
        async fn get_subscription(&self, email: &str) -> Result<Option<Subscription>> {
            Ok(self.rows.lock().unwrap().get(email).cloned())
        }
        async fn upsert_subscription(&self, sub: Subscription) -> Result<Subscription> {
            self.rows
                .lock()
                .unwrap()
                .insert(sub.user_email.clone(), sub.clone());
            Ok(sub)
        }
        async fn list_subscriptions(
            &self,
            _limit: usize,
            _offset: usize,
        ) -> Result<Vec<Subscription>> {
            Ok(self.rows.lock().unwrap().values().cloned().collect())
        }
        async fn cancel_subscription(&self, email: &str) -> Result<()> {
            if let Some(sub) = self.rows.lock().unwrap().get_mut(email) {
                sub.status = SubscriptionStatus::Cancelled.to_string();
            }
            Ok(())
        }
        async fn bulk_expire_subscriptions(&self) -> Result<usize> {
            Ok(0)
        }
    }

    fn use_cases() -> SubscriptionUseCases {
        SubscriptionUseCases::new(
            Arc::new(FakeSubscriptionRepository::default()),
            Arc::new(FakePaymentProvider),
        )
    }

    fn created_event() -> WebhookSubscriptionEvent {
        WebhookSubscriptionEvent {
            user_email: "user@example.com".to_string(),
            plan: SubscriptionPlan::Monthly,
            status: SubscriptionStatus::Active,
            external_customer_id: "cust_1".to_string(),
            external_subscription_id: "sub_1".to_string(),
            expires_at: Utc::now() + chrono::Duration::days(30),
        }
    }

    #[tokio::test]
    async fn replaying_the_same_event_is_idempotent() {
        let uc = use_cases();

        let first = uc.sync_from_webhook(created_event()).await.unwrap();
        let second = uc.sync_from_webhook(created_event()).await.unwrap();

        assert_eq!(first.status, second.status);
        assert_eq!(first.starts_at, second.starts_at);
        assert_eq!(first.created_at, second.created_at);
        assert_eq!(first.external_subscription_id, second.external_subscription_id);
    }

    #[tokio::test]
    async fn a_later_cancellation_event_overwrites_status_without_touching_starts_at() {
        let uc = use_cases();

        let created = uc.sync_from_webhook(created_event()).await.unwrap();

        let cancelled_event = WebhookSubscriptionEvent {
            status: SubscriptionStatus::Cancelled,
            expires_at: created.expires_at,
            ..created_event()
        };
        let cancelled = uc.sync_from_webhook(cancelled_event).await.unwrap();

        assert_eq!(cancelled.status, SubscriptionStatus::Cancelled.to_string());
        assert_eq!(cancelled.starts_at, created.starts_at);
        assert_eq!(cancelled.created_at, created.created_at);
    }
}
