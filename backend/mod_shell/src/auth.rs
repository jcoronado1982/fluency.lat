use anyhow::Result;
use chrono::{Duration as ChronoDuration, Utc};
use fluency_core::domain::models::subscription::Subscription;
use fluency_core::domain::models::user::{CatalogPreferences, User};
use fluency_core::ports::db_repository::{SubscriptionRepository, UserRepository};
use fluency_core::ports::token_verifier::TokenVerifier;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub name: String,
    #[serde(default)]
    pub picture: Option<String>,
    pub role: String,
    pub exp: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

pub struct AuthUseCases {
    user_repo: Arc<dyn UserRepository>,
    sub_repo: Arc<dyn SubscriptionRepository>,
    /// Verificación de ID tokens de Google/Apple (JWKS, HTTP) — vive en infraestructura.
    token_verifier: Arc<dyn TokenVerifier>,
    jwt_secret: String,
    super_admin_email: String,
}

impl AuthUseCases {
    pub fn new(
        user_repo: Arc<dyn UserRepository>,
        sub_repo: Arc<dyn SubscriptionRepository>,
        token_verifier: Arc<dyn TokenVerifier>,
    ) -> Self {
        let jwt_secret = std::env::var("JWT_SECRET")
            .expect("JWT_SECRET env var must be set — refusing to start with a weak default");
        let super_admin_email = std::env::var("SUPER_ADMIN_EMAIL").unwrap_or_default();

        Self {
            user_repo,
            sub_repo,
            token_verifier,
            jwt_secret,
            super_admin_email,
        }
    }

    pub async fn google_login(&self, id_token: &str) -> Result<AuthResponse> {
        // 1. Validar token de Google (usa JWKS cacheado)
        let payload = self.token_verifier.verify_google_id_token(id_token).await?;

        let is_super_admin = !self.super_admin_email.is_empty()
            && self.super_admin_email.to_lowercase() == payload.email.to_lowercase();

        // 2. Leer usuario y suscripción en PARALELO — un solo round-trip a SurrealDB
        //    en vez de dos secuenciales: ahorra ~latencia_db por cada login.
        let (user_opt, sub_opt) = tokio::try_join!(
            self.user_repo.get_user_by_email(&payload.email),
            self.sub_repo.get_subscription(&payload.email),
        )?;

        // 3. Upsert del usuario
        let raw_user = match user_opt {
            Some(mut existing) => {
                existing.last_login = Utc::now();
                existing.name = payload.name;
                existing.picture = payload.picture;
                if is_super_admin {
                    existing.role = "admin".to_string();
                }
                self.user_repo.upsert_user(existing).await?
            }
            None => {
                let new_user = User {
                    id: None,
                    email: payload.email.clone(),
                    name: payload.name.clone(),
                    picture: payload.picture.clone(),
                    role: if is_super_admin {
                        "admin".to_string()
                    } else {
                        "viewer".to_string()
                    },
                    onboarding_completed: false,
                    study_language: None,
                    catalog_preferences: None,
                    created_at: Utc::now(),
                    last_login: Utc::now(),
                };
                self.user_repo.upsert_user(new_user).await?
            }
        };

        // 4. Elevar rol si suscripción está activa
        let effective_role = self.resolve_role(&raw_user, sub_opt.as_ref());
        let user = if raw_user.role != effective_role {
            let mut updated = raw_user.clone();
            updated.role = effective_role;
            self.user_repo
                .upsert_user(updated)
                .await
                .unwrap_or(raw_user)
        } else {
            raw_user
        };

        // 5. Generar JWT con exp recortado a expires_at de la suscripción
        let token = self.generate_jwt(&user, sub_opt.as_ref())?;

        Ok(AuthResponse { token, user })
    }

