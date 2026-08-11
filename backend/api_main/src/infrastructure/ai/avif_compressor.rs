use crate::domain::repositories::image_compressor::ImageCompressor;
use crate::infrastructure::ai::compress::compress_bytes_to_avif;
use anyhow::Result;
use std::sync::mpsc;
use std::thread;

const AVIF_THREAD_STACK: usize = 8 * 1024 * 1024;

/// Adapter that compresses raw image bytes (PNG/JPEG) to AVIF.
/// AVIF encoding needs a large stack; tokio worker threads use ~2MB and overflow.
pub struct AvifCompressor;

impl ImageCompressor for AvifCompressor {
    fn compress_to_avif(&self, image_bytes: &[u8], quality: u8) -> Result<Vec<u8>> {
        let bytes = image_bytes.to_vec();
        let (tx, rx) = mpsc::channel();

        thread::Builder::new()
            .stack_size(AVIF_THREAD_STACK)
            .name("avif-compress".into())
            .spawn(move || {
                let _ = tx.send(compress_bytes_to_avif(&bytes, quality));
            })
            .map_err(|e| anyhow::anyhow!("avif thread spawn: {e}"))?;

        rx.recv()
            .map_err(|_| anyhow::anyhow!("avif compression thread dropped"))?
            .map_err(|e| anyhow::anyhow!(e))
    }
}
