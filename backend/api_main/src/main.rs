mod api;
mod config;
mod domain;
mod infrastructure;
mod modules;

use axum::{
    http::HeaderValue,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tower::ServiceBuilder;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Settings;
#[cfg(feature = "flashcards")]
use crate::domain::repositories::audio::AudioGenerator;
use crate::domain::repositories::db_repository::{
    CardProgressRepository, DailyStatsRepository, DemoFeedbackRepository,
    PronounPracticeRepository, SubscriptionRepository, UserActivityRepository, UserRepository,
};
use crate::domain::repositories::geo_ip::GeoIpLookup;
#[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
use crate::domain::repositories::image::ImageGenerator;
#[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
use crate::domain::repositories::image_compressor::ImageCompressor;
use crate::domain::repositories::media_delivery::MediaDeliveryProvider;
#[cfg(feature = "payments")]
use crate::domain::repositories::payment::PaymentProvider;
use crate::domain::repositories::storage::StorageRepository;
use crate::domain::repositories::token_verifier::TokenVerifier;
use crate::domain::repositories::tutor::AITutor;
#[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
use crate::infrastructure::ai::avif_compressor::AvifCompressor;
#[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
use crate::infrastructure::ai::comfy_provider::ComfyUIProvider;
// #[cfg(feature = "flashcards")]
// use crate::infrastructure::ai::elevenlabs_tts_provider::ElevenLabsTtsProvider;
#[cfg(feature = "flashcards")]
use crate::infrastructure::ai::gemini_interactions_image_provider::GeminiInteractionsImageProvider;
#[cfg(feature = "flashcards")]
use crate::infrastructure::ai::gemini_tts_provider::GeminiTtsProvider;
use crate::infrastructure::ai::provider_selection::ai_tutor_provider_from_name;
#[cfg(feature = "flashcards")]
use crate::infrastructure::ai::provider_selection::audio_provider_from_name;
use crate::infrastructure::media_delivery::provider_from_name as media_delivery_provider_from_name;
#[cfg(feature = "payments")]
use crate::infrastructure::payment::lemonsqueezy_provider::LemonSqueezyProvider;
#[cfg(feature = "payments")]
use crate::infrastructure::payment::null_payment_provider::NullPaymentProvider;
use crate::infrastructure::storage::local_repository::LocalStorageRepository;
use crate::infrastructure::storage::null_db_repository::NullDbRepository;
use crate::infrastructure::storage::surreal::{
    SurrealCardProgressRepository, SurrealConnection, SurrealDailyStatsRepository,
    SurrealDemoFeedbackRepository, SurrealPronounRepository, SurrealSubscriptionRepository,
    SurrealUserActivityRepository, SurrealUserRepository,
};
#[cfg(feature = "flashcards")]
use mod_flashcards::audio_use_cases::AudioUseCases;
#[cfg(feature = "flashcards")]
use mod_flashcards::batch::{
    parse_batch_filter, run_batch_audio_generation, run_batch_image_generation,
    run_batch_image_linking, AudioBatchContext, BatchSettings, ImageBatchContext,
};
#[cfg(feature = "flashcards")]
use mod_flashcards::image_use_cases::ImageUseCases;
#[cfg(feature = "flashcards")]
use mod_flashcards::{DeckUseCases, FlashcardsConfig};
#[cfg(feature = "auth")]
use mod_shell::auth::AuthUseCases;
#[cfg(feature = "auth")]
use mod_shell::daily_stats_use_cases::DailyStatsUseCases;
use mod_shell::demo_feedback_use_cases::DemoFeedbackUseCases;
use mod_shell::local_agent_use_cases::{LocalAgentSettings, LocalAgentUseCases};
#[cfg(feature = "auth")]
use mod_shell::presence_use_cases::PresenceUseCases;
#[cfg(feature = "subscriptions")]
use mod_shell::subscription_use_cases::SubscriptionUseCases;
use mod_shell::tutor_use_cases::TutorUseCases;
#[cfg(feature = "pronoun_practice")]
use pronoun_practice::StoryUseCases;

/// Application state exposed to HTTP handlers.
/// Only contains use-case facades and shared infrastructure primitives
/// (settings, notification channel, storage for media GET and its delivery policy).
/// Raw infrastructure ports are otherwise NOT exposed; business logic goes through use-cases.
#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<Settings>,
    pub storage_repo: Arc<dyn StorageRepository>,
    pub media_delivery_provider: Arc<dyn MediaDeliveryProvider>,
    #[cfg(feature = "flashcards")]
    pub deck_use_cases: Arc<DeckUseCases>,
    pub tutor_use_cases: Arc<TutorUseCases>,
    pub demo_feedback_use_cases: Arc<DemoFeedbackUseCases>,
    pub local_agent_use_cases: Arc<LocalAgentUseCases>,
    #[cfg(feature = "flashcards")]
    pub audio_use_cases: Arc<AudioUseCases>,
    #[cfg(feature = "flashcards")]
    pub image_use_cases: Arc<ImageUseCases>,
    #[cfg(feature = "pronoun_practice")]
    pub pronoun_practice_use_cases: Arc<StoryUseCases>,
    #[cfg(feature = "auth")]
    pub auth_use_cases: Arc<AuthUseCases>,
    #[cfg(feature = "auth")]
    pub presence_use_cases: Arc<PresenceUseCases>,
    #[cfg(feature = "auth")]
    pub daily_stats_use_cases: Arc<DailyStatsUseCases>,
    #[cfg(feature = "subscriptions")]
    pub subscription_use_cases: Arc<SubscriptionUseCases>,
    pub notification_sender: broadcast::Sender<String>,
}

