use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ClientInfo {
    pub device_type: String,
    pub browser: String,
    pub os: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct UserActivityStats {
    pub email: String,
    pub visit_count: i32,
    pub total_duration_secs: i64,
    pub last_device_type: Option<String>,
    pub last_browser: Option<String>,
    pub last_os: Option<String>,
    /// Stored for geo lookup only — never exposed in admin API responses.
    pub last_ip: Option<String>,
    pub last_country: Option<String>,
    /// UTC calendar date (YYYY-MM-DD) of the last recorded study session.
    pub last_study_date: Option<String>,
    pub current_streak: i32,
    pub longest_streak: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct LearningLevelStats {
    pub level: String,
    pub mastered_count: i32,
    pub target_count: i32,
    pub cumulative_mastered: i32,
    pub cumulative_target: i32,
    pub completed: bool,
    pub premium: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeckProgressInfo {
    pub category: String,
    pub deck: String,
    pub learned_count: i32,
    pub total_count: i32,
    pub last_touched: Option<chrono::DateTime<chrono::Utc>>,
    pub first_image_path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct LearningStats {
    pub mastered_count: i32,
    pub target_count: i32,
    pub target_label: String,
    pub percent: i32,
    pub current_level: String,
    pub level_percent: i32,
    pub levels: Vec<LearningLevelStats>,
    pub streak_days: i32,
    pub days_since_last_study: Option<i64>,
    pub longest_streak: i32,
    pub studied_today: bool,
    pub streak_at_risk: bool,
    #[serde(default)]
    pub decks_progress: Vec<DeckProgressInfo>,
}

/// B2 receptive vocabulary benchmark used for the dashboard progress ring.
pub const B2_VOCABULARY_TARGET: i32 = 2500;

pub fn compute_streak_display(
    last_study_date: Option<&str>,
    stored_streak: i32,
    today: &str,
    yesterday: &str,
) -> (i32, bool, bool) {
    match last_study_date {
        Some(date) if date == today => (stored_streak.max(0), true, false),
        Some(date) if date == yesterday => (stored_streak.max(0), false, stored_streak > 0),
        Some(_) => (0, false, false),
        None => (0, false, false),
    }
}

pub fn compute_days_since_last_study(last_study_date: Option<&str>, today: &str) -> Option<i64> {
    let last_study_date = last_study_date?;
    let last = chrono::NaiveDate::parse_from_str(last_study_date, "%Y-%m-%d").ok()?;
    let today = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d").ok()?;
    Some((today - last).num_days().max(0))
}

pub fn build_learning_stats(
    mastered_count: i32,
    target_count: i32,
    target_label: &str,
    current_level: &str,
    level_percent: i32,
    levels: Vec<LearningLevelStats>,
    last_study_date: Option<&str>,
    stored_streak: i32,
    longest_streak: i32,
    today: &str,
    yesterday: &str,
) -> LearningStats {
    let (streak_days, studied_today, streak_at_risk) =
        compute_streak_display(last_study_date, stored_streak, today, yesterday);
    let days_since_last_study = compute_days_since_last_study(last_study_date, today);
    let percent = if target_count <= 0 {
        0
    } else {
        ((mastered_count as f64 / target_count as f64) * 100.0).round() as i32
    };

    LearningStats {
        mastered_count,
        target_count,
        target_label: target_label.to_string(),
        percent: percent.min(100),
        current_level: current_level.to_string(),
        level_percent: level_percent.clamp(0, 100),
        levels,
        streak_days,
        days_since_last_study,
        longest_streak,
        studied_today,
        streak_at_risk,
        decks_progress: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn streak_is_active_when_studied_today() {
        let (days, today, at_risk) =
            compute_streak_display(Some("2026-06-23"), 5, "2026-06-23", "2026-06-22");
        assert_eq!(days, 5);
        assert!(today);
        assert!(!at_risk);
    }

    #[test]
    fn streak_is_at_risk_after_missing_today() {
        let (days, today, at_risk) =
            compute_streak_display(Some("2026-06-22"), 5, "2026-06-23", "2026-06-22");
        assert_eq!(days, 5);
        assert!(!today);
        assert!(at_risk);
    }

    #[test]
    fn streak_resets_when_gap_is_too_long() {
        let (days, today, at_risk) =
            compute_streak_display(Some("2026-06-20"), 5, "2026-06-23", "2026-06-22");
        assert_eq!(days, 0);
        assert!(!today);
        assert!(!at_risk);
    }

    #[test]
    fn computes_days_since_last_study() {
        let days = compute_days_since_last_study(Some("2026-06-20"), "2026-06-23");
        assert_eq!(days, Some(3));
    }

    proptest! {
        #[test]
        fn streak_display_never_returns_negative_days(stored_streak in any::<i32>()) {
            let (days, studied_today, at_risk) = compute_streak_display(
                Some("2026-06-23"),
                stored_streak,
                "2026-06-23",
                "2026-06-22",
            );
            prop_assert!(days >= 0);
            prop_assert!(studied_today);
            prop_assert!(!at_risk);
        }
    }
}

#[derive(Debug, Serialize)]
pub struct PaginatedAdminUsers {
    pub users: Vec<AdminUserActivity>,
    pub total: usize,
    pub page: usize,
    pub total_pages: usize,
}

#[derive(Debug, Serialize)]
pub struct CountryCount {
    pub country: String,
    pub count: usize,
}

/// Snapshot agregado de un día (una fila por día, no por usuario/evento).
/// Se calcula una vez al día a partir de datos ya existentes — ver DailyStatsUseCases.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyStats {
    /// Fecha UTC en formato YYYY-MM-DD.
    pub date: String,
    /// Usuarios con al menos una tarjeta estudiada ese día (last_study_date == date).
    pub dau: i32,
    pub new_signups: i32,
    pub total_users: i32,
    /// Usuarios registrados hace más de 7 días que igual estudiaron en los últimos 7 días.
    /// Proxy barato de retención: "¿los usuarios viejos siguen volviendo?"
    /// `serde(default)`: filas escritas antes de que este campo existiera no tienen el valor.
    #[serde(default)]
    pub retained_7d: i32,
}

#[derive(Debug, Serialize)]
pub struct AdminUserActivity {
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub role: String,
    pub last_login: chrono::DateTime<chrono::Utc>,
    pub is_online: bool,
    pub current_session_secs: Option<i64>,
    pub visit_count: i32,
    pub avg_duration_secs: f64,
    pub device_type: Option<String>,
    pub browser: Option<String>,
    pub os: Option<String>,
    pub country: Option<String>,
    /// Días entre el registro y su última actividad conocida (cuánto lleva "vivo").
    pub retention_days: i64,
}
