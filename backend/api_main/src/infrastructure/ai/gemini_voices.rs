//! Voces Gemini-TTS soportadas (AI Studio + Cloud).
//! Género según documentación oficial de Cloud TTS Gemini.

/// Voces masculinas (Google Cloud Gemini-TTS).
#[allow(dead_code)]
pub const GEMINI_MALE_VOICES: &[&str] = &[
    "Algenib",
    "Algieba",
    "Alnilam",
    "Charon",
    "Enceladus",
    "Iapetus",
    "Orus",
    "Fenrir",
    "Puck",
    "Sadaltager",
    "Umbriel",
];

/// Voces femeninas — incluye las de tu lista original.
#[allow(dead_code)]
pub const GEMINI_FEMALE_VOICES: &[&str] = &[
    "Achernar",
    "Autonoe",
    "Callirrhoe",
    "Erinome",
    "Gacrux",
    "Kore",
    "Laomedeia",
    "Sulafat",
    "Zephyr",
    "Aoede",
];

/// Unión de ambos pools (validación y fallback).
pub const GEMINI_VOICE_POOL: &[&str] = &[
    "Achernar",
    "Algenib",
    "Algieba",
    "Alnilam",
    "Autonoe",
    "Aoede",
    "Callirrhoe",
    "Charon",
    "Enceladus",
    "Erinome",
    "Fenrir",
    "Gacrux",
    "Iapetus",
    "Kore",
    "Laomedeia",
    "Orus",
    "Puck",
    "Sadaltager",
    "Sulafat",
    "Umbriel",
    "Zephyr",
];

#[allow(dead_code)]
pub fn is_gemini_voice(name: &str) -> bool {
    GEMINI_VOICE_POOL
        .iter()
        .any(|v| v.eq_ignore_ascii_case(name))
}

pub fn normalize_gemini_voice(name: &str) -> &'static str {
    GEMINI_VOICE_POOL
        .iter()
        .find(|v| v.eq_ignore_ascii_case(name))
        .copied()
        .unwrap_or("Charon")
}

#[allow(dead_code)]
pub fn is_male_voice(name: &str) -> bool {
    GEMINI_MALE_VOICES
        .iter()
        .any(|v| v.eq_ignore_ascii_case(name))
}