#[cfg(feature = "flashcards")]
fn flashcards_batch_settings(settings: &Settings) -> BatchSettings {
    BatchSettings {
        gcs_images_prefix: settings.gcs_images_prefix.clone(),
        gcs_audio_prefix: settings.gcs_audio_prefix.clone(),
        sync_to_oracle: settings.sync_to_oracle,
        oracle_host: settings.oracle_host.clone(),
        local_storage_path: settings.local_storage_path.clone(),
        gemini_tts_api_key_backup: settings.gemini_tts_api_key_backup.clone(),
    }
}

fn local_agent_settings(settings: &Settings) -> LocalAgentSettings {
    LocalAgentSettings {
        ollama_url: settings.ollama_url.clone(),
        local_agent_model: settings.local_agent_model.clone(),
        local_agent_workspace_root: settings.local_agent_workspace_root.clone(),
        local_agent_max_steps: settings.local_agent_max_steps,
        local_agent_allowed_command_prefixes: settings.local_agent_allowed_command_prefixes.clone(),
    }
}

/// Reintenta la conexión INICIAL a SurrealDB con backoff acotado.
///
/// `SurrealConnection::spawn_watchdog` solo cubre caídas DESPUÉS de un arranque
/// exitoso; un único fallo en este primer intento degradaba el backend entero a
/// `NullDbRepository` de forma PERMANENTE (sin auth) hasta un restart manual del
/// contenedor. Incidente real: proxy GCP, 4 ago 2026 — al desplegar backend y
/// SurrealDB casi al mismo tiempo en máquinas separadas, la DB aún no aceptaba
/// conexiones cuando el backend hizo su único intento; sin retry, quedó
/// degradado aunque la DB terminó de levantar segundos después. Cada intento
/// se acota con `timeout` porque un TCP SYN sin respuesta tarda ~127s en fallar
/// solo (retries de kernel) — sin acotar, pocos reintentos cubrirían muy poco
/// tiempo real de gracia.
async fn connect_surreal_with_retry(
    endpoint: &str,
    namespace: &str,
    database: &str,
) -> anyhow::Result<SurrealConnection> {
    const MAX_ATTEMPTS: u32 = 6;
    const PER_ATTEMPT_TIMEOUT: Duration = Duration::from_secs(10);
    const RETRY_DELAY: Duration = Duration::from_secs(5);

    let mut last_err = anyhow::anyhow!("no se pudo conectar a SurrealDB en {endpoint}");
    for attempt in 1..=MAX_ATTEMPTS {
        match tokio::time::timeout(
            PER_ATTEMPT_TIMEOUT,
            SurrealConnection::new(endpoint, namespace, database),
        )
        .await
        {
            Ok(Ok(conn)) => return Ok(conn),
            Ok(Err(e)) => {
                tracing::warn!(
                    "⚠️ Intento {attempt}/{MAX_ATTEMPTS} de conexión a SurrealDB falló: {e}"
                );
                last_err = e;
            }
            Err(_) => {
                tracing::warn!(
                    "⚠️ Intento {attempt}/{MAX_ATTEMPTS} de conexión a SurrealDB excedió {PER_ATTEMPT_TIMEOUT:?}"
                );
                last_err = anyhow::anyhow!(
                    "timeout de {PER_ATTEMPT_TIMEOUT:?} esperando conexión a SurrealDB en {endpoint}"
                );
            }
        }
        if attempt < MAX_ATTEMPTS {
            tokio::time::sleep(RETRY_DELAY).await;
        }
    }
    Err(last_err)
}

