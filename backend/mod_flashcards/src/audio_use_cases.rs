use anyhow::Result;
use fluency_core::ports::audio::AudioGenerator;
use fluency_core::ports::storage::StorageRepository;
use fluency_core::ports::tutor::AITutor;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;

use crate::{
    is_landing_demo_namespace, normalize_course_direction, safe_deck_prefix, safe_language_suffix,
    safe_storage_segment, FlashcardsConfig,
};

/// Huella estable de caché: se conserva para no regenerar audios ya existentes al cambiar de
/// modelo TTS. Valor intencionalmente igual al `GEMINI_TTS_MODEL` de
/// `infrastructure/ai/gemini_tts_provider.rs` (duplicado documentado, no importar entre crates:
/// `mod_flashcards` no puede depender de `api_main`) — es dato de versionado de caché, no
/// comportamiento que dependa del proveedor en tiempo de ejecución.
const TTS_MODEL_CACHE_KEY: &str = "gemini-2.5-flash-preview-tts";
const SPANISH_TTS_BACKEND: &str = "ai-studio-gemini-es-419-v1";
const ELEVENLABS_TTS_BACKEND: &str = "elevenlabs-premade-v1";

/// Bump al cambiar esquema de caché de audio.
const UNIFIED_AUDIO_FORMAT: &str = "random-voice-v2";

/// Convierte un email en un segmento de path seguro para URL/filesystem.
fn user_path_segment(email: &str) -> String {
    email
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect()
}

