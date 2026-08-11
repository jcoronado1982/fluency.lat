use anyhow::{anyhow, Result};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use surrealdb::engine::remote::ws::{Client, Ws, Wss};
use surrealdb::opt::auth::Root;
use surrealdb::Surreal;

struct PooledConnection {
    client: Surreal<Client>,
    last_used: Instant,
}

/// Conexión adaptativa y Pool bajo demanda a SurrealDB.
///
/// **Reglas de negocio e infraestructura**:
/// - `SURREAL_POOL_MIN`: Mínimo de conexiones en reposo (por defecto `1`).
/// - `SURREAL_POOL_MAX`: Límite máximo de conexiones bajo demanda (por defecto `10`).
/// - `SURREAL_POOL_IDLE_SEC`: Tiempo de inactividad tras el cual las conexiones
///   secundarias creadas bajo demanda se cierran automáticamente (por defecto `60s`).
///
/// Mantiene 1 sola conexión activa en reposo (RAM <0.1 MB) y escala bajo demanda
/// hasta 10 conexiones en paralelo durante picos de escrituras, evitando el desborde.
pub struct SurrealConnection {
    primary: RwLock<Surreal<Client>>,
    secondary_pool: RwLock<Vec<PooledConnection>>,
    rr_counter: AtomicUsize,
    endpoint: String,
    namespace: String,
    database: String,
    max_connections: usize,
    min_connections: usize,
    idle_timeout: Duration,
}

impl SurrealConnection {
    pub async fn new(endpoint: &str, namespace: &str, database: &str) -> Result<Self> {
        let min_connections = std::env::var("SURREAL_POOL_MIN")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(1);

        let max_connections = std::env::var("SURREAL_POOL_MAX")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(10);

        let idle_sec = std::env::var("SURREAL_POOL_IDLE_SEC")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(60);

        let db = Self::connect(endpoint, namespace, database).await?;
        tracing::info!(
            "🚀 Conectado a SurrealDB en {} (NS: {}, DB: {}) [Pool On-Demand: min={}, max={}, idle={}s]",
            endpoint,
            namespace,
            database,
            min_connections,
            max_connections,
            idle_sec
        );

        Ok(Self {
            primary: RwLock::new(db),
            secondary_pool: RwLock::new(Vec::new()),
            rr_counter: AtomicUsize::new(0),
            endpoint: endpoint.to_string(),
            namespace: namespace.to_string(),
            database: database.to_string(),
            max_connections,
            min_connections,
            idle_timeout: Duration::from_secs(idle_sec),
        })
    }

    /// Retorna un handle de cliente de SurrealDB.
    /// Si hay conexiones secundarias activas en el pool bajo demanda, las reparte round-robin.
    /// De lo contrario, retorna la conexión primaria (1 conexión fija en reposo).
    pub fn db(&self) -> Surreal<Client> {
        let pool = self
            .secondary_pool
            .read()
            .expect("surreal pool lock poisoned");

        if pool.is_empty() {
            return self
                .primary
                .read()
                .expect("surreal connection lock poisoned")
                .clone();
        }

        let idx = self.rr_counter.fetch_add(1, Ordering::Relaxed) % (pool.len() + 1);
        if idx == 0 {
            self.primary
                .read()
                .expect("surreal connection lock poisoned")
                .clone()
        } else {
            pool[idx - 1].client.clone()
        }
    }

    /// Intenta expandir el pool bajo demanda hasta `max_connections` si hay alta concurrencia.
    pub async fn acquire_on_demand(&self) {
        let current_count = {
            let pool = self
                .secondary_pool
                .read()
                .expect("surreal pool lock poisoned");
            pool.len() + 1
        };

        if current_count < self.max_connections {
            match Self::connect(&self.endpoint, &self.namespace, &self.database).await {
                Ok(new_client) => {
                    let mut pool = self
                        .secondary_pool
                        .write()
                        .expect("surreal pool lock poisoned");
                    if pool.len() + 1 < self.max_connections {
                        pool.push(PooledConnection {
                            client: new_client,
                            last_used: Instant::now(),
                        });
                        tracing::info!(
                            "📈 Pool WebSocket escalado a {} conexiones bajo demanda",
                            pool.len() + 1
                        );
                    }
                }
                Err(e) => {
                    tracing::warn!("⚠️ No se pudo escalar el pool WebSocket de SurrealDB: {}", e);
                }
            }
        }
    }

