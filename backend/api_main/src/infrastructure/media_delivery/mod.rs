mod cloudflare_provider;
mod oracle_provider;

use anyhow::Result;
use cloudflare_provider::CloudflareMediaDeliveryProvider;
use fluency_core::ports::media_delivery::MediaDeliveryProvider;
use oracle_provider::OracleMediaDeliveryProvider;
use std::sync::Arc;

/// Composition factory: es el único punto que conoce los nombres configurables.
pub fn provider_from_name(name: &str) -> Result<Arc<dyn MediaDeliveryProvider>> {
    match name.trim().to_ascii_lowercase().as_str() {
        "oracle" => Ok(Arc::new(OracleMediaDeliveryProvider)),
        "cloudflare" => Ok(Arc::new(CloudflareMediaDeliveryProvider)),
        other => anyhow::bail!(
            "MEDIA_DELIVERY_MODE inválido: '{other}'. Proveedores: oracle, cloudflare"
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::provider_from_name;

    #[test]
    fn factory_selects_registered_providers() {
        let oracle = provider_from_name("oracle").unwrap();
        assert_eq!(oracle.name(), "oracle");
        assert_eq!(
            oracle.cache_policy(true).browser_cache_control,
            "public, max-age=31536000, immutable"
        );
        assert!(oracle.cache_policy(true).shared_cache_control.is_none());

        let cloudflare = provider_from_name("CLOUDFLARE").unwrap();
        assert_eq!(cloudflare.name(), "cloudflare");
        assert_eq!(
            cloudflare
                .cache_policy(true)
                .shared_cache_control
                .unwrap()
                .header_name,
            "cloudflare-cdn-cache-control"
        );
        assert!(provider_from_name("unknown").is_err());
    }
}