    pub async fn apple_login(
        &self,
        id_token: &str,
        user_name: Option<&str>,
    ) -> Result<AuthResponse> {
        // 1. Validar token de Apple (usa JWKS de Apple cacheado)
        let payload = self.token_verifier.verify_apple_id_token(id_token).await?;

        // Si el email no viene en el token (poco probable, pero por si acaso), usamos un email derivado del sub
        let email = payload
            .email
            .clone()
            .unwrap_or_else(|| format!("{}@appleid.com", payload.sub));

        let is_super_admin = !self.super_admin_email.is_empty()
            && self.super_admin_email.to_lowercase() == email.to_lowercase();

        // 2. Leer usuario y suscripción en PARALELO — un solo round-trip a SurrealDB
        let (user_opt, sub_opt) = tokio::try_join!(
            self.user_repo.get_user_by_email(&email),
            self.sub_repo.get_subscription(&email),
        )?;

        // Apple no tiene avatar/picture. Si el usuario ya existe, conservamos su picture anterior.
        // El name puede venir del token (si Apple lo pusiera, pero no suele venir en el JWT) o del parámetro opcional
        // (pasado por el cliente en el primer login) o derivado del email.
        let name = user_name
            .map(|n| n.to_string())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| {
                user_opt
                    .as_ref()
                    .map(|u| u.name.clone())
                    .unwrap_or_else(|| email.split('@').next().unwrap_or("Apple User").to_string())
            });

        // 3. Upsert del usuario
        let raw_user = match user_opt {
            Some(mut existing) => {
                existing.last_login = Utc::now();
                existing.name = name;
                if is_super_admin {
                    existing.role = "admin".to_string();
                }
                self.user_repo.upsert_user(existing).await?
            }
            None => {
                let new_user = User {
                    id: None,
                    email: email.clone(),
                    name,
                    picture: None,
                    role: if is_super_admin {
                        "admin".to_string()
                    } else {
                        "viewer".to_string()
                    },
                    onboarding_completed: false,
                    study_language: None,
                    catalog_preferences: None,
                    created_at: Utc::now(),
                    last_login: Utc::now(),
                };
                self.user_repo.upsert_user(new_user).await?
            }
        };

        // 4. Elevar rol si suscripción está activa
        let effective_role = self.resolve_role(&raw_user, sub_opt.as_ref());
        let user = if raw_user.role != effective_role {
            let mut updated = raw_user.clone();
            updated.role = effective_role;
            self.user_repo
                .upsert_user(updated)
                .await
                .unwrap_or(raw_user)
        } else {
            raw_user
        };

        // 5. Generar JWT de sesión
        let token = self.generate_jwt(&user, sub_opt.as_ref())?;