/// Runtime configurado a mano para 1 GB de RAM:
///   - worker_threads: leído de TOKIO_WORKER_THREADS (default = min(cpus, 4))
///     Un t3.micro tiene 2 vCPUs → 2 workers es óptimo.
///   - thread_stack_size: default de Tokio (2 MB). Antes se recortaba a 512 KB
///     para ahorrar RAM, pero ese stack lo heredan TAMBIÉN los hilos
///     `spawn_blocking` que hacen `getaddrinfo()` — hasta para conectar a una
///     IP literal, `TcpStream::connect` pasa por el resolver del SO. Incidente
///     real (proxy GCP, 4 ago 2026): con `/etc/resolv.conf` de metadata de GCE
///     (varios `search` domains), `getaddrinfo` con NSS necesitaba más de
///     512 KB y la conexión a SurrealDB fallaba con timeout en el 100% de los
///     arranques — nunca pasó en Oracle porque su resolv.conf era más simple.
///     El ahorro de RAM era marginal (los hilos blocking son on-demand y se
///     reciclan solos); no vale el riesgo de un stack overflow silencioso en
///     el único intento de conexión a la DB.
fn main() -> anyhow::Result<()> {
    // Desde el upgrade a SurrealDB 3.2.3 (que trae aws-lc-rs) conviven dos
    // backends de rustls en el árbol de dependencias (ring vía reqwest/gcp_auth
    // "viejos", aws-lc-rs vía surrealdb/tonic); sin instalar uno explícito,
    // rustls no puede elegir solo y el proceso panickea en el primer uso de TLS.
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("no se pudo instalar el CryptoProvider de rustls (aws-lc-rs)");

    let workers = std::env::var("TOKIO_WORKER_THREADS")
        .ok()
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or_else(|| std::cmp::min(num_cpus::get(), 4));

    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(workers)
        .enable_all()
        .build()?
        .block_on(async_main())
}

