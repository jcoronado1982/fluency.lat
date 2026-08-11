use async_trait::async_trait;
use fluency_core::ports::geo_ip::GeoIpLookup;

/// Geolocalización de IP vía ip-api.com (plan gratuito, sin API key).
pub struct IpApiGeoLookup {
    client: reqwest::Client,
}

impl IpApiGeoLookup {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }
}

impl Default for IpApiGeoLookup {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl GeoIpLookup for IpApiGeoLookup {
    async fn lookup_country(&self, ip: &str) -> Option<String> {
        let url = format!("http://ip-api.com/json/{ip}?fields=country");
        let response = self.client.get(&url).send().await.ok()?;
        let json: serde_json::Value = response.json().await.ok()?;
        json.get("country")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    }
}