        Ok(AuthResponse { token, user })
    }

    pub async fn get_user_profile(&self, email: &str) -> Result<Option<User>> {
        self.user_repo.get_user_by_email(email).await
    }

    pub async fn set_onboarding_completed(
        &self,
        email: &str,
        completed: bool,
    ) -> Result<Option<User>> {
        if let Some(user) = self
            .user_repo
            .set_onboarding_completed(email, completed)
            .await?
        {
            return Ok(Some(user));
        }

        let Some(mut existing) = self.user_repo.get_user_by_email(email).await? else {
            return Ok(None);
        };

        existing.onboarding_completed = completed;
        Ok(Some(self.user_repo.upsert_user(existing).await?))
    }

    pub async fn ensure_user_from_claims(
        &self,
        claims: &Claims,
        onboarding_completed: bool,
    ) -> Result<User> {
        let existing = self.user_repo.get_user_by_email(&claims.email).await?;
        let now = Utc::now();

        let user = match existing {
            Some(mut user) => {
                user.name = claims.name.clone();
                if claims.picture.is_some() {
                    user.picture = claims.picture.clone();
                }
                user.role = claims.role.clone();
                user.last_login = now;
                user.onboarding_completed = onboarding_completed;
                user
            }
            None => User {
                id: None,
                email: claims.email.clone(),
                name: claims.name.clone(),
                picture: claims.picture.clone(),
                role: claims.role.clone(),
                onboarding_completed,
                study_language: None,
                catalog_preferences: None,
                created_at: now,
                last_login: now,
            },
        };

        self.user_repo.upsert_user(user).await
    }

    pub async fn update_catalog_preferences(
        &self,
        email: &str,
        preferences: Option<CatalogPreferences>,
    ) -> Result<Option<User>> {
        self.user_repo
            .update_catalog_preferences(email, preferences)
            .await
    }

    pub async fn update_study_language(
        &self,
        email: &str,
        study_language: &str,
    ) -> Result<Option<User>> {
        self.user_repo
            .update_study_language(email, study_language)
            .await
    }

    pub async fn reset_all_catalog_preferences(&self) -> Result<u64> {
        self.user_repo.reset_all_catalog_preferences().await
    }

    /// Normaliza un rol para comparaciones consistentes (trim + lowercase).
    pub fn normalize_role(role: &str) -> String {
        role.trim().to_lowercase()
    }

    pub fn is_admin_role(role: &str) -> bool {
        Self::normalize_role(role) == "admin"
    }

    pub fn is_premium_role(role: &str) -> bool {
        matches!(Self::normalize_role(role).as_str(), "admin" | "premium")
    }

    /// Resuelve el rol efectivo en tiempo de request (fuente de verdad: DB + suscripción).
    /// El JWT puede quedar desactualizado si el usuario fue promovido sin volver a iniciar sesión.
    pub async fn resolve_effective_role(&self, email: &str, jwt_role: &str) -> String {
        if !self.super_admin_email.is_empty()
            && self.super_admin_email.to_lowercase() == email.to_lowercase()
        {
            tracing::info!(
                "🔐 Rol efectivo para '{}': admin (SUPER_ADMIN_EMAIL)",
                email
            );
            return "admin".to_string();
        }

        let user_role = match self.user_repo.get_user_by_email(email).await {
            Ok(Some(user)) if Self::is_admin_role(&user.role) => {
                tracing::info!("🔐 Rol efectivo para '{}': admin (BD)", email);
                return "admin".to_string();
            }
            Ok(Some(user)) => Some(Self::normalize_role(&user.role)),
            Ok(None) => None,
            Err(e) => {
                tracing::warn!("⚠️ No se pudo leer usuario '{}' en BD: {}", email, e);
                None
            }
        };

        if let Ok(Some(sub)) = self.sub_repo.get_subscription(email).await {
            if sub.is_active() {
                tracing::info!("🔐 Rol efectivo para '{}': premium (suscripción)", email);
                return "premium".to_string();
            }
        }

        if let Some(role) = user_role {
            if role == "premium" {
                tracing::info!("🔐 Rol efectivo para '{}': premium (BD)", email);
                return "premium".to_string();
            }
        }

        let effective = Self::normalize_role(jwt_role);
        tracing::info!(
            "🔐 Rol efectivo para '{}': {} (JWT/BD sin privilegios extra)",
            email,
            effective
        );
        effective
    }

    /// Determina el rol efectivo según la suscripción vigente.
    /// - admin siempre conserva su rol.
    /// - Suscripción activa y no vencida → premium.
    /// - Sin suscripción o vencida → viewer.
    fn resolve_role(&self, user: &User, sub: Option<&Subscription>) -> String {
        if Self::is_admin_role(&user.role) {
            return "admin".to_string();
        }
        match sub {
            Some(s) if s.is_active() => "premium".to_string(),
            _ => "viewer".to_string(),
        }
    }

    fn generate_jwt(&self, user: &User, sub: Option<&Subscription>) -> Result<String> {
        let default_exp = Utc::now()
            .checked_add_signed(ChronoDuration::days(7))
            .expect("valid timestamp");

        // Recortar exp al vencimiento de la suscripción premium para que el JWT
        // no conceda acceso más allá del período pagado.
        let expiration = if user.role == "premium" {
            if let Some(s) = sub {
                if s.expires_at < default_exp {
                    s.expires_at.timestamp() as usize
                } else {
                    default_exp.timestamp() as usize
                }
            } else {
                default_exp.timestamp() as usize
            }
        } else {
            default_exp.timestamp() as usize
        };

        let claims = Claims {
            sub: user.email.clone(),
            email: user.email.clone(),
            name: user.name.clone(),
            picture: user.picture.clone(),
            role: user.role.clone(),
            exp: expiration,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )?;

        Ok(token)
    }

    /// Login de invitado solo para desarrollo local (JWT real con rol admin).
    pub fn dev_guest_login(&self) -> Result<AuthResponse> {
        let now = Utc::now();
        let user = User {
            id: Some("guest".to_string()),
            email: "guest@local.dev".to_string(),
            name: "Invitado Local".to_string(),
            picture: None,
            role: "admin".to_string(),
            onboarding_completed: false,
            study_language: Some("en".to_string()),
            catalog_preferences: None,
            created_at: now,
            last_login: now,
        };
        let token = self.generate_jwt(&user, None)?;
        Ok(AuthResponse { token, user })
    }

    pub fn validate_jwt(&self, token: &str) -> Result<Claims> {
        // Compatibilidad con sesiones guest antiguas en desarrollo.
        if Self::dev_guest_token_allowed() && token == "guest-token-123" {
            return Ok(Claims {
                sub: "guest@local.dev".to_string(),
                email: "guest@local.dev".to_string(),
                name: "Invitado Local".to_string(),
                picture: None,
                role: "admin".to_string(),
                exp: usize::MAX,
            });
        }

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        validation.required_spec_claims.clear();

        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.jwt_secret.as_bytes()),
            &validation,
        )?;
        Ok(token_data.claims)
    }

    pub fn dev_guest_token_allowed() -> bool {
        cfg!(debug_assertions)
            || std::env::var("ALLOW_DEV_GUEST")
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false)
    }
}

