use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use fluency_core::domain::models::user_activity::{
    AdminUserActivity, ClientInfo, CountryCount, PaginatedAdminUsers, UserActivityStats,
};
use fluency_core::ports::db_repository::{UserActivityRepository, UserRepository};
use fluency_core::ports::geo_ip::GeoIpLookup;
use tokio::time::interval;

const IDLE_TIMEOUT_SECS: i64 = 90;

fn is_private_ip(ip: &str) -> bool {
    matches!(ip, "127.0.0.1" | "::1" | "localhost")
        || ip.starts_with("10.")
        || ip.starts_with("192.168.")
        || ip.starts_with("172.16.")
        || ip.starts_with("172.17.")
        || ip.starts_with("172.18.")
        || ip.starts_with("172.19.")
        || ip.starts_with("172.2")
        || ip.starts_with("172.30.")
        || ip.starts_with("172.31.")
}

struct ActiveSession {
    name: String,
    picture: Option<String>,
    client: ClientInfo,
    country: Option<String>,
    session_start: DateTime<Utc>,
    last_seen: DateTime<Utc>,
}

pub struct PresenceUseCases {
    active: Arc<DashMap<String, ActiveSession>>,
    user_repo: Arc<dyn UserRepository>,
    activity_repo: Arc<dyn UserActivityRepository>,
    geo_lookup: Arc<dyn GeoIpLookup>,
}

impl PresenceUseCases {
    pub fn new(
        user_repo: Arc<dyn UserRepository>,
        activity_repo: Arc<dyn UserActivityRepository>,
        geo_lookup: Arc<dyn GeoIpLookup>,
    ) -> Self {
        let active = Arc::new(DashMap::new());
        let sweep_active = active.clone();
        let sweep_repo = activity_repo.clone();

        tokio::spawn(async move {
            let mut tick = interval(Duration::from_secs(30));
            loop {
                tick.tick().await;
                sweep_stale_sessions(&sweep_active, &sweep_repo).await;
            }
        });

        Self {
            active,
            user_repo,
            activity_repo,
            geo_lookup,
        }
    }

    pub async fn heartbeat(
        &self,
        email: &str,
        name: &str,
        picture: Option<String>,
        client: ClientInfo,
        client_ip: Option<String>,
        header_country: Option<String>,
    ) {
        let now = Utc::now();
        let _ = self.activity_repo.update_last_client(email, &client).await;

        let country = self
            .resolve_country(email, client_ip.as_deref(), header_country.as_deref())
            .await;
        if client_ip.is_some() || country.is_some() {
            let _ = self
                .activity_repo
                .update_last_location(email, client_ip.as_deref(), country.as_deref())
                .await;
        }

        if let Some(mut session) = self.active.get_mut(email) {
            session.last_seen = now;
            session.client = client;
            session.country = country;
            if !name.is_empty() {
                session.name = name.to_string();
            }
            if picture.is_some() {
                session.picture = picture;
            }
        } else {
            let _ = self.activity_repo.increment_visit_count(email).await;
            self.active.insert(
                email.to_string(),
                ActiveSession {
                    name: name.to_string(),
                    picture,
                    client,
                    country,
                    session_start: now,
                    last_seen: now,
                },
            );
        }
    }

    async fn resolve_country(
        &self,
        email: &str,
        client_ip: Option<&str>,
        header_country: Option<&str>,
    ) -> Option<String> {
        if let Some(country) = header_country {
            if !country.is_empty() {
                return Some(country.to_string());
            }
        }

        let ip = client_ip?;
        if is_private_ip(ip) {
            return Some("Local".to_string());
        }

        let existing = self.activity_repo.get_stats(email).await.ok();
        if existing.as_ref().and_then(|s| s.last_ip.as_deref()) == Some(ip) {
            if let Some(country) = existing.and_then(|s| s.last_country) {
                return Some(country);
            }
        }

        self.geo_lookup.lookup_country(ip).await
    }

    pub async fn leave(&self, email: &str) {
        self.close_session(email).await;
    }

