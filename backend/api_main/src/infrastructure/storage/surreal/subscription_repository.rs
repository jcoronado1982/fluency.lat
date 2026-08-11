use super::connection::SurrealConnection;
use crate::domain::models::subscription::Subscription;
use crate::domain::repositories::db_repository::SubscriptionRepository;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use std::sync::Arc;
use surrealdb::types::SurrealValue;

pub struct SurrealSubscriptionRepository(pub Arc<SurrealConnection>);

// Lee/escribe con el mismo derive(SurrealValue) directo en todos los campos
// (datetimes nativos), a diferencia de SerdeWrapper: envolver una STRUCT
// entera en SerdeWrapper serializa sus campos chrono::DateTime<Utc> como
// STRING (puente serde genérico), pero un bind individual o un derive
// directo produce un Value::Datetime nativo — mezclar ambos en la misma
// fila revienta la deserialización de lectura. Ver
// scripts/troubleshooting_library.skill.md entrada 5.
#[derive(SurrealValue)]
struct SurrealSubscription {
    user_email: String,
    plan: String,
    status: String,
    starts_at: chrono::DateTime<chrono::Utc>,
    expires_at: chrono::DateTime<chrono::Utc>,
    payment_provider: Option<String>,
    external_customer_id: Option<String>,
    external_subscription_id: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<SurrealSubscription> for Subscription {
    fn from(value: SurrealSubscription) -> Self {
        Subscription {
            user_email: value.user_email,
            plan: value.plan,
            status: value.status,
            starts_at: value.starts_at,
            expires_at: value.expires_at,
            payment_provider: value.payment_provider,
            external_customer_id: value.external_customer_id,
            external_subscription_id: value.external_subscription_id,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

impl From<Subscription> for SurrealSubscription {
    fn from(sub: Subscription) -> Self {
        SurrealSubscription {
            user_email: sub.user_email,
            plan: sub.plan,
            status: sub.status,
            starts_at: sub.starts_at,
            expires_at: sub.expires_at,
            payment_provider: sub.payment_provider,
            external_customer_id: sub.external_customer_id,
            external_subscription_id: sub.external_subscription_id,
            created_at: sub.created_at,
            updated_at: sub.updated_at,
        }
    }
}

#[async_trait]
impl SubscriptionRepository for SurrealSubscriptionRepository {
    async fn get_subscription(&self, email: &str) -> Result<Option<Subscription>> {
        let mut res = self
            .0
            .db()
            .query("SELECT * FROM type::record('subscription', $email)")
            .bind(("email", email))
            .await?;
        let sub: Option<SurrealSubscription> = res.take(0)?;
        Ok(sub.map(Into::into))
    }

    async fn upsert_subscription(&self, sub: Subscription) -> Result<Subscription> {
        let email = sub.user_email.clone();
        let data: SurrealSubscription = sub.into();

        let mut res = self
            .0
            .db()
            .query(
                "
            UPSERT type::record('subscription', $email) CONTENT $data;
            SELECT * FROM type::record('subscription', $email);
        ",
            )
            .bind(("email", email))
            .bind(("data", data))
            .await?;
        let updated: Option<SurrealSubscription> = res.take(1)?;
        updated
            .map(Into::into)
            .ok_or_else(|| anyhow!("Failed to upsert subscription"))
    }

    async fn list_subscriptions(&self, limit: usize, offset: usize) -> Result<Vec<Subscription>> {
        let mut res = self
            .0
            .db()
            .query("SELECT * FROM subscription ORDER BY created_at DESC LIMIT $limit START $offset")
            .bind(("limit", limit))
            .bind(("offset", offset))
            .await?;
        let subs: Vec<SurrealSubscription> = res.take(0)?;
        Ok(subs.into_iter().map(Into::into).collect())
    }

    async fn cancel_subscription(&self, email: &str) -> Result<()> {
        self.0
            .db()
            .query(
                "UPDATE type::record('subscription', $email) SET status = 'cancelled', updated_at = time::now();",
            )
            .bind(("email", email))
            .await?;
        Ok(())
    }

    async fn bulk_expire_subscriptions(&self) -> Result<usize> {
        let mut res = self
            .0
            .db()
            .query(
                "UPDATE subscription SET status = 'expired', updated_at = time::now()
             WHERE status = 'active' AND expires_at < time::now();",
            )
            .await?;
        let updated: Vec<SurrealSubscription> = res.take(0).unwrap_or_default();
        Ok(updated.len())
    }
}
