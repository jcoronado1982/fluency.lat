use fluency_core::ports::media_delivery::{MediaCachePolicy, MediaDeliveryProvider};

/// Entrega directa desde Oracle/Caddy: el navegador conserva las URLs versionadas.
pub struct OracleMediaDeliveryProvider;

impl MediaDeliveryProvider for OracleMediaDeliveryProvider {
    fn name(&self) -> &'static str {
        "oracle"
    }

    fn cache_policy(&self, versioned: bool) -> MediaCachePolicy {
        MediaCachePolicy {
            browser_cache_control: if versioned {
                "public, max-age=31536000, immutable"
            } else {
                "public, no-cache"
            },
            shared_cache_control: None,
        }
    }
}