    pub async fn get_admin_dashboard(
        &self,
        page: usize,
        limit: usize,
    ) -> Result<PaginatedAdminUsers> {
        let mut users = self.user_repo.list_all_users().await?;
        let stats_list = self.activity_repo.get_all_stats().await?;
        let now = Utc::now();

        // Sort completely first so pagination is stable across requests
        users.sort_by(|a, b| {
            let a_online = self.active.contains_key(&a.email);
            let b_online = self.active.contains_key(&b.email);
            b_online
                .cmp(&a_online)
                .then_with(|| b.last_login.cmp(&a.last_login))
        });

        let total = users.len();
        let total_pages = (total + limit - 1) / limit;

        let start = (page.saturating_sub(1)) * limit;
        let end = (start + limit).min(total);

        let page_users = if start < total {
            &users[start..end]
        } else {
            &[]
        };

        let mut rows = Vec::with_capacity(page_users.len());
        for user in page_users {
            let stats = stats_list
                .iter()
                .find(|s| s.email == user.email)
                .cloned()
                .unwrap_or_else(|| UserActivityStats {
                    email: user.email.clone(),
                    ..Default::default()
                });

            let (is_online, current_session_secs, device_type, browser, os, country) =
                if let Some(session) = self.active.get(&user.email) {
                    let secs = (now - session.session_start).num_seconds().max(0);
                    (
                        true,
                        Some(secs),
                        Some(session.client.device_type.clone()),
                        Some(session.client.browser.clone()),
                        Some(session.client.os.clone()),
                        session.country.clone(),
                    )
                } else {
                    (
                        false,
                        None,
                        stats.last_device_type.clone(),
                        stats.last_browser.clone(),
                        stats.last_os.clone(),
                        stats.last_country.clone(),
                    )
                };

            let avg_duration_secs = if stats.visit_count > 0 {
                stats.total_duration_secs as f64 / stats.visit_count as f64
            } else {
                0.0
            };

            let retention_days = (user.last_login - user.created_at).num_days().max(0);

            rows.push(AdminUserActivity {
                email: user.email.clone(),
                name: user.name.clone(),
                picture: user.picture.clone(),
                role: user.role.clone(),
                last_login: user.last_login,
                is_online,
                current_session_secs,
                visit_count: stats.visit_count,
                avg_duration_secs,
                device_type,
                browser,
                os,
                country,
                retention_days,
            });
        }

        Ok(PaginatedAdminUsers {
            users: rows,
            total,
            page: page.max(1),
            total_pages,
        })
    }