fn normalize_role(role: &str) -> String {
    role.trim().to_ascii_lowercase()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AudioMeta {
    voice: String,
}

pub struct AudioSynthResult {
    pub audio_url: String,
    pub voice_name: String,
    pub from_cache: bool,
}

// ---------------------------------------------------------------------------
// Application-layer DTOs (no serde, no HTTP concerns)
// ---------------------------------------------------------------------------

pub struct AudioSynthRequest {
    pub category: String,
    pub deck: String,
    pub text: String,
    pub voice_name: String,
    pub verb_name: Option<String>,
    pub tone: Option<String>,
    pub lang: Option<String>,
    pub course_direction: Option<String>,
    /// Voz a excluir al generar (p. ej. tras rotar).
    pub exclude_voice: Option<String>,
    /// Tras rotar voz: ignorar caché y regenerar TTS.
    pub force_regenerate: bool,
}

pub struct AudioUseCases {
    storage_repo: Arc<dyn StorageRepository>,
    audio_gen: Arc<dyn AudioGenerator>,
    landing_demo_audio_gen: Option<Arc<dyn AudioGenerator>>,
    config: Arc<FlashcardsConfig>,
}

impl AudioUseCases {
    pub fn new(
        storage_repo: Arc<dyn StorageRepository>,
        audio_gen: Arc<dyn AudioGenerator>,
        landing_demo_audio_gen: Option<Arc<dyn AudioGenerator>>,
        _ai_tutor: Arc<dyn AITutor>,
        config: Arc<FlashcardsConfig>,
    ) -> Self {
        Self {
            storage_repo,
            audio_gen,
            landing_demo_audio_gen,
            config,
        }
    }

    /// Misma instancia con otro generador TTS (p. ej. batch local con clave de respaldo).
    pub fn with_audio_generator(&self, audio_gen: Arc<dyn AudioGenerator>) -> Self {
        Self {
            storage_repo: Arc::clone(&self.storage_repo),
            audio_gen,
            landing_demo_audio_gen: self.landing_demo_audio_gen.clone(),
            config: Arc::clone(&self.config),
        }
    }

    /// Comprueba si el audio global (capa admin) ya está en storage.
    pub async fn global_audio_exists(&self, req: &AudioSynthRequest) -> Result<bool> {
        let blob_path = self.global_audio_blob_path(req)?;
        self.storage_repo.blob_exists(&blob_path).await
    }

    /// Nombre de archivo OGG global (sin prefijo `card_audio/`).
    pub fn global_audio_basename(&self, req: &AudioSynthRequest) -> Result<String> {
        Ok(self
            .deterministic_audio_filename(req, None, false)?
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_string())
    }

    /// Ruta completa del blob global (p. ej. para logs del batch).
    pub fn global_audio_blob_path(&self, req: &AudioSynthRequest) -> Result<String> {
        let file_name = self.deterministic_audio_filename(req, None, false)?;
        Ok(format!("{}/{}", self.config.gcs_audio_prefix, file_name))
    }

    /// Precarga audio en la **capa global compartida** (misma ruta que si un admin lo genera desde la UI).
    ///
    /// - Guarda bajo `card_audio/{category}/{deck}/...` (sin `users/…`).
    /// - Viewer / premium lo reciben vía fallback global en `get_or_synthesize_audio`.
    /// - Equivalente al batch de imágenes con rol `admin`.
    pub async fn get_or_synthesize_shared_global_audio(
        &self,
        req: &AudioSynthRequest,
    ) -> Result<(AudioSynthResult, bool)> {
        let is_new = !self.global_audio_exists(req).await.unwrap_or(false);
        let result = self.get_or_synthesize_audio(req, "batch", "admin").await?;
        Ok((result, is_new))
    }

    /// Devuelve URL si el audio ya existe en disco. **No genera TTS** (ideal para viewers).
    pub async fn resolve_audio(
        &self,
        req: &AudioSynthRequest,
        user_email: &str,
        role: &str,
    ) -> Result<Option<AudioSynthResult>> {
        self.lookup_existing_audio(req, user_email, role, false)
            .await
    }

    /// Devuelve URL + voz activa. Si existe audio, no regenera.
    pub async fn get_or_synthesize_audio(
        &self,
        req: &AudioSynthRequest,
        user_email: &str,
        role: &str,
    ) -> Result<AudioSynthResult> {
        tracing::info!(
            "🎧 Audio request: lang='{}', category='{}', deck='{}', verb='{:?}', text='{}', user='{}', role='{}'",
            req.lang.as_deref().unwrap_or("(none)"),
            req.category,
            req.deck,
            req.verb_name,
            req.text,
            user_email,
            role,
        );

        let force_new = req.force_regenerate || req.exclude_voice.is_some();
        if !force_new {
            if let Some(result) = self
                .lookup_existing_audio(req, user_email, role, true)
                .await?
            {
                return Ok(result);
            }
        } else {
            tracing::info!("🔄 Regeneración forzada (sin caché) para demo/app");
        }

        let role = normalize_role(role);
        let is_admin = role == "admin";
        let is_premium = role == "premium";
        let is_demo = is_landing_demo_namespace(&req.category);
        let user_segment = if is_admin || is_demo {
            None
        } else {
            Some(user_path_segment(user_email))
        };
        let demo_elevenlabs = self.uses_elevenlabs_demo(is_demo);

        if !is_admin && !is_premium && !is_demo {
            tracing::warn!(
                "🚫 Generación bloqueada: user='{}' role='{}' text='{}'",
                user_email,
                role,
                req.text
            );
            return Err(anyhow::anyhow!("audio_not_found"));
        }

        if demo_elevenlabs {
            let demo_gen = self
                .landing_demo_audio_gen
                .as_ref()
                .expect("demo_elevenlabs implies provider");
            let (label, id) = demo_gen.pick_voice(req.exclude_voice.as_deref());
            let file_name =
                self.deterministic_audio_filename(req, user_segment.as_deref(), true)?;
            let blob_path = format!("{}/{}", self.config.gcs_audio_prefix, file_name);

            match demo_gen
                .synthesize(&req.text, &id, req.lang.as_deref())
                .await
            {
                Ok(bytes) => {
                    tracing::info!("✨ Demo ElevenLabs → {} (voz={})", blob_path, label);
                    self.storage_repo
                        .upload_blob(&blob_path, bytes, Self::audio_mime_type(true))
                        .await?;
                    self.write_voice_meta(&blob_path, &label).await?;
                    return Ok(self.build_result(&file_name, &label, false).await);
                }
                Err(e) if Self::elevenlabs_plan_unavailable(&e.to_string()) => {
                    tracing::warn!(
                        "ElevenLabs demo no disponible (plan/cuota API): {} → Google TTS",
                        e
                    );
                }
                Err(e) => return Err(e),
            }
        }

        let (voice, voice_id) = self.audio_gen.pick_voice(req.exclude_voice.as_deref());
        let file_name = self.deterministic_audio_filename(req, user_segment.as_deref(), false)?;
        let blob_path = format!("{}/{}", self.config.gcs_audio_prefix, file_name);

        tracing::info!(
            "✨ Generando audio → {} (voz={}, elevenlabs=false)",
            blob_path,
            voice
        );

        let audio_bytes = self
            .audio_gen
            .synthesize(&req.text, &voice_id, req.lang.as_deref())
            .await?;

        self.storage_repo
            .upload_blob(&blob_path, audio_bytes, Self::audio_mime_type(false))
            .await?;
        self.write_voice_meta(&blob_path, &voice).await?;

        Ok(self.build_result(&file_name, &voice, false).await)
    }

    async fn lookup_existing_audio(
        &self,
        req: &AudioSynthRequest,
        user_email: &str,
        role: &str,
        log_miss: bool,
    ) -> Result<Option<AudioSynthResult>> {
        let role = normalize_role(role);
        let is_demo = is_landing_demo_namespace(&req.category);
        // Solo Premium puede tener audio personal. Viewer/guest nunca genera en
        // users/{email}, así que consultar esa ruta agregaba un HEAD inútil.
        let personal_segment = (role == "premium").then(|| user_path_segment(user_email));
        let demo_elevenlabs = self.uses_elevenlabs_demo(is_demo);
        let force_new = req.force_regenerate || req.exclude_voice.is_some();

        if force_new {
            return Ok(None);
        }

        if demo_elevenlabs {
            let el_name = self.deterministic_audio_filename(req, None, true)?;
            if let Some(result) = self.try_cached_audio(&el_name).await? {
                return Ok(Some(result));
            }
        }

        if let Some(segment) = personal_segment.as_deref() {
            let personal_file = self.deterministic_audio_filename(req, Some(segment), false)?;
            if let Some(result) = self.try_cached_audio(&personal_file).await? {
                return Ok(Some(result));
            }
        }

        let global_file = self.deterministic_audio_filename(req, None, false)?;
        if let Some(legacy_file) = Self::legacy_deterministic_audio_filename(&global_file) {
            // La biblioteca pregenerada vive mayoritariamente en el layout sin
            // dirección. Consultar ambos nombres a la vez conserva la prioridad
            // del formato actual sin sumar dos RTT secuenciales contra Oracle.
            let (current, legacy) = tokio::join!(
                self.cached_audio_result(&global_file, ""),
                self.cached_audio_result(&legacy_file, "Legacy"),
            );
            if let Some(result) = current {
                tracing::info!("✅ Audio global activo: {}", global_file);
                return Ok(Some(result));
            }
            if let Some(result) = legacy {
                tracing::info!("✅ Audio legacy exacto: {}", legacy_file);
                return Ok(Some(result));
            }
        } else if let Some(result) = self.cached_audio_result(&global_file, "").await {
            tracing::info!("✅ Audio global activo: {}", global_file);
            return Ok(Some(result));
        }

        let deck_prefix = safe_deck_prefix(&req.deck)?;
        let verb_slug = self.slugify(&req.verb_name.as_deref().unwrap_or("none"), 40);
        let text_slug = self.slugify(&req.text, 40);
        let lang_suffix = safe_language_suffix(req.lang.as_deref())?;

        // Fallback para hashes/modelos/formato realmente antiguos cuyo nombre
        // no coincide con el determinista actual. Este listado ya no participa
        // en el camino normal de la biblioteca existente.
        if let Some(found) = self
            .find_legacy_audio(req, &deck_prefix, &verb_slug, &text_slug, &lang_suffix)
            .await?
        {
            tracing::info!("✅ Audio legacy por prefijo: {}", found);
            let rel = found
                .strip_prefix(&self.config.gcs_audio_prefix)
                .unwrap_or(&found)
                .trim_start_matches('/');
            return Ok(Some(self.build_result(rel, "Legacy", true).await));
        }

        if log_miss {
            tracing::debug!("🔍 Audio no encontrado en disco para text='{}'", req.text);
        }
        Ok(None)
    }

    fn legacy_deterministic_audio_filename(file_name: &str) -> Option<String> {
        let (direction, relative) = file_name.split_once('/')?;
        matches!(direction, "es_en" | "en_es").then(|| relative.to_string())
    }

    /// Archiva el audio activo (no borra del disco) para permitir otra voz aleatoria.
    pub async fn rotate_audio(
        &self,
        req: &AudioSynthRequest,
        user_email: &str,
        is_admin: bool,
    ) -> Result<Option<String>> {
        let user_segment = if is_admin {
            None
        } else {
            Some(user_path_segment(user_email))
        };
        let file_name = self.deterministic_audio_filename(req, user_segment.as_deref(), false)?;
        let blob_path = format!("{}/{}", self.config.gcs_audio_prefix, file_name);

        if self
            .storage_repo
            .blob_exists(&blob_path)
            .await
            .unwrap_or(false)
        {
            return self.archive_active_blob(&blob_path).await;
        }

        if self.uses_elevenlabs_demo(is_landing_demo_namespace(&req.category)) {
            let el_name = self.deterministic_audio_filename(req, user_segment.as_deref(), true)?;
            let el_path = format!("{}/{}", self.config.gcs_audio_prefix, el_name);
            if self
                .storage_repo
                .blob_exists(&el_path)
                .await
                .unwrap_or(false)
            {
                return self.archive_active_blob(&el_path).await;
            }
        }

        let deck_prefix = safe_deck_prefix(&req.deck)?;
        let verb_slug = self.slugify(&req.verb_name.as_deref().unwrap_or("none"), 40);
        let text_slug = self.slugify(&req.text, 40);
        let lang_suffix = safe_language_suffix(req.lang.as_deref())?;

        if let Some(legacy) = self
            .find_legacy_audio(req, &deck_prefix, &verb_slug, &text_slug, &lang_suffix)
            .await?
        {
            tracing::info!("📦 Archivando audio legacy: {}", legacy);
            return self.archive_active_blob(&legacy).await;
        }

        Ok(None)
    }

    async fn archive_active_blob(&self, blob_path: &str) -> Result<Option<String>> {
        let meta_path = Self::meta_blob_path(blob_path);
        let voice = self
            .read_voice_meta(blob_path)
            .await
            .unwrap_or_else(|| "Legacy".into());
        let ts = chrono::Utc::now().timestamp();
        let archive_audio = Self::archive_blob_path(blob_path, &voice, ts);
        let archive_meta = Self::archive_meta_path(blob_path, &voice, ts);

        self.storage_repo
            .rename_blob(blob_path, &archive_audio)
            .await?;
        if self
            .storage_repo
            .blob_exists(&meta_path)
            .await
            .unwrap_or(false)
        {
            let _ = self
                .storage_repo
                .rename_blob(&meta_path, &archive_meta)
                .await;
        }

        tracing::info!(
            "📦 Audio archivado (sin borrar): {} → {} (voz anterior={})",
            blob_path,
            archive_audio,
            voice
        );
        Ok(Some(voice))
    }

    pub async fn synthesize(
        &self,
        text: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        self.audio_gen.synthesize(text, voice_name, lang).await
    }

    pub async fn download_blob(&self, blob_path: &str) -> Result<Vec<u8>> {
        self.storage_repo.download_blob(blob_path).await
    }

    async fn build_result(
        &self,
        file_name: &str,
        voice: &str,
        from_cache: bool,
    ) -> AudioSynthResult {
        let audio_url = if !from_cache {
            // La generación ya tiene un identificador único: no hacemos un stat/HEAD
            // adicional en el camino costoso de TTS.
            format!("/card_audio/{file_name}?v={}", uuid::Uuid::new_v4())
        } else {
            let blob_path = format!("{}/{}", self.config.gcs_audio_prefix, file_name);
            match self
                .storage_repo
                .blob_version(&blob_path)
                .await
                .ok()
                .flatten()
                .filter(|value| !value.is_empty())
            {
                Some(version) => format!("/card_audio/{file_name}?v={version}"),
                None => format!("/card_audio/{file_name}"),
            }
        };
        AudioSynthResult {
            audio_url,
            voice_name: voice.to_string(),
            from_cache,
        }
    }

    fn meta_blob_path(audio_blob_path: &str) -> String {
        format!("{}.meta.json", Self::audio_stem(audio_blob_path))
    }

    fn archive_blob_path(audio_blob_path: &str, voice: &str, ts: i64) -> String {
        format!(
            "{}.archive.{voice}_{ts}{}",
            Self::audio_stem(audio_blob_path),
            audio_blob_path
                .rsplit_once('.')
                .map(|(_, ext)| format!(".{ext}"))
                .unwrap_or_else(|| ".ogg".to_string())
        )
    }

    fn archive_meta_path(audio_blob_path: &str, voice: &str, ts: i64) -> String {
        format!(
            "{}.archive.{voice}_{ts}.meta.json",
            Self::audio_stem(audio_blob_path)
        )
    }

    async fn read_voice_meta(&self, audio_blob_path: &str) -> Option<String> {
        let meta_path = Self::meta_blob_path(audio_blob_path);
        let bytes = self.storage_repo.download_blob(&meta_path).await.ok()?;
        let meta: AudioMeta = serde_json::from_slice(&bytes).ok()?;
        Some(meta.voice)
    }

    async fn write_voice_meta(&self, audio_blob_path: &str, voice: &str) -> Result<()> {
        let meta_path = Self::meta_blob_path(audio_blob_path);
        let meta = AudioMeta {
            voice: voice.to_string(),
        };
        let json = serde_json::to_vec(&meta)?;
        self.storage_repo
            .upload_blob(&meta_path, json, "application/json")
            .await
    }

    async fn find_legacy_audio(
        &self,
        req: &AudioSynthRequest,
        deck_prefix: &str,
        verb_slug: &str,
        text_slug: &str,
        lang_suffix: &str,
    ) -> Result<Option<String>> {
        for prefix in Self::legacy_audio_prefixes(
            &self.config.gcs_audio_prefix,
            &req.category,
            req.course_direction.as_deref(),
            deck_prefix,
            verb_slug,
            text_slug,
            lang_suffix,
        ) {
            if let Ok(Some(found)) = self.storage_repo.find_blob_by_prefix(&prefix).await {
                return Ok(Some(found));
            }
        }

        Ok(None)
    }

    /// Prefijos de búsqueda de audio existente, en orden de preferencia.
    /// El sufijo de idioma forma parte del prefijo, así que solo matchea audio
    /// del mismo texto e idioma; la dirección solo decide la carpeta. Los
    /// layouts sin dirección quedan como fallback: albergan la biblioteca
    /// pregenerada (~5k archivos, era es_en) que no debe regenerarse.
    fn legacy_audio_prefixes(
        audio_prefix: &str,
        category: &str,
        course_direction: Option<&str>,
        deck_prefix: &str,
        verb_slug: &str,
        text_slug: &str,
        lang_suffix: &str,
    ) -> Vec<String> {
        let mut prefixes = Vec::new();

        // Formato actual: card_audio/{dirección}/{categoría}/…
        // El landing demo es la única excepción y vive sin dirección de curso.
        if !is_landing_demo_namespace(category) {
            prefixes.push(
                format!(
                    "{}/{}/{}/{}/{}_{}_{}{}",
                    audio_prefix,
                    normalize_course_direction(course_direction),
                    category,
                    deck_prefix,
                    deck_prefix,
                    verb_slug,
                    text_slug,
                    lang_suffix
                )
                .replace("//", "/"),
            );
        }

        // Compatibilidad con el layout anterior y con landing-demo.
        prefixes.push(
            format!(
                "{}/{}/{}/{}_{}_{}{}",
                audio_prefix, category, deck_prefix, deck_prefix, verb_slug, text_slug, lang_suffix
            )
            .replace("//", "/"),
        );
        prefixes.push(
            format!(
                "{}/{}/{}_{}_{}{}",
                audio_prefix, category, deck_prefix, verb_slug, text_slug, lang_suffix
            )
            .replace("//", "/"),
        );

        prefixes
    }

    fn elevenlabs_plan_unavailable(message: &str) -> bool {
        message.contains("paid_plan_required")
            || message.contains("402 Payment Required")
            || message.contains("library voices via the API")
            || message.contains("payment_required")
            || message.contains("quota_exceeded")
    }

    async fn try_cached_audio(&self, file_name: &str) -> Result<Option<AudioSynthResult>> {
        if let Some(result) = self.cached_audio_result(file_name, "").await {
            tracing::info!("✅ Audio activo encontrado: {}", file_name);
            return Ok(Some(result));
        }
        Ok(None)
    }

    /// Resuelve existencia + versión en una sola consulta de metadatos en el
    /// camino normal. Evita dos HEAD consecutivos contra Oracle al reproducir.
    async fn cached_audio_result(&self, file_name: &str, voice: &str) -> Option<AudioSynthResult> {
        let blob_path = format!("{}/{}", self.config.gcs_audio_prefix, file_name);
        let audio_url = match self
            .storage_repo
            .blob_version(&blob_path)
            .await
            .ok()
            .flatten()
            .filter(|value| !value.is_empty())
        {
            Some(version) => format!("/card_audio/{file_name}?v={version}"),
            None if self
                .storage_repo
                .blob_exists(&blob_path)
                .await
                .unwrap_or(false) =>
            {
                format!("/card_audio/{file_name}")
            }
            None => return None,
        };

        Some(AudioSynthResult {
            audio_url,
            voice_name: voice.to_string(),
            from_cache: true,
        })
    }

    fn audio_mime_type(elevenlabs: bool) -> &'static str {
        if elevenlabs {
            "audio/mpeg"
        } else {
            "audio/ogg"
        }
    }

    fn uses_elevenlabs_demo(&self, is_demo: bool) -> bool {
        is_demo && self.landing_demo_audio_gen.is_some()
    }

    fn audio_stem(blob_path: &str) -> &str {
        blob_path
            .rsplit_once('.')
            .map(|(stem, _)| stem)
            .unwrap_or(blob_path)
    }

    fn slugify(&self, text: &str, max_len: usize) -> String {
        let slug: String = text
            .chars()
            .take(max_len)
            .map(|c| {
                if c.is_alphanumeric() {
                    c.to_ascii_lowercase()
                } else {
                    '_'
                }
            })
            .collect();
        let parts: Vec<_> = slug.split('_').filter(|s| !s.is_empty()).collect();
        parts.join("_")
    }

    fn deterministic_audio_filename(
        &self,
        req: &AudioSynthRequest,
        user_segment: Option<&str>,
        elevenlabs: bool,
    ) -> Result<String> {
        let category = safe_storage_segment(&req.category, "category")?;
        let deck_prefix = safe_deck_prefix(&req.deck)?;
        let verb_norm = self.slugify(
            req.verb_name
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("none"),
            40,
        );
        let base_slug = self.slugify(&req.text, 40);

        let mut hasher = DefaultHasher::new();
        req.text.hash(&mut hasher);
        if let Some(seg) = user_segment {
            seg.hash(&mut hasher);
        }
        if let Some(lang) = req.lang.as_deref().filter(|s| !s.is_empty()) {
            lang.hash(&mut hasher);
            if lang.eq_ignore_ascii_case("es") || lang.starts_with("es-") {
                SPANISH_TTS_BACKEND.hash(&mut hasher);
            }
        }
        TTS_MODEL_CACHE_KEY.hash(&mut hasher);
        if is_landing_demo_namespace(&req.category) && elevenlabs {
            ELEVENLABS_TTS_BACKEND.hash(&mut hasher);
        }
        UNIFIED_AUDIO_FORMAT.hash(&mut hasher);
        let hash = hasher.finish();

        let lang_suffix = safe_language_suffix(req.lang.as_deref())?;

        let ext = if is_landing_demo_namespace(&req.category) && elevenlabs {
            "mp3"
        } else {
            "ogg"
        };
        let course_direction = normalize_course_direction(req.course_direction.as_deref());

        let rel = if is_landing_demo_namespace(&req.category) {
            format!(
                "{}/{}/{}_{}_{}{}_{:x}.{ext}",
                category, deck_prefix, deck_prefix, verb_norm, base_slug, lang_suffix, hash
            )
        } else {
            format!(
                "{}/{}/{}/{}_{}_{}{}_{:x}.{ext}",
                course_direction,
                category,
                deck_prefix,
                deck_prefix,
                verb_norm,
                base_slug,
                lang_suffix,
                hash
            )
        };
        Ok(match user_segment {
            Some(seg) => format!("users/{}/{}", seg, rel),
            None => rel,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::AudioUseCases;

    #[test]
    fn regular_audio_prefixes_prefer_direction_then_legacy_layouts() {
        let prefixes = AudioUseCases::legacy_audio_prefixes(
            "card_audio",
            "preposition",
            Some("es_en"),
            "1-basic",
            "on",
            "el_libro_esta_sobre_la_mesa",
            "_es",
        );
        assert_eq!(
            prefixes,
            vec![
                "card_audio/es_en/preposition/1-basic/1-basic_on_el_libro_esta_sobre_la_mesa_es"
                    .to_string(),
                "card_audio/preposition/1-basic/1-basic_on_el_libro_esta_sobre_la_mesa_es"
                    .to_string(),
                "card_audio/preposition/1-basic_on_el_libro_esta_sobre_la_mesa_es".to_string(),
            ]
        );
    }

    #[test]
    fn unknown_direction_normalizes_to_default() {
        let prefixes = AudioUseCases::legacy_audio_prefixes(
            "card_audio",
            "verbs",
            None,
            "1-basic",
            "do",
            "do",
            "",
        );
        assert!(prefixes[0].starts_with("card_audio/es_en/verbs/"));
        assert_eq!(prefixes.len(), 3);
    }

    #[test]
    fn landing_demo_prefixes_have_no_course_direction() {
        let prefixes = AudioUseCases::legacy_audio_prefixes(
            "card_audio",
            "landing-demo",
            Some("es_en"),
            "verbs-essentials",
            "be",
            "be",
            "_es",
        );
        assert_eq!(
            prefixes,
            vec![
                "card_audio/landing-demo/verbs-essentials/verbs-essentials_be_be_es".to_string(),
                "card_audio/landing-demo/verbs-essentials_be_be_es".to_string(),
            ]
        );
    }

    #[test]
    fn exact_legacy_audio_removes_only_the_course_direction() {
        assert_eq!(
            AudioUseCases::legacy_deterministic_audio_filename(
                "es_en/verbs/1-basic/1-basic_be_be_hash.ogg"
            ),
            Some("verbs/1-basic/1-basic_be_be_hash.ogg".to_string())
        );
        assert_eq!(
            AudioUseCases::legacy_deterministic_audio_filename(
                "landing-demo/verbs-essentials/file.mp3"
            ),
            None
        );
    }
}