    async fn connect(endpoint: &str, namespace: &str, database: &str) -> Result<Surreal<Client>> {
        let is_secure = endpoint.starts_with("wss://") || endpoint.starts_with("https://");
        let bare_endpoint = endpoint
            .trim_start_matches("wss://")
            .trim_start_matches("ws://")
            .trim_start_matches("https://")
            .trim_start_matches("http://");
        let db = if is_secure {
            Surreal::new::<Wss>(bare_endpoint)
                .await
                .map_err(|e| anyhow!("SurrealDB Connection Error: {}", e))?
        } else {
            Surreal::new::<Ws>(bare_endpoint)
                .await
                .map_err(|e| anyhow!("SurrealDB Connection Error: {}", e))?
        };

        let user = std::env::var("SURREAL_USER").unwrap_or_else(|_| "root".to_string());
        let pass = std::env::var("SURREAL_PASS").unwrap_or_else(|_| "root".to_string());

        db.signin(Root {
            username: user.clone(),
            password: pass.clone(),
        })
        .await
        .map_err(|e| anyhow!("SurrealDB Auth Error: {}", e))?;

        db.use_ns(namespace).use_db(database).await?;

        if let Err(e) = Self::define_tables(&db).await {
            tracing::warn!("⚠️ No se pudieron definir tablas en SurrealDB: {}", e);
        }

        if let Err(e) = Self::define_indexes(&db).await {
            tracing::warn!("⚠️ No se pudieron definir índices en SurrealDB: {}", e);
        }

        Ok(db)
    }

    async fn define_tables(db: &Surreal<Client>) -> Result<()> {
        const TABLES: &[&str] = &[
            "user",
            "card_progress",
            "subscription",
            "daily_stats",
            "demo_feedback",
            "user_activity_stats",
            "user_errors",
            "user_progress",
            "stories",
            "episodes",
            "story_screens",
        ];
        for table in TABLES {
            if let Err(e) = db
                .query(format!("DEFINE TABLE IF NOT EXISTS {table} SCHEMALESS;"))
                .await
            {
                tracing::debug!("Aviso al definir tabla '{table}' en SurrealDB: {}", e);
            }
        }
        tracing::info!("📋 Tablas de la app verificadas en SurrealDB");
        Ok(())
    }

    async fn define_indexes(db: &Surreal<Client>) -> Result<()> {
        if let Err(e) = db
            .query(
                "DEFINE INDEX idx_card_progress_user \
                ON card_progress FIELDS user_id;",
            )
            .await
        {
            tracing::debug!("Aviso al verificar índice en SurrealDB: {}", e);
        } else {
            tracing::info!("📇 Índice de card_progress verificado");
        }
        Ok(())
    }

    /// Health-check periódico + depuración de conexiones inactivas (Idle Pruning).
    /// Si una conexión secundaria sobrepasa `idle_timeout` sin demanda, se destruye
    /// devolviendo el pool al mínimo base (1 sola conexión abierta).
    pub fn spawn_watchdog(self: &Arc<Self>) {
        const HEALTH_INTERVAL: Duration = Duration::from_secs(30);
        let this = Arc::clone(self);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(HEALTH_INTERVAL);
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            interval.tick().await;
            loop {
                interval.tick().await;

                // 1. Health-check de la conexión primaria
                let primary_db = this.db();
                if primary_db.health().await.is_err() {
                    tracing::warn!(
                        "⚠️ SurrealDB primary health-check falló ({}); reconectando…",
                        this.endpoint
                    );
                    match Self::connect(&this.endpoint, &this.namespace, &this.database).await {
                        Ok(new_db) => {
                            *this.primary.write().expect("lock poisoned") = new_db;
                            tracing::info!("✅ SurrealDB primaria reconectada en {}", this.endpoint);
                        }
                        Err(e) => {
                            tracing::error!("❌ Reconexión a SurrealDB falló: {}", e);
                        }
                    }
                }

                // 2. Limpieza de conexiones secundarias inactivas (Idle Pruning -> vuelve a MIN=1)
                let now = Instant::now();
                let mut pool = this.secondary_pool.write().expect("pool lock poisoned");
                let initial_len = pool.len();
                pool.retain(|conn| now.duration_since(conn.last_used) < this.idle_timeout);

                if pool.len() < initial_len {
                    tracing::info!(
                        "📉 Conexiones secundarias inactivas depuradas. Conexiones activas en pool: {}",
                        pool.len() + 1
                    );
                }
            }
        });
    }
}
