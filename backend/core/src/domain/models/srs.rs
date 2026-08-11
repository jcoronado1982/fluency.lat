use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Estado SRS calculado íntegramente por el cliente.
/// El backend solo valida, almacena y devuelve estos valores.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SrsSchedule {
    pub box_level: i32,
    pub ease_factor: f64,
    pub interval_days: f64,
    pub next_review_at: Option<DateTime<Utc>>,
}

/// Cambio de progreso de una tarjeta. `srs` ausente conserva el flujo libre.
#[derive(Debug, Clone)]
pub struct CardProgressUpdate {
    pub card_index: i32,
    pub learned: bool,
    pub srs: Option<SrsSchedule>,
}

/// Proyección mínima para que el cliente construya el mazo diario.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SrsReviewCandidate {
    pub category: String,
    pub deck: String,
    pub card_index: i32,
    pub learned: bool,
    pub box_level: Option<i32>,
    pub ease_factor: Option<f64>,
    pub interval_days: Option<f64>,
    pub next_review_at: Option<DateTime<Utc>>,
}