#[cfg(test)]
impl AuthUseCases {
    /// Constructor de test: evita depender de env vars de proceso (`JWT_SECRET`,
    /// `SUPER_ADMIN_EMAIL`) para no correr riesgo de carrera entre tests paralelos
    /// que necesiten valores distintos.
    fn new_for_test(
        user_repo: Arc<dyn UserRepository>,
        sub_repo: Arc<dyn SubscriptionRepository>,
        token_verifier: Arc<dyn TokenVerifier>,
        jwt_secret: &str,
        super_admin_email: &str,
    ) -> Self {
        Self {
            user_repo,
            sub_repo,
            token_verifier,
            jwt_secret: jwt_secret.to_string(),
            super_admin_email: super_admin_email.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use fluency_core::domain::models::user::{ApplePayload, GooglePayload};
    use std::collections::HashMap;
    use std::sync::Mutex;

    fn user(email: &str, role: &str) -> User {
        let now = Utc::now();
        User {
            id: None,
            email: email.to_string(),
            name: "Test User".to_string(),
            picture: None,
            role: role.to_string(),
            onboarding_completed: false,
            study_language: None,
            catalog_preferences: None,
            created_at: now,
            last_login: now,
        }
    }

    fn active_subscription(email: &str) -> Subscription {
        let now = Utc::now();
        Subscription {
            user_email: email.to_string(),
            plan: "monthly".to_string(),
            status: "active".to_string(),
            starts_at: now,
            expires_at: now + ChronoDuration::days(30),
            payment_provider: None,
            external_customer_id: None,
            external_subscription_id: None,
            created_at: now,
            updated_at: now,
        }
    }

    #[derive(Default)]
    struct FakeUserRepository {
        users: Mutex<HashMap<String, User>>,
    }

    impl FakeUserRepository {
        fn seeded(users: Vec<User>) -> Self {
            let map = users.into_iter().map(|u| (u.email.clone(), u)).collect();
            Self {
                users: Mutex::new(map),
            }
        }
    }

    #[async_trait]
    impl UserRepository for FakeUserRepository {
        async fn get_user_by_email(&self, email: &str) -> Result<Option<User>> {
            Ok(self.users.lock().unwrap().get(email).cloned())
        }

        async fn upsert_user(&self, user: User) -> Result<User> {
            self.users
                .lock()
                .unwrap()
                .insert(user.email.clone(), user.clone());
            Ok(user)
        }

        async fn set_onboarding_completed(
            &self,
            _email: &str,
            _completed: bool,
        ) -> Result<Option<User>> {
            unimplemented!("not exercised by these tests")
        }

        async fn update_study_language(
            &self,
            _email: &str,
            _study_language: &str,
        ) -> Result<Option<User>> {
            unimplemented!("not exercised by these tests")
        }

        async fn update_catalog_preferences(
            &self,
            _email: &str,
            _preferences: Option<CatalogPreferences>,
        ) -> Result<Option<User>> {
            unimplemented!("not exercised by these tests")
        }

        async fn reset_all_catalog_preferences(&self) -> Result<u64> {
            unimplemented!("not exercised by these tests")
        }

        async fn list_all_users(&self) -> Result<Vec<User>> {
            Ok(self.users.lock().unwrap().values().cloned().collect())
        }
    }

    #[derive(Default)]
    struct FakeSubscriptionRepository {
        subs: Mutex<HashMap<String, Subscription>>,
    }

    impl FakeSubscriptionRepository {
        fn seeded(subs: Vec<Subscription>) -> Self {
            let map = subs.into_iter().map(|s| (s.user_email.clone(), s)).collect();
            Self {
                subs: Mutex::new(map),
            }
        }
    }

    #[async_trait]
    impl SubscriptionRepository for FakeSubscriptionRepository {
        async fn get_subscription(&self, email: &str) -> Result<Option<Subscription>> {
            Ok(self.subs.lock().unwrap().get(email).cloned())
        }

        async fn upsert_subscription(&self, sub: Subscription) -> Result<Subscription> {
            self.subs
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
            unimplemented!("not exercised by these tests")
        }

        async fn cancel_subscription(&self, _email: &str) -> Result<()> {
            unimplemented!("not exercised by these tests")
        }

        async fn bulk_expire_subscriptions(&self) -> Result<usize> {
            unimplemented!("not exercised by these tests")
        }
    }

    /// Devuelve un payload fijo (u error) sin tocar red — permite probar
    /// `google_login`/`apple_login` de punta a punta sin depender de Google/Apple reales.
    enum FakeTokenVerifier {
        Google(GooglePayload),
        Apple(ApplePayload),
        Fails(String),
    }

    #[async_trait]
    impl TokenVerifier for FakeTokenVerifier {
        async fn verify_google_id_token(&self, _id_token: &str) -> Result<GooglePayload> {
            match self {
                FakeTokenVerifier::Google(p) => Ok(GooglePayload {
                    sub: p.sub.clone(),
                    email: p.email.clone(),
                    name: p.name.clone(),
                    picture: p.picture.clone(),
                    email_verified: p.email_verified,
                }),
                FakeTokenVerifier::Fails(msg) => Err(anyhow::anyhow!(msg.clone())),
                _ => unreachable!("wrong fake variant for this test"),
            }
        }

        async fn verify_apple_id_token(&self, _id_token: &str) -> Result<ApplePayload> {
            match self {
                FakeTokenVerifier::Apple(p) => Ok(ApplePayload {
                    sub: p.sub.clone(),
                    email: p.email.clone(),
                    email_verified: p.email_verified.clone(),
                }),
                FakeTokenVerifier::Fails(msg) => Err(anyhow::anyhow!(msg.clone())),
                _ => unreachable!("wrong fake variant for this test"),
            }
        }
    }

    fn use_cases(
        user_repo: FakeUserRepository,
        sub_repo: FakeSubscriptionRepository,
        token_verifier: FakeTokenVerifier,
    ) -> AuthUseCases {
        AuthUseCases::new_for_test(
            Arc::new(user_repo),
            Arc::new(sub_repo),
            Arc::new(token_verifier),
            "test-jwt-secret",
            "",
        )
    }

    // --- role helpers -----------------------------------------------------------

    #[test]
    fn role_helpers_trim_lowercase_and_classify() {
        assert_eq!(AuthUseCases::normalize_role("  Admin  "), "admin");
        assert!(AuthUseCases::is_admin_role("ADMIN"));
        assert!(!AuthUseCases::is_admin_role("premium"));
        assert!(AuthUseCases::is_premium_role("Premium"));
        assert!(AuthUseCases::is_premium_role("admin"));
        assert!(!AuthUseCases::is_premium_role("viewer"));
    }

    #[test]
    fn resolve_role_admin_always_wins_over_subscription_state() {
        let auth = use_cases(
            FakeUserRepository::default(),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Fails("unused".to_string()),
        );
        let admin = user("admin@x.com", "admin");
        assert_eq!(auth.resolve_role(&admin, None), "admin");
        assert_eq!(
            auth.resolve_role(&admin, Some(&active_subscription("admin@x.com"))),
            "admin"
        );
    }

    #[test]
    fn resolve_role_grants_premium_only_while_the_subscription_is_active() {
        let auth = use_cases(
            FakeUserRepository::default(),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Fails("unused".to_string()),
        );
        let viewer = user("viewer@x.com", "viewer");

        assert_eq!(auth.resolve_role(&viewer, None), "viewer");
        assert_eq!(
            auth.resolve_role(&viewer, Some(&active_subscription("viewer@x.com"))),
            "premium"
        );

        let mut expired = active_subscription("viewer@x.com");
        expired.expires_at = Utc::now() - ChronoDuration::days(1);
        assert_eq!(auth.resolve_role(&viewer, Some(&expired)), "viewer");
    }

    // --- JWT propio (HS256) ------------------------------------------------------

    #[test]
    fn validate_jwt_rejects_garbage_tokens() {
        let auth = use_cases(
            FakeUserRepository::default(),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Fails("unused".to_string()),
        );
        assert!(auth.validate_jwt("not-a-real-token").is_err());
    }

    #[test]
    fn validate_jwt_rejects_an_already_expired_token() {
        let auth = use_cases(
            FakeUserRepository::default(),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Fails("unused".to_string()),
        );
        let expired_user = user("gone@x.com", "viewer");
        let expired_sub = Subscription {
            expires_at: Utc::now() - ChronoDuration::days(400),
            ..active_subscription("gone@x.com")
        };
        // role != "premium" así que generate_jwt no recorta al vencimiento de la sub;
        // forzamos expiración directamente construyendo el token con un exp pasado.
        let mut claims = Claims {
            sub: expired_user.email.clone(),
            email: expired_user.email.clone(),
            name: expired_user.name.clone(),
            picture: None,
            role: expired_user.role.clone(),
            exp: (Utc::now() - ChronoDuration::days(1)).timestamp() as usize,
        };
        claims.role = "premium".to_string();
        let _ = expired_sub; // documenta la relación con el escenario real (sub vencida)
        let token = jsonwebtoken::encode(
            &jsonwebtoken::Header::default(),
            &claims,
            &jsonwebtoken::EncodingKey::from_secret(b"test-jwt-secret"),
        )
        .unwrap();

        assert!(auth.validate_jwt(&token).is_err());
    }

    #[test]
    fn dev_guest_login_issues_a_local_admin_token_that_round_trips() {
        let auth = use_cases(
            FakeUserRepository::default(),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Fails("unused".to_string()),
        );
        let response = auth.dev_guest_login().unwrap();
        assert_eq!(response.user.role, "admin");
        assert_eq!(response.user.email, "guest@local.dev");

        let claims = auth.validate_jwt(&response.token).unwrap();
        assert_eq!(claims.email, "guest@local.dev");
        assert_eq!(claims.role, "admin");
    }

    // --- ensure_user_from_claims --------------------------------------------------

    #[tokio::test]
    async fn ensure_user_from_claims_updates_name_role_and_picture_for_an_existing_user() {
        let existing = user("known@x.com", "viewer");
        let auth = use_cases(
            FakeUserRepository::seeded(vec![existing.clone()]),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Fails("unused".to_string()),
        );
        let claims = Claims {
            sub: existing.email.clone(),
            email: existing.email.clone(),
            name: "Nuevo Nombre".to_string(),
            picture: Some("https://x.com/p.png".to_string()),
            role: "premium".to_string(),
            exp: 0,
        };

        let updated = auth.ensure_user_from_claims(&claims, true).await.unwrap();

        assert_eq!(updated.name, "Nuevo Nombre");
        assert_eq!(updated.role, "premium");
        assert_eq!(updated.picture.as_deref(), Some("https://x.com/p.png"));
        assert!(updated.onboarding_completed);
    }

    #[tokio::test]
    async fn ensure_user_from_claims_creates_a_new_user_when_none_existed() {
        let auth = use_cases(
            FakeUserRepository::default(),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Fails("unused".to_string()),
        );
        let claims = Claims {
            sub: "new@x.com".to_string(),
            email: "new@x.com".to_string(),
            name: "Persona Nueva".to_string(),
            picture: None,
            role: "viewer".to_string(),
            exp: 0,
        };

        let created = auth.ensure_user_from_claims(&claims, false).await.unwrap();
        assert_eq!(created.email, "new@x.com");
        assert!(!created.onboarding_completed);

        let stored = auth.get_user_profile("new@x.com").await.unwrap();
        assert!(stored.is_some());
    }

    // --- resolve_effective_role ---------------------------------------------------

    #[tokio::test]
    async fn resolve_effective_role_super_admin_env_wins_over_everything() {
        let auth = AuthUseCases::new_for_test(
            Arc::new(FakeUserRepository::seeded(vec![user(
                "boss@x.com",
                "viewer",
            )])),
            Arc::new(FakeSubscriptionRepository::default()),
            Arc::new(FakeTokenVerifier::Fails("unused".to_string())),
            "test-jwt-secret",
            "boss@x.com",
        );

        let role = auth.resolve_effective_role("BOSS@x.com", "viewer").await;
        assert_eq!(role, "admin");
    }

    #[tokio::test]
    async fn resolve_effective_role_grants_premium_from_an_active_subscription() {
        let auth = use_cases(
            FakeUserRepository::seeded(vec![user("payer@x.com", "viewer")]),
            FakeSubscriptionRepository::seeded(vec![active_subscription("payer@x.com")]),
            FakeTokenVerifier::Fails("unused".to_string()),
        );

        let role = auth.resolve_effective_role("payer@x.com", "viewer").await;
        assert_eq!(role, "premium");
    }

    #[tokio::test]
    async fn resolve_effective_role_falls_back_to_jwt_role_without_db_or_subscription() {
        let auth = use_cases(
            FakeUserRepository::default(),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Fails("unused".to_string()),
        );

        let role = auth.resolve_effective_role("unknown@x.com", "viewer").await;
        assert_eq!(role, "viewer");
    }

    // --- google_login / apple_login (vía TokenVerifier fake) ----------------------

    #[tokio::test]
    async fn google_login_creates_a_new_viewer_and_returns_a_valid_jwt() {
        let auth = use_cases(
            FakeUserRepository::default(),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Google(GooglePayload {
                sub: "g-123".to_string(),
                email: "fresh@x.com".to_string(),
                name: "Fresh User".to_string(),
                picture: None,
                email_verified: true,
            }),
        );

        let response = auth.google_login("whatever-raw-id-token").await.unwrap();

        assert_eq!(response.user.email, "fresh@x.com");
        assert_eq!(response.user.role, "viewer");
        let claims = auth.validate_jwt(&response.token).unwrap();
        assert_eq!(claims.email, "fresh@x.com");
    }

    #[tokio::test]
    async fn google_login_promotes_the_super_admin_email_to_admin() {
        let auth = AuthUseCases::new_for_test(
            Arc::new(FakeUserRepository::default()),
            Arc::new(FakeSubscriptionRepository::default()),
            Arc::new(FakeTokenVerifier::Google(GooglePayload {
                sub: "g-boss".to_string(),
                email: "boss@x.com".to_string(),
                name: "Boss".to_string(),
                picture: None,
                email_verified: true,
            })),
            "test-jwt-secret",
            "boss@x.com",
        );

        let response = auth.google_login("token").await.unwrap();
        assert_eq!(response.user.role, "admin");
    }

    #[tokio::test]
    async fn google_login_propagates_token_verifier_failures() {
        let auth = use_cases(
            FakeUserRepository::default(),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Fails("Google email not verified".to_string()),
        );

        let err = auth.google_login("token").await.unwrap_err();
        assert!(err.to_string().contains("Google email not verified"));
    }

    #[tokio::test]
    async fn apple_login_derives_an_email_from_sub_when_apple_omits_it() {
        let auth = use_cases(
            FakeUserRepository::default(),
            FakeSubscriptionRepository::default(),
            FakeTokenVerifier::Apple(ApplePayload {
                sub: "apple-sub-1".to_string(),
                email: None,
                email_verified: None,
            }),
        );

        let response = auth
            .apple_login("token", Some("Nombre Apple"))
            .await
            .unwrap();

        assert_eq!(response.user.email, "apple-sub-1@appleid.com");
        assert_eq!(response.user.name, "Nombre Apple");
    }
}