async fn async_main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    // Si GOOGLE_CREDENTIALS_JSON está seteado (Cloud Run sin archivo montado),
    // escribir el JSON a /tmp y apuntar GOOGLE_APPLICATION_CREDENTIALS ahí.
    if let Ok(json_b64) = std::env::var("GOOGLE_CREDENTIALS_JSON") {
        use std::io::Write;
        if let Ok(json_bytes) =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, json_b64.trim())
        {
            let path = "/tmp/gcp-credentials.json";
            if let Ok(mut f) = std::fs::File::create(path) {
                let _ = f.write_all(&json_bytes);
                std::env::set_var("GOOGLE_APPLICATION_CREDENTIALS", path);
                tracing::info!(
                    "🔑 GOOGLE_APPLICATION_CREDENTIALS seteado desde GOOGLE_CREDENTIALS_JSON"
                );
            }
        }
    }

    // Fallback local: si no hay env configurada pero existe el archivo fuera de Git,
    // apuntar GOOGLE_APPLICATION_CREDENTIALS al JSON local para no romper el flujo dev.
    if std::env::var_os("GOOGLE_APPLICATION_CREDENTIALS").is_none() {
        let local_credentials_path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../credentials.json");
        if local_credentials_path.is_file() {
            std::env::set_var("GOOGLE_APPLICATION_CREDENTIALS", &local_credentials_path);
            tracing::info!(
                "🔑 GOOGLE_APPLICATION_CREDENTIALS seteado desde archivo local ignorado por Git"
            );
        }
    }

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let settings = Arc::new(Settings::from_env()?);

    tracing::info!(
        "📁 Utilizando almacenamiento LOCAL en: {}",
        settings.local_storage_path
    );
    let storage_repo: Arc<dyn StorageRepository> =
        Arc::new(LocalStorageRepository::new(&settings).await?);
    let media_delivery_provider =
        media_delivery_provider_from_name(&settings.media_delivery_provider)?;
    tracing::info!(
        "📦 Entrega de imágenes/audio: {}",
        media_delivery_provider.name()
    );

    let surreal_url = std::env::var("SURREAL_URL").unwrap_or_else(|_| "127.0.0.1:8001".to_string());
    // SURREAL_NS/SURREAL_DB permiten compartir una misma SurrealDB entre entornos
    // (prod y QA) separando datos por namespace/database lógicos, sin otra instancia
    // de DB. Antes estaban hardcodeados a "flashcard","flashcard" ignorando estas
    // variables — incidente real (4 ago 2026, migración QA a GCP): un contenedor QA
    // con SURREAL_NS=qa_flashcard/SURREAL_DB=qa_flashcard igual conectaba al namespace
    // de producción porque el valor nunca se leía. Default preserva el comportamiento
    // previo para cualquier despliegue que no fije estas variables.
    let surreal_ns = std::env::var("SURREAL_NS").unwrap_or_else(|_| "flashcard".to_string());
    let surreal_db = std::env::var("SURREAL_DB").unwrap_or_else(|_| "flashcard".to_string());
    #[allow(unused_variables)]
    let (
        user_repo,
        sub_repo,
        card_repo,
        story_repo,
        activity_repo,
        daily_stats_repo,
        demo_feedback_repo,
    ): (
        Arc<dyn UserRepository>,
        Arc<dyn SubscriptionRepository>,
        Arc<dyn CardProgressRepository>,
        Arc<dyn PronounPracticeRepository>,
        Arc<dyn UserActivityRepository>,
        Arc<dyn DailyStatsRepository>,
        Arc<dyn DemoFeedbackRepository>,
    ) = match connect_surreal_with_retry(&surreal_url, &surreal_ns, &surreal_db).await {
        Ok(conn) => {
            tracing::info!("✅ Conectado a SurrealDB en {}", surreal_url);
            let conn = Arc::new(conn);
            conn.spawn_watchdog();
            (
                Arc::new(SurrealUserRepository(conn.clone())) as Arc<dyn UserRepository>,
                Arc::new(SurrealSubscriptionRepository(conn.clone()))
                    as Arc<dyn SubscriptionRepository>,
                Arc::new(SurrealCardProgressRepository(conn.clone()))
                    as Arc<dyn CardProgressRepository>,
                Arc::new(SurrealPronounRepository(conn.clone()))
                    as Arc<dyn PronounPracticeRepository>,
                Arc::new(SurrealUserActivityRepository::new(conn.clone()))
                    as Arc<dyn UserActivityRepository>,
                Arc::new(SurrealDailyStatsRepository(conn.clone()))
                    as Arc<dyn DailyStatsRepository>,
                Arc::new(SurrealDemoFeedbackRepository(conn.clone()))
                    as Arc<dyn DemoFeedbackRepository>,
            )
        }
        Err(e) => {
            tracing::warn!(
                "⚠️ SurrealDB no disponible en {} ({}). Módulos dependientes de DB degradados.",
                surreal_url,
                e
            );
            let repo = Arc::new(NullDbRepository);
            (
                repo.clone(),
                repo.clone(),
                repo.clone(),
                repo.clone(),
                repo.clone(),
                repo.clone(),
                repo.clone(),
            )
        }
    };

    let ai_tutor_provider_name =
        std::env::var("AI_TUTOR_PROVIDER").unwrap_or_else(|_| "gemini".to_string());
    let ai_tutor: Arc<dyn AITutor> =
        ai_tutor_provider_from_name(&ai_tutor_provider_name, &settings)?;
    tracing::info!("🧠 Tutor IA: {}", ai_tutor_provider_name);
    #[cfg(feature = "flashcards")]
    let audio_provider_name =
        std::env::var("AUDIO_TTS_PROVIDER").unwrap_or_else(|_| "gemini".to_string());
    #[cfg(feature = "flashcards")]
    let audio_gen: Arc<dyn AudioGenerator> =
        audio_provider_from_name(&audio_provider_name, &settings).await?;
    #[cfg(feature = "flashcards")]
    let landing_demo_audio_gen: Option<Arc<dyn AudioGenerator>> = None;
    /*
    // ElevenLabs TTS (comentado a pedido — landing demo usa Gemini gemini-2.5-flash-preview-tts)
    ElevenLabsTtsProvider::from_settings(&settings)
        .map(|provider| Arc::new(provider) as Arc<dyn AudioGenerator>);
    */
    #[cfg(feature = "flashcards")]
    tracing::info!("🎙️ Landing demo TTS: usando Gemini TTS (gemini-2.5-flash-preview-tts)");
    #[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
    let image_gen: Arc<dyn ImageGenerator> = Arc::new(ComfyUIProvider::new(&settings));
    #[cfg(feature = "flashcards")]
    let landing_demo_image_gen: Arc<dyn ImageGenerator> =
        Arc::new(GeminiInteractionsImageProvider::new(&settings));
    #[cfg(feature = "flashcards")]
    let gemini_flash_lite_image_gen: Option<Arc<dyn ImageGenerator>> =
        Some(Arc::new(GeminiInteractionsImageProvider::for_raw_phrase(
            &settings,
            "gemini-3.1-flash-lite-image",
        )) as Arc<dyn ImageGenerator>);
    #[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
    let image_compressor: Arc<dyn ImageCompressor> = Arc::new(AvifCompressor);

    // 1000 slots: soporte para ráfagas de imágenes generadas en batch sin perder eventos SSE.
    let (notification_sender, _) = broadcast::channel(1000);

    // --- Compose use cases (application layer) ---
    #[cfg(feature = "flashcards")]
    let deck_use_cases = Arc::new(DeckUseCases::new(
        storage_repo.clone(),
        card_repo.clone(),
        activity_repo.clone(),
    ));

    // Carga solo el manifiesto global (<1 MB); los decks completos son lazy.
    #[cfg(feature = "flashcards")]
    {
        let warm_deck_use_cases = deck_use_cases.clone();
        tokio::spawn(async move {
            warm_deck_use_cases.warm_catalog_manifest().await;
        });
    }
    #[cfg(feature = "flashcards")]
    let flashcards_config = Arc::new(FlashcardsConfig {
        gcs_audio_prefix: settings.gcs_audio_prefix.clone(),
        gcs_images_prefix: settings.gcs_images_prefix.clone(),
        image_ai_enabled: settings.image_ai_enabled,
        is_production: settings.is_production,
    });
    #[cfg(feature = "pronoun_practice")]
    let tutor_db_repo = Some(story_repo.clone());
    #[cfg(not(feature = "pronoun_practice"))]
    let tutor_db_repo = None;
    let tutor_use_cases = Arc::new(TutorUseCases::new(ai_tutor.clone(), tutor_db_repo));
    let demo_feedback_use_cases = Arc::new(DemoFeedbackUseCases::new(demo_feedback_repo.clone()));
    #[cfg(feature = "flashcards")]
    let audio_use_cases = Arc::new(AudioUseCases::new(
        storage_repo.clone(),
        audio_gen.clone(),
        landing_demo_audio_gen,
        ai_tutor.clone(),
        flashcards_config.clone(),
    ));
    #[cfg(feature = "flashcards")]
    let image_use_cases = Arc::new(ImageUseCases::new(
        storage_repo.clone(),
        image_gen.clone(),
        landing_demo_image_gen.clone(),
        gemini_flash_lite_image_gen,
        image_compressor.clone(),
        ai_tutor.clone(),
        flashcards_config.clone(),
    ));
    #[cfg(feature = "pronoun_practice")]
    let pronoun_practice_use_cases = Arc::new(StoryUseCases::new(
        story_repo.clone(),
        Some(image_gen.clone()),
        Some(image_compressor.clone()),
        Some(ai_tutor.clone()),
        Some(storage_repo.clone()),
        Some(notification_sender.clone()),
        settings.gcs_images_prefix.clone(),
        settings.public_base_url.clone(),
    ));

    let local_agent_use_cases = Arc::new(LocalAgentUseCases::new(local_agent_settings(&settings)));

    #[cfg(feature = "auth")]
    let token_verifier: Arc<dyn TokenVerifier> =
        Arc::new(crate::infrastructure::auth::oauth_token_verifier::OAuthTokenVerifier::new());
    let auth_use_cases = Arc::new(AuthUseCases::new(
        user_repo.clone(),
        sub_repo.clone(),
        token_verifier,
    ));

    #[cfg(feature = "auth")]
    let geo_lookup: Arc<dyn GeoIpLookup> =
        Arc::new(crate::infrastructure::geo::ip_api_lookup::IpApiGeoLookup::new());
    #[cfg(feature = "auth")]
    let presence_use_cases = Arc::new(PresenceUseCases::new(
        user_repo.clone(),
        activity_repo.clone(),
        geo_lookup,
    ));

    #[cfg(feature = "auth")]
    let daily_stats_use_cases = Arc::new(DailyStatsUseCases::new(
        user_repo.clone(),
        activity_repo.clone(),
        daily_stats_repo.clone(),
    ));

    #[cfg(feature = "payments")]
    let payment: Arc<dyn PaymentProvider> = match LemonSqueezyProvider::from_settings(&settings) {
        Some(provider) => {
            tracing::info!("💳 Proveedor de pago: LemonSqueezy");
            Arc::new(provider)
        }
        None => {
            tracing::info!("💳 Proveedor de pago: ninguno (activación manual por admin)");
            Arc::new(NullPaymentProvider)
        }
    };

    #[cfg(feature = "subscriptions")]
    let subscription_use_cases = Arc::new(SubscriptionUseCases::new(sub_repo.clone(), payment));

    let state = AppState {
        settings,
        storage_repo: storage_repo.clone(),
        media_delivery_provider,
        #[cfg(feature = "flashcards")]
        deck_use_cases,
        tutor_use_cases,
        demo_feedback_use_cases,
        local_agent_use_cases,
        #[cfg(feature = "flashcards")]
        audio_use_cases,
        #[cfg(feature = "flashcards")]
        image_use_cases,
        #[cfg(feature = "pronoun_practice")]
        pronoun_practice_use_cases,
        #[cfg(feature = "auth")]
        auth_use_cases,
        #[cfg(feature = "auth")]
        presence_use_cases,
        #[cfg(feature = "auth")]
        daily_stats_use_cases,
        #[cfg(feature = "subscriptions")]
        subscription_use_cases,
        notification_sender,
    };

    let cors = cors_layer();

    // --- BATCH MODE ---
    // Uso:
    //   --batch-link-images [categoría] [deck]
    //   --batch-gen-images  [categoría] [deck]
    //   --batch-gen-audio   [categoría] [deck]   ← audio EN → Oracle (SYNC_TO_ORACLE=true)
    // Ejemplo rápido: --batch-link-images adjectives 1-basic
    #[cfg(feature = "flashcards")]
    {
        let args: Vec<String> = std::env::args().collect();
        if args.iter().any(|arg| arg == "--batch-link-images") {
            let filter = parse_batch_filter(&args, "--batch-link-images");
            let ctx = ImageBatchContext {
                deck: state.deck_use_cases.clone(),
                image: state.image_use_cases.clone(),
                settings: flashcards_batch_settings(&state.settings),
            };
            return run_batch_image_linking(ctx, filter).await;
        }
        if args.iter().any(|arg| arg == "--batch-gen-images") {
            let filter = parse_batch_filter(&args, "--batch-gen-images");
            let ctx = ImageBatchContext {
                deck: state.deck_use_cases.clone(),
                image: state.image_use_cases.clone(),
                settings: flashcards_batch_settings(&state.settings),
            };
            return run_batch_image_generation(ctx, filter).await;
        }
        if args.iter().any(|arg| arg == "--batch-gen-audio") {
            let filter = parse_batch_filter(&args, "--batch-gen-audio");
            let batch_tts = Arc::new(GeminiTtsProvider::new_for_batch(&state.settings)?);
            let batch_audio = state.audio_use_cases.with_audio_generator(batch_tts);
            let ctx = AudioBatchContext {
                deck: state.deck_use_cases.clone(),
                audio: batch_audio,
                settings: flashcards_batch_settings(&state.settings),
            };
            return run_batch_audio_generation(ctx, filter).await;
        }
    }
    // ------------------

    #[allow(unused_mut)]
    let mut app = Router::new()
        .route("/api/health", get(api::endpoints::health::health_check))
        .route(
            "/api/benchmark/db-cycle",
            post(api::endpoints::benchmark::db_cycle),
        )
        .route("/api/features", get(api::endpoints::features::get_features));

    #[cfg(feature = "local_agent")]
    let app = app.route(
        "/api/local-agent/turn",
        post(api::endpoints::agent::local_agent_turn),
    );

    let mut app = app
        // Tutor (shell — usado por módulos conversacionales)


        .route(
            "/api/analyze-error",
            post(api::endpoints::tutor::analyze_error),
        )
        .route(
            "/api/explain-like-child",
            post(api::endpoints::tutor::explain_like_child),
        )
        .route(
            "/api/onboarding-guide",
            post(api::endpoints::tutor::guide_onboarding),
        )
        // Notifications (SSE — excluido del timeout global)
        .route(
            "/api/notifications/events",
            get(api::endpoints::notifications::stream_notifications),
        )
        .route(
            "/api/demo-feedback",
            get(api::endpoints::feedback::list_demo_feedback),
        );

    #[cfg(feature = "auth")]
    {
        app = app
            .route("/api/auth/google", post(api::endpoints::auth::google_login))
            .route("/api/auth/apple", post(api::endpoints::auth::apple_login))
            .route(
                "/api/auth/dev-guest",
                post(api::endpoints::auth::dev_guest_login),
            )
            .route("/api/auth/me", get(api::endpoints::auth::get_me))
            .route(
                "/api/auth/onboarding",
                post(api::endpoints::auth::update_onboarding),
            )
            .route(
                "/api/auth/catalog-preferences",
                post(api::endpoints::auth::update_catalog_preferences),
            )
            .route(
                "/api/auth/study-language",
                post(api::endpoints::auth::update_study_language),
            )
            .route(
                "/api/presence/heartbeat",
                post(api::endpoints::presence::heartbeat),
            )
            .route("/api/presence/leave", post(api::endpoints::presence::leave))
            .route(
                "/api/admin/users/activity",
                get(api::endpoints::admin_users::list_users_activity),
            )
            .route(
                "/api/admin/users/countries",
                get(api::endpoints::admin_users::get_users_by_country),
            )
            .route(
                "/api/admin/stats/daily",
                get(api::endpoints::admin_users::get_daily_stats),
            )
            .route(
                "/api/admin/catalog-preferences/reset",
                post(api::endpoints::admin_catalog_preferences::reset_all_catalog_preferences),
            )
            .route(
                "/api/demo-feedback",
                post(api::endpoints::feedback::submit_demo_feedback),
            );
    }

    app = modules::register_routes(app);

    let app = app
        .layer(
            ServiceBuilder::new()
                // Compresión gzip/brotli automática para respuestas JSON (típicamente -70 % tamaño).
                .layer(CompressionLayer::new())
                // Timeout global: las peticiones lentas no acumulan threads.
                // SSE usa su propia ruta sin este layer (está antes en el stack).
                .layer(TimeoutLayer::new(Duration::from_secs(180)))
                .layer(cors),
        )
        .with_state(state);

    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".into())
        .parse::<u16>()?;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("🚀 Rust backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

fn cors_layer() -> CorsLayer {
    let configured = std::env::var("CORS_ALLOWED_ORIGINS")
        .or_else(|_| std::env::var("APP_ALLOWED_ORIGINS"))
        .unwrap_or_default();
    if configured.trim() == "*" {
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }
    let origins: Vec<HeaderValue> = configured
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .filter_map(|origin| match origin.parse::<HeaderValue>() {
            Ok(value) => Some(value),
            Err(_) => {
                tracing::warn!("Origen CORS ignorado por inválido: {}", origin);
                None
            }
        })
        .collect();

    if origins.is_empty() {
        tracing::info!("CORS_ALLOWED_ORIGINS no definido. Usando orígenes permitidos por defecto para producción y desarrollo.");
        let default_origins: Vec<HeaderValue> = vec![
            "https://fluency.lat".parse().unwrap(),
            "https://www.fluency.lat".parse().unwrap(),
            "http://localhost:5173".parse().unwrap(),
            "http://localhost:3000".parse().unwrap(),
        ];
        return CorsLayer::new()
            .allow_origin(default_origins)
            .allow_methods(Any)
            .allow_headers(Any);
    }


    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(Any)
        .allow_headers(Any)
}