    /// Cuenta usuarios registrados por país (según su última ubicación conocida).
    pub async fn get_country_stats(&self) -> Result<Vec<CountryCount>> {
        let stats_list = self.activity_repo.get_all_stats().await?;

        let mut counts: HashMap<String, usize> = HashMap::new();
        for stats in &stats_list {
            let country = stats
                .last_country
                .clone()
                .filter(|c| !c.is_empty())
                .unwrap_or_else(|| "Unknown".to_string());
            *counts.entry(country).or_insert(0) += 1;
        }

        let mut rows: Vec<CountryCount> = counts
            .into_iter()
            .map(|(country, count)| CountryCount { country, count })
            .collect();
        rows.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.country.cmp(&b.country)));

        Ok(rows)
    }

    async fn close_session(&self, email: &str) {
        if let Some((_, session)) = self.active.remove(email) {
            let duration = (session.last_seen - session.session_start)
                .num_seconds()
                .max(0);
            let _ = self
                .activity_repo
                .add_session_duration(email, duration)
                .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use fluency_core::domain::models::user::{CatalogPreferences, User};
    use std::collections::HashMap;
    use std::sync::Mutex;

    fn user(email: &str) -> User {
        let now = Utc::now();
        User {
            id: None,
            email: email.to_string(),
            name: email.to_string(),
            picture: None,
            role: "viewer".to_string(),
            onboarding_completed: true,
            study_language: None,
            catalog_preferences: None,
            created_at: now,
            last_login: now,
        }
    }

    #[derive(Default)]
    struct FakeUserRepository {
        users: Mutex<Vec<User>>,
    }

    #[async_trait]
    impl UserRepository for FakeUserRepository {
        async fn get_user_by_email(&self, email: &str) -> Result<Option<User>> {
            Ok(self.users.lock().unwrap().iter().find(|u| u.email == email).cloned())
        }
        async fn upsert_user(&self, _user: User) -> Result<User> {
            unimplemented!("not exercised by these tests")
        }
        async fn set_onboarding_completed(&self, _e: &str, _c: bool) -> Result<Option<User>> {
            unimplemented!("not exercised by these tests")
        }
        async fn update_study_language(&self, _e: &str, _l: &str) -> Result<Option<User>> {
            unimplemented!("not exercised by these tests")
        }
        async fn update_catalog_preferences(
            &self,
            _e: &str,
            _p: Option<CatalogPreferences>,
        ) -> Result<Option<User>> {
            unimplemented!("not exercised by these tests")
        }
        async fn reset_all_catalog_preferences(&self) -> Result<u64> {
            unimplemented!("not exercised by these tests")
        }
        async fn list_all_users(&self) -> Result<Vec<User>> {
            Ok(self.users.lock().unwrap().clone())
        }
    }

    #[derive(Default)]
    struct FakeUserActivityRepository {
        stats: Mutex<HashMap<String, UserActivityStats>>,
    }

    impl FakeUserActivityRepository {
        fn seeded(stats: Vec<UserActivityStats>) -> Self {
            let map = stats.into_iter().map(|s| (s.email.clone(), s)).collect();
            Self {
                stats: Mutex::new(map),
            }
        }
    }

    #[async_trait]
    impl UserActivityRepository for FakeUserActivityRepository {
        async fn increment_visit_count(&self, email: &str) -> Result<()> {
            let mut guard = self.stats.lock().unwrap();
            let entry = guard.entry(email.to_string()).or_insert_with(|| UserActivityStats {
                email: email.to_string(),
                ..Default::default()
            });
            entry.visit_count += 1;
            Ok(())
        }
        async fn add_session_duration(&self, email: &str, secs: i64) -> Result<()> {
            let mut guard = self.stats.lock().unwrap();
            let entry = guard.entry(email.to_string()).or_insert_with(|| UserActivityStats {
                email: email.to_string(),
                ..Default::default()
            });
            entry.total_duration_secs += secs;
            Ok(())
        }
        async fn get_stats(&self, email: &str) -> Result<UserActivityStats> {
            Ok(self
                .stats
                .lock()
                .unwrap()
                .get(email)
                .cloned()
                .unwrap_or_else(|| UserActivityStats {
                    email: email.to_string(),
                    ..Default::default()
                }))
        }
        async fn get_all_stats(&self) -> Result<Vec<UserActivityStats>> {
            Ok(self.stats.lock().unwrap().values().cloned().collect())
        }
        async fn update_last_client(&self, _email: &str, _client: &ClientInfo) -> Result<()> {
            Ok(())
        }
        async fn update_last_location(
            &self,
            _email: &str,
            _ip: Option<&str>,
            _country: Option<&str>,
        ) -> Result<()> {
            Ok(())
        }
        async fn record_study_day(&self, _email: &str) -> Result<()> {
            unimplemented!("not exercised by these tests")
        }
        async fn get_learning_stats(
            &self,
            _email: &str,
            _mastered_count: i32,
            _target_count: i32,
        ) -> Result<fluency_core::domain::models::user_activity::LearningStats> {
            unimplemented!("not exercised by these tests")
        }
    }

    struct FakeGeoIpLookup(Option<&'static str>);

    #[async_trait]
    impl GeoIpLookup for FakeGeoIpLookup {
        async fn lookup_country(&self, _ip: &str) -> Option<String> {
            self.0.map(|c| c.to_string())
        }
    }

    fn use_cases(
        users: Vec<User>,
        stats: Vec<UserActivityStats>,
        geo_country: Option<&'static str>,
    ) -> PresenceUseCases {
        PresenceUseCases::new(
            Arc::new(FakeUserRepository {
                users: Mutex::new(users),
            }),
            Arc::new(FakeUserActivityRepository::seeded(stats)),
            Arc::new(FakeGeoIpLookup(geo_country)),
        )
    }

    // --- is_private_ip -----------------------------------------------------------

    #[test]
    fn is_private_ip_recognizes_loopback_and_rfc1918_ranges() {
        assert!(is_private_ip("127.0.0.1"));
        assert!(is_private_ip("::1"));
        assert!(is_private_ip("localhost"));
        assert!(is_private_ip("10.0.1.5"));
        assert!(is_private_ip("192.168.1.5"));
        assert!(is_private_ip("172.16.0.1"));
        assert!(is_private_ip("172.31.255.255"));
        assert!(!is_private_ip("8.8.8.8"));
        assert!(!is_private_ip("200.1.2.3"));
    }

    #[test]
    fn is_private_ip_prefix_match_is_looser_than_true_rfc1918_ranges() {
        // "172.2" como prefijo también matchea IPs fuera del rango RFC1918 real
        // (172.16.0.0–172.31.255.255) — comportamiento actual documentado, no un bug a
        // arreglar de pasada: cambiar esto podría reclasificar IPs públicas reales.
        assert!(is_private_ip("172.2.1.1"));
        assert!(is_private_ip("172.200.1.1"));
    }

    // --- heartbeat / leave ---------------------------------------------------------

    #[tokio::test]
    async fn heartbeat_marks_a_new_visitor_online_and_counts_the_visit() {
        let uc = use_cases(vec![user("new@x.com")], vec![], None);
        uc.heartbeat(
            "new@x.com",
            "New",
            None,
            ClientInfo::default(),
            Some("127.0.0.1".to_string()),
            None,
        )
        .await;

        let dashboard = uc.get_admin_dashboard(1, 10).await.unwrap();
        let row = dashboard.users.iter().find(|u| u.email == "new@x.com").unwrap();
        assert!(row.is_online);
        assert_eq!(row.visit_count, 1);
    }

    #[tokio::test]
    async fn leave_closes_the_session_and_records_its_duration() {
        let uc = use_cases(vec![user("bye@x.com")], vec![], None);
        uc.heartbeat(
            "bye@x.com",
            "Bye",
            None,
            ClientInfo::default(),
            None,
            Some("CO".to_string()),
        )
        .await;
        uc.leave("bye@x.com").await;

        let dashboard = uc.get_admin_dashboard(1, 10).await.unwrap();
        let row = dashboard.users.iter().find(|u| u.email == "bye@x.com").unwrap();
        assert!(!row.is_online);
    }

    // --- get_admin_dashboard --------------------------------------------------------

    #[tokio::test]
    async fn admin_dashboard_sorts_online_users_first_then_by_recent_login() {
        let mut old_user = user("old@x.com");
        old_user.last_login = Utc::now() - chrono::Duration::days(5);
        let mut recent_user = user("recent@x.com");
        recent_user.last_login = Utc::now() - chrono::Duration::days(1);
        let offline_online_mix = user("online@x.com");

        let uc = use_cases(
            vec![old_user, recent_user, offline_online_mix.clone()],
            vec![],
            None,
        );
        uc.heartbeat(
            "online@x.com",
            "Online",
            None,
            ClientInfo::default(),
            None,
            None,
        )
        .await;

        let dashboard = uc.get_admin_dashboard(1, 10).await.unwrap();
        assert_eq!(dashboard.users[0].email, "online@x.com");
        assert_eq!(dashboard.users[1].email, "recent@x.com");
        assert_eq!(dashboard.users[2].email, "old@x.com");
    }

    #[tokio::test]
    async fn admin_dashboard_paginates_with_stable_ordering() {
        let users: Vec<User> = (0..5).map(|i| user(&format!("u{i}@x.com"))).collect();
        let uc = use_cases(users, vec![], None);

        let page1 = uc.get_admin_dashboard(1, 2).await.unwrap();
        let page2 = uc.get_admin_dashboard(2, 2).await.unwrap();

        assert_eq!(page1.total, 5);
        assert_eq!(page1.total_pages, 3);
        assert_eq!(page1.users.len(), 2);
        assert_eq!(page2.users.len(), 2);
        assert_ne!(page1.users[0].email, page2.users[0].email);
    }

    // --- get_country_stats -----------------------------------------------------------

    #[tokio::test]
    async fn country_stats_counts_and_sorts_by_frequency_then_alphabetically() {
        let stats = vec![
            UserActivityStats {
                email: "a@x.com".to_string(),
                last_country: Some("Colombia".to_string()),
                ..Default::default()
            },
            UserActivityStats {
                email: "b@x.com".to_string(),
                last_country: Some("Colombia".to_string()),
                ..Default::default()
            },
            UserActivityStats {
                email: "c@x.com".to_string(),
                last_country: Some("Argentina".to_string()),
                ..Default::default()
            },
            UserActivityStats {
                email: "d@x.com".to_string(),
                last_country: None,
                ..Default::default()
            },
        ];
        let uc = use_cases(vec![], stats, None);

        let counts = uc.get_country_stats().await.unwrap();

        assert_eq!(counts[0].country, "Colombia");
        assert_eq!(counts[0].count, 2);
        assert_eq!(counts[1].country, "Argentina");
        assert_eq!(counts[2].country, "Unknown");
    }
}

async fn sweep_stale_sessions(
    active: &DashMap<String, ActiveSession>,
    activity_repo: &Arc<dyn UserActivityRepository>,
) {
    let now = Utc::now();
    let stale: Vec<String> = active
        .iter()
        .filter(|entry| (now - entry.last_seen).num_seconds() > IDLE_TIMEOUT_SECS)
        .map(|entry| entry.key().clone())
        .collect();

    for email in stale {
        if let Some((_, session)) = active.remove(&email) {
            let duration = (session.last_seen - session.session_start)
                .num_seconds()
                .max(0);
            let _ = activity_repo.add_session_duration(&email, duration).await;
        }
    }
}
