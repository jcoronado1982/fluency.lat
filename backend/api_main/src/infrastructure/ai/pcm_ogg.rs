//! Encode 16-bit PCM (s16le) mono into Ogg Opus (RFC 7845).

use std::io::Cursor;

use anyhow::{anyhow, Result};
use ogg::writing::PacketWriteEndInfo;
use ogg::PacketWriter;
use ropus::{Application, Bitrate, Channels, Encoder};

const FRAME_MS: u32 = 20;
const BITRATE: u32 = 32_000;
const COMPLEXITY: u8 = 10;
const MAX_PACKET: usize = 4000;
/// Granule positions are in 48 kHz samples (RFC 7845 §4).
const FRAME_SAMPLES_AT_48K: u64 = 960;
const STREAM_SERIAL: u32 = 0xC0DE_C0DE;

/// Converts raw PCM s16le mono bytes into an Ogg Opus container.
pub fn pcm_s16le_mono_to_ogg(pcm: &[u8], sample_rate: u32) -> Result<Vec<u8>> {
    if pcm.len() < 2 {
        return Err(anyhow!("PCM vacío"));
    }

    let samples: Vec<i16> = pcm
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]))
        .collect();

    let channels = Channels::Mono;
    let frame_per_channel = (sample_rate * FRAME_MS / 1000) as usize;
    let frame_interleaved = frame_per_channel * channels.count();

    let mut encoder = Encoder::builder(sample_rate, channels, Application::Audio)
        .bitrate(Bitrate::Bits(BITRATE))
        .complexity(COMPLEXITY)
        .build()
        .map_err(|e| anyhow!("Opus encoder: {e}"))?;

    let pre_skip = u16::try_from(encoder.lookahead()).unwrap_or(312);

    let mut writer = PacketWriter::new(Cursor::new(Vec::new()));

    let head = build_opus_head(channels.count() as u8, sample_rate, pre_skip);
    writer
        .write_packet(head, STREAM_SERIAL, PacketWriteEndInfo::EndPage, 0)
        .map_err(|e| anyhow!("Ogg OpusHead: {e}"))?;

    let tags = build_opus_tags("flashcard-ai");
    writer
        .write_packet(tags, STREAM_SERIAL, PacketWriteEndInfo::EndPage, 0)
        .map_err(|e| anyhow!("Ogg OpusTags: {e}"))?;

    let mut packets: Vec<Vec<u8>> = Vec::new();
    let mut packet_buf = vec![0u8; MAX_PACKET];
    let mut pcm_frame = vec![0i16; frame_interleaved];
    let mut idx = 0usize;

    while idx < samples.len() {
        let take = (samples.len() - idx).min(frame_interleaved);
        pcm_frame[..take].copy_from_slice(&samples[idx..idx + take]);
        if take < frame_interleaved {
            pcm_frame[take..].fill(0);
        }
        idx += take;
        let n = encoder
            .encode(&pcm_frame, &mut packet_buf)
            .map_err(|e| anyhow!("Opus encode: {e}"))?;
        packets.push(packet_buf[..n].to_vec());
    }

    if packets.is_empty() {
        return Err(anyhow!("PCM produjo cero paquetes Opus"));
    }

    let mut samples_so_far: u64 = 0;
    let last = packets.len() - 1;
    for (i, packet) in packets.iter().enumerate() {
        samples_so_far += FRAME_SAMPLES_AT_48K;
        let info = if i == last {
            PacketWriteEndInfo::EndStream
        } else {
            PacketWriteEndInfo::NormalPacket
        };
        writer
            .write_packet(packet.clone(), STREAM_SERIAL, info, samples_so_far)
            .map_err(|e| anyhow!("Ogg packet: {e}"))?;
    }

    Ok(writer.into_inner().into_inner())
}

fn build_opus_head(channels: u8, input_sample_rate: u32, pre_skip: u16) -> Vec<u8> {
    let mut h = Vec::with_capacity(19);
    h.extend_from_slice(b"OpusHead");
    h.push(1);
    h.push(channels);
    h.extend_from_slice(&pre_skip.to_le_bytes());
    h.extend_from_slice(&input_sample_rate.to_le_bytes());
    h.extend_from_slice(&0i16.to_le_bytes());
    h.push(0);
    h
}

fn build_opus_tags(vendor: &str) -> Vec<u8> {
    let v = vendor.as_bytes();
    let mut t = Vec::with_capacity(8 + 4 + v.len() + 4);
    t.extend_from_slice(b"OpusTags");
    t.extend_from_slice(&(v.len() as u32).to_le_bytes());
    t.extend_from_slice(v);
    t.extend_from_slice(&0u32.to_le_bytes());
    t
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pcm_to_ogg_produces_opus_container() {
        let sample_rate = 24_000;
        let frame = (sample_rate * FRAME_MS / 1000) as usize;
        let mut pcm = Vec::with_capacity(frame * 2 * 3);
        for _ in 0..(frame * 3) {
            pcm.extend_from_slice(&0i16.to_le_bytes());
        }

        let ogg = pcm_s16le_mono_to_ogg(&pcm, sample_rate).expect("encode ok");
        assert!(ogg.starts_with(b"OggS"), "debe ser contenedor Ogg");
        assert!(
            ogg.windows(8).any(|w| w == b"OpusHead"),
            "debe incluir OpusHead"
        );
    }
}
