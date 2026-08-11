use anyhow::Result;

/// Port for converting raw image bytes to AVIF format.
/// Implementations live in the infrastructure layer.
pub trait ImageCompressor: Send + Sync {
    fn compress_to_avif(&self, bytes: &[u8], quality: u8) -> Result<Vec<u8>>;
}
