use fluency_core::ports::media_delivery::{
    MediaCachePolicy, MediaDeliveryProvider, SharedCacheControl,
};

/// Cloudflare conserva el asset versionado; el navegador revalida contra el edge.
pub struct CloudflareMediaDeliveryProvider;

impl MediaDeliveryProvider for CloudflareMediaDeliveryProvider {
    fn name(&self) -> &'static str {
        "cloudflare"
    }

    fn cache_policy(&self, versioned: bool) -> MediaCachePolicy {
        MediaCachePolicy {
            browser_cache_control: "public, no-cache",
            shared_cache_control: Some(SharedCacheControl {
                header_name: "cloudflare-cdn-cache-control",
                value: if versioned {
                    "public, max-age=31536000"
                } else {
                    "public, no-cache"
                },
            }),
        }
    }
}
