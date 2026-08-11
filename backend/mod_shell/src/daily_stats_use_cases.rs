use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::Utc;
use fluency_core::domain::models::user_activity::DailyStats;
use fluency_core::ports::db_repository::{DailyStatsRepository, UserActivityRepository, UserRepository};
use tokio::time::interval;

const SNAPSHOT_INTERVAL_SECS: u64 = 24 * 60 * 60;

/// Snapshot diario de tracción (DAU, altas, total de usuarios) para el panel de admin.
/// Deliberadamente NO loguea eventos por usuario: agrega una sola fila por día a partir
/// de datos que ya existen (UserActivityStats, User), para no cargar la RAM/DB del servidor.
pub struct DailyStatsUseCases {
    daily_stats_repo: Arc<dyn DailyStatsRepository>,
}

impl DailyStatsUseCases {
    pub fn new(
        user_repo: Arc<dyn UserRepository>,
        activity_repo: Arc<dyn UserActivityRepository>,
        daily_stats_repo: Arc<dyn DailyStatsRepository>,
    ) -> Self {
        let sweep_user_repo = user_repo.clone();
        let sweep_activity_repo = activity_repo.clone();
        let sweep_daily_repo = daily_stats_repo.clone();

        tokio::spawn(async move {
            // Snapshot inmediato al arrancar: el admin ve datos sin esperar 24h.
            snapshot_today(&sweep_user_repo, &sweep_activity_repo, &sweep_daily_repo).await;

            let mut tick = interval(Duration::from_secs(SNAPSHOT_INTERVAL_SECS));
            tick.tick().await; // el primer tick de `interval` es inmediato
            loop {
                tick.tick().await;
                snapshot_today(&sweep_user_repo, &sweep_activity_repo, &sweep_daily_repo).await;
            }
        });

        Self { daily_stats_repo }
    }

    pub async fn list_daily_stats(&self, days: usize) -> Result<Vec<DailyStats>> {
        self.daily_stats_repo.list_daily_stats(days).await
    }
}

async fn snapshot_today(
    user_repo: &Arc<dyn UserRepository>,
    activity_repo: &Arc<dyn UserActivityRepository>,
    daily_stats_repo: &Arc<dyn DailyStatsRepository>,
) {
    let today = Utc::now().format("%Y-%m-%d").to_string();

    let users = match user_repo.list_all_users().await {
        Ok(users) => users,
        Err(e) => {
            tracing::warn!("⚠️ daily_stats: no se pudo listar usuarios: {e}");
            return;
        }
    };
    let stats_list = match activity_repo.get_all_stats().await {
        Ok(stats) => stats,
        Err(e) => {
            tracing::warn!("⚠️ daily_stats: no se pudo leer actividad: {e}");
            return;
        }
    };

    let now = Utc::now();
    let total_users = users.len() as i32;
    let new_signups = users
        .iter()
        .filter(|u| u.created_at.format("%Y-%m-%d").to_string() == today)
        .count() as i32;
    let dau = stats_list
        .iter()
        .filter(|s| s.last_study_date.as_deref() == Some(today.as_str()))
        .count() as i32;

    // Retención: usuarios registrados hace >7 días cuyo último estudio cae en los últimos 7.
    // Un solo pase en memoria sobre datos ya cargados arriba, sin queries extra.
    let retained_7d = users
        .iter()
        .filter(|u| (now - u.created_at).num_days() > 7)
        .filter(|u| {
            stats_list
                .iter()
                .find(|s| s.email == u.email)
                .and_then(|s| s.last_study_date.as_deref())
                .and_then(|date| chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok())
                .is_some_and(|last_study| (now.date_naive() - last_study).num_days() <= 7)
        })
        .count() as i32;

    let snapshot = DailyStats {
        date: today,
        dau,
        new_signups,
        total_users,
        retained_7d,
    };

    if let Err(e) = daily_stats_repo.upsert_daily_stats(snapshot).await {
        tracing::warn!("⚠️ daily_stats: no se pudo guardar snapshot: {e}");
    }
}
