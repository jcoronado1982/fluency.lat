use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SubscriptionPlan {
    Monthly,
    Annual,
}

impl std::fmt::Display for SubscriptionPlan {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SubscriptionPlan::Monthly => write!(f, "monthly"),
            SubscriptionPlan::Annual => write!(f, "annual"),
        }
    }
}

impl std::str::FromStr for SubscriptionPlan {
    type Err = ();
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "monthly" => Ok(SubscriptionPlan::Monthly),
            "annual" => Ok(SubscriptionPlan::Annual),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SubscriptionStatus {
    Active,
    Cancelled,
    Expired,
}

impl std::fmt::Display for SubscriptionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SubscriptionStatus::Active => write!(f, "active"),
            SubscriptionStatus::Cancelled => write!(f, "cancelled"),
            SubscriptionStatus::Expired => write!(f, "expired"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub user_email: String,
    pub plan: String,
    pub status: String,
    pub starts_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    /// Nombre del proveedor de pago activo: "stripe", "paypal", etc.
    /// None cuando la activación fue manual (admin).
    pub payment_provider: Option<String>,
    /// ID del cliente en el proveedor externo (agnóstico al proveedor).
    pub external_customer_id: Option<String>,
    /// ID de la suscripción en el proveedor externo.
    pub external_subscription_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Subscription {
    pub fn is_active(&self) -> bool {
        self.status == SubscriptionStatus::Active.to_string() && self.expires_at > Utc::now()
    }
}
