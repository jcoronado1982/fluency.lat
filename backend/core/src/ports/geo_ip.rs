use async_trait::async_trait;

/// Resuelve el país aproximado de una IP pública. El caso de uso (`PresenceUseCases`)
/// nunca habla HTTP directo — eso es responsabilidad del adapter concreto en
/// `api_main/src/infrastructure`. `None` significa "no se pudo determinar" (IP privada,
/// proveedor caído, etc.) — no es un error fatal para el flujo de presencia.
#[async_trait]
pub trait GeoIpLookup: Send + Sync {
    async fn lookup_country(&self, ip: &str) -> Option<String>;
}
