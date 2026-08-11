use anyhow::Result;
use fluency_core::ports::image::ImageGenerator;
use fluency_core::ports::image_compressor::ImageCompressor;
use fluency_core::ports::storage::StorageRepository;
use fluency_core::ports::tutor::AITutor;
use std::sync::Arc;
use std::time::Instant;

use crate::{
    is_landing_demo_namespace, normalize_course_direction, safe_deck_media_path, safe_form_suffix,
    safe_storage_segment, FlashcardsConfig,
};

/// Convierte un email en un segmento de path seguro para URL/filesystem.
/// Ejemplo: "user@example.com" → "user_example_com"
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

fn is_personal_image_role(role: &str) -> bool {
    // Reservado para el plan futuro. El rol todavía no forma parte del sistema
    // de suscripciones, por lo que hoy todas las imágenes de estudio son globales.
    role == "platinum"
}

fn global_image_base(
    _course_direction: Option<&str>,
    category: &str,
    deck_media_dir: &str,
    deck_file_prefix: &str,
    index: usize,
    def_index: usize,
    form_suffix: &str,
) -> String {
    let card_path = format!(
        "{}/{}/{}_card_{}_def{}{}",
        category, deck_media_dir, deck_file_prefix, index, def_index, form_suffix
    );
    card_path
}

fn personal_image_base(
    user_email: &str,
    course_direction: Option<&str>,
    category: &str,
    deck_media_dir: &str,
    deck_file_prefix: &str,
    index: usize,
    def_index: usize,
    form_suffix: &str,
) -> String {
    format!(
        "users/{}/{}/{}",
        user_path_segment(user_email),
        normalize_course_direction(course_direction),
        global_image_base(
            None,
            category,
            deck_media_dir,
            deck_file_prefix,
            index,
            def_index,
            form_suffix,
        )
    )
}

#[allow(dead_code)]
fn preview_for_log(text: &str, max_chars: usize) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = String::new();
    for ch in compact.chars().take(max_chars) {
        preview.push(ch);
    }
    if compact.chars().count() > max_chars {
        preview.push_str("...");
    }
    preview
}

fn build_prompt_meaning_context(req: &ImageGenRequest) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(value) = req
        .meaning
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        parts.push(format!("MEANING: \"{value}\""));
    }
    if let Some(value) = req
        .usage_context
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        parts.push(format!("CONTEXT_TYPE: \"{value}\""));
    }
    if let Some(value) = req
        .alternative_example
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        parts.push(format!("SUPPORTING_EXAMPLE: \"{value}\""));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n"))
    }
}

fn extract_final_visual_description(response: &str) -> String {
    response
        .rsplit_once("FINAL:")
        .map(|(_, final_text)| final_text)
        .unwrap_or(response)
        .trim()
        .to_string()
}

/// Calidad AVIF del recorte del landing demo — igual al target de la app interna (80); vive
/// aquí porque es config de compresión de imagen, no algo específico de un proveedor de IA.
const DEMO_CARD_IMAGE_AVIF_QUALITY: u8 = 80;

/// Descripción visual de respaldo cuando `AITutor::improve_prompt_for_landing_demo_image`
/// falla — texto genérico independiente del proveedor de IA (no confundir con el prompt final
/// que arma cada `ImageGenerator::finalize_prompt`).
fn fallback_demo_visual_description(usage_example: &str, scene_complement: Option<&str>) -> String {
    let mut desc = format!(
        "Candid photograph illustrating the English sentence: \"{}\".",
        usage_example
    );
    if let Some(c) = scene_complement.map(str::trim).filter(|s| !s.is_empty()) {
        desc.push_str(&format!(" The scene must also clearly show: {}.", c));
    }
    desc
}

// ---------------------------------------------------------------------------
// Application-layer DTOs (no serde, no HTTP concerns)
// ---------------------------------------------------------------------------

pub struct ImageGenRequest {
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub def_index: usize,
    pub course_direction: Option<String>,
    pub prompt: String,
    pub meaning: Option<String>,
    pub usage_example: Option<String>,
    pub usage_context: Option<String>,
    pub alternative_example: Option<String>,
    pub force_generation: bool,
    pub form: Option<String>,
    pub legacy_image_path: Option<String>,
    pub prompt_engine: Option<String>,
    /// Demo landing: texto extra del usuario (complemento visual, no reemplaza el ejemplo).
    pub scene_complement: Option<String>,
}

pub struct UploadImageRequest {
    pub category: String,
    pub deck: String,
    pub card_index: usize,
    pub def_index: usize,
    pub course_direction: Option<String>,
    pub form: Option<String>,
    pub file_data: Vec<u8>,
    pub file_name: String,
    pub content_type: String,
}

// ---------------------------------------------------------------------------
// ImageUseCases
// ---------------------------------------------------------------------------

pub struct ImageUseCases {
    storage_repo: Arc<dyn StorageRepository>,
    image_gen: Arc<dyn ImageGenerator>,
    landing_demo_image_gen: Arc<dyn ImageGenerator>,
    gemini_flash_lite_image_gen: Option<Arc<dyn ImageGenerator>>,
    image_compressor: Arc<dyn ImageCompressor>,
    ai_tutor: Arc<dyn AITutor>,
    config: Arc<FlashcardsConfig>,
}

impl ImageUseCases {
    pub fn new(
        storage_repo: Arc<dyn StorageRepository>,
        image_gen: Arc<dyn ImageGenerator>,
        landing_demo_image_gen: Arc<dyn ImageGenerator>,
        gemini_flash_lite_image_gen: Option<Arc<dyn ImageGenerator>>,
        image_compressor: Arc<dyn ImageCompressor>,
        ai_tutor: Arc<dyn AITutor>,
        config: Arc<FlashcardsConfig>,
    ) -> Self {
        Self {
            storage_repo,
            image_gen,
            landing_demo_image_gen,
            gemini_flash_lite_image_gen,
            image_compressor,
            ai_tutor,
            config,
        }
    }

    async fn versioned_image_url(&self, file_name: &str, blob_path: &str) -> String {
        match self.storage_repo.blob_version(blob_path).await {
            Ok(Some(version)) if !version.is_empty() => {
                format!("/card_images/{}?v={}", file_name, version)
            }
            _ => format!("/card_images/{}", file_name),
        }
    }

    /// Comprueba existencia y obtiene la versión con una sola consulta de
    /// metadatos en el camino normal. En desarrollo contra Oracle, hacer
    /// `blob_exists` seguido de `blob_version` duplicaba el HEAD remoto y
    /// retrasaba el cambio de tarjeta. Si el origen no expone metadatos de
    /// versión, conserva el fallback seguro a existencia + URL no-cache.
    async fn existing_versioned_image_url(
        &self,
        file_name: &str,
        blob_path: &str,
    ) -> Result<Option<String>> {
        match self.storage_repo.blob_version(blob_path).await? {
            Some(version) if !version.is_empty() => {
                Ok(Some(format!("/card_images/{}?v={}", file_name, version)))
            }
            _ if self.storage_repo.blob_exists(blob_path).await? => {
                Ok(Some(format!("/card_images/{}", file_name)))
            }
            _ => Ok(None),
        }
    }

    fn legacy_public_path_to_blob_path(&self, legacy_path: &str) -> Option<String> {
        let prefix = self.config.gcs_images_prefix.trim_matches('/');
        let clean = legacy_path.split('?').next()?.trim();
        if clean.is_empty() {
            return None;
        }

        let with_prefix = format!("/{}/", prefix);
        let path = if let Some(pos) = clean.find(&with_prefix) {
            &clean[pos + 1..]
        } else {
            clean.trim_start_matches('/')
        };

        if !path.starts_with(&format!("{}/", prefix)) {
            return None;
        }
        if path.split('/').any(|segment| segment == "..") || path.contains('\\') {
            return None;
        }

        let ext = path.rsplit('.').next()?.to_ascii_lowercase();
        match ext.as_str() {
            "avif" | "jpg" | "jpeg" | "png" | "webp" => Some(path.to_string()),
            _ => None,
        }
    }

    fn legacy_blob_candidates(&self, source_blob_path: &str) -> Vec<String> {
        let Some((base, ext)) = source_blob_path.rsplit_once('.') else {
            return vec![source_blob_path.to_string()];
        };
        let mut candidates = vec![format!("{base}.avif"), source_blob_path.to_string()];
        for candidate_ext in ["jpg", "jpeg", "png", "webp"] {
            if !ext.eq_ignore_ascii_case(candidate_ext) {
                candidates.push(format!("{base}.{candidate_ext}"));
            }
        }
        candidates.dedup();
        candidates
    }

    fn bytes_are_avif(bytes: &[u8]) -> bool {
        bytes
            .windows(8)
            .take(32)
            .any(|window| window == b"ftypavif")
            || bytes
                .windows(8)
                .take(32)
                .any(|window| window == b"ftypavis")
    }

    async fn migrate_legacy_image_to_target(
        &self,
        legacy_path: Option<&str>,
        target_blob_path: &str,
        trace_short: &str,
        avif_quality: u8,
    ) -> Result<bool> {
        let Some(legacy_path) = legacy_path else {
            return Ok(false);
        };
        let Some(source_blob_path) = self.legacy_public_path_to_blob_path(legacy_path) else {
            tracing::warn!(
                trace_id = %trace_short,
                legacy_path = %legacy_path,
                "img-gen:legacy-migration-invalid-path"
            );
            return Ok(false);
        };
        if source_blob_path == target_blob_path {
            return Ok(false);
        }

        let mut loaded_source: Option<(String, Vec<u8>)> = None;
        let mut last_error: Option<String> = None;
        for candidate in self.legacy_blob_candidates(&source_blob_path) {
            match self.storage_repo.download_blob(&candidate).await {
                Ok(bytes) => {
                    loaded_source = Some((candidate, bytes));
                    break;
                }
                Err(e) => {
                    last_error = Some(e.to_string());
                }
            }
        }

        let Some((source_blob_path, source_bytes)) = loaded_source else {
            tracing::warn!(
                trace_id = %trace_short,
                legacy_blob_path = %source_blob_path,
                error = ?last_error,
                "img-gen:legacy-migration-source-missing"
            );
            return Ok(false);
        };

        // Un AVIF legacy ya tiene el formato canónico. Copiarlo directamente evita
        // exigir un decoder AVIF solo para reubicar el archivo; el compresor sigue
        // normalizando los formatos fuente que sí necesitan conversión.
        let target_bytes = if Self::bytes_are_avif(&source_bytes) {
            source_bytes
        } else {
            self.image_compressor
                .compress_to_avif(&source_bytes, avif_quality)
                .map_err(|e| {
                    tracing::error!(
                        trace_id = %trace_short,
                        legacy_blob_path = %source_blob_path,
                        error = %e,
                        "img-gen:legacy-migration-compression-failed"
                    );
                    anyhow::anyhow!("[trace={trace_short}] legacy image compression: {e}")
                })?
        };

        self.storage_repo
            .upload_blob(target_blob_path, target_bytes, "image/avif")
            .await
            .map_err(|e| {
                tracing::error!(
                    trace_id = %trace_short,
                    legacy_blob_path = %source_blob_path,
                    target_blob_path = %target_blob_path,
                    error = %e,
                    "img-gen:legacy-migration-upload-failed"
                );
                anyhow::anyhow!("[trace={trace_short}] legacy image upload: {e}")
            })?;

        tracing::info!(
            trace_id = %trace_short,
            legacy_blob_path = %source_blob_path,
            target_blob_path = %target_blob_path,
            "img-gen:legacy-migration-done"
        );
        Ok(true)
    }

    /// Devuelve (url, is_nueva), generando si no existe.
    /// - Admin/batch → capa global por dirección.
    /// - La capa personal queda reservada para el futuro rol Platinum.
    pub async fn get_or_generate_image(
        &self,
        req: &ImageGenRequest,
        user_email: &str,
        role: &str,
    ) -> Result<(String, bool)> {
        tracing::info!(
            "🖼️ Solicitud de imagen: email='{}', rol='{}', deck='{}', index='{}', prompt='{}'",
            user_email,
            role,
            req.deck,
            req.index,
            req.prompt
        );

        let role = normalize_role(role);
        let is_admin = role == "admin";
        let has_personal_images = is_personal_image_role(&role);
        let is_demo = is_landing_demo_namespace(&req.category);

        // Premium/admin en app; invitados solo en namespace landing-demo.
        if !is_admin && !has_personal_images && !is_demo {
            tracing::warn!("🚫 Intento de generación de imagen por IA bloqueado: el usuario '{}' con rol '{}' no está autorizado.", user_email, role);
            return Err(anyhow::anyhow!(
                "No autorizado para generar imágenes por IA (requiere plan Premium)"
            ));
        }

        let category = safe_storage_segment(&req.category, "category")?;
        let (deck_media_dir, deck_file_prefix) = safe_deck_media_path(&req.deck)?;
        let form_suffix = safe_form_suffix(req.form.as_deref())?;
        let user_segment = if has_personal_images {
            Some(user_path_segment(user_email))
        } else {
            None
        };

        let base_pattern = match &user_segment {
            Some(_) => personal_image_base(
                user_email,
                req.course_direction.as_deref(),
                &category,
                &deck_media_dir,
                &deck_file_prefix,
                req.index,
                req.def_index,
                &form_suffix,
            ),
            None => global_image_base(
                req.course_direction.as_deref(),
                &category,
                &deck_media_dir,
                &deck_file_prefix,
                req.index,
                req.def_index,
                &form_suffix,
            ),
        };

        if !req.force_generation {
            let avif_path = format!("{}/{}.avif", self.config.gcs_images_prefix, base_pattern);
            if let Ok(true) = self.storage_repo.blob_exists(&avif_path).await {
                return Ok((
                    self.versioned_image_url(&format!("{}.avif", base_pattern), &avif_path)
                        .await,
                    false,
                ));
            }

            // Para usuarios normales: fallback a capa global antes de generar
            if !is_admin {
                let global_base = global_image_base(
                    req.course_direction.as_deref(),
                    &category,
                    &deck_media_dir,
                    &deck_file_prefix,
                    req.index,
                    req.def_index,
                    &form_suffix,
                );
                let global_avif = format!("{}/{}.avif", self.config.gcs_images_prefix, global_base);
                if let Ok(true) = self.storage_repo.blob_exists(&global_avif).await {
                    return Ok((
                        self.versioned_image_url(&format!("{}.avif", global_base), &global_avif)
                            .await,
                        false,
                    ));
                }
            }
        }

        let file_name = format!("{}.avif", base_pattern);
        let blob_path = format!("{}/{}", self.config.gcs_images_prefix, file_name);
        let trace_id = uuid::Uuid::new_v4().to_string();
        let trace_short = &trace_id[..8];
        let request_started_at = Instant::now();
        let avif_quality = if is_demo {
            DEMO_CARD_IMAGE_AVIF_QUALITY
        } else {
            80
        };

        /*
        tracing::info!(
            trace_id = %trace_short,
            category = %req.category,
            deck = %req.deck,
            card_index = req.index,
            def_index = req.def_index,
            force_generation = req.force_generation,
            gemini_input_phrase = %req.prompt,
            gemini_input_meaning = ?req.meaning,
            gemini_input_example = ?req.usage_example,
            gemini_input_usage_context = ?req.usage_context,
            gemini_input_alternative_example = ?req.alternative_example,
            blob_path = %blob_path,
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "img-gen:start"
        );
        */

        if !req.force_generation
            && self
                .migrate_legacy_image_to_target(
                    req.legacy_image_path.as_deref(),
                    &blob_path,
                    trace_short,
                    avif_quality,
                )
                .await?
        {
            return Ok((self.versioned_image_url(&file_name, &blob_path).await, true));
        }

        if !self.config.image_ai_enabled {
            return Err(anyhow::anyhow!(
                "La generación de imagen por IA está deshabilitada."
            ));
        }

        let _prompt_context_started_at = Instant::now();
        let prompt_meaning_context = build_prompt_meaning_context(req);
        /*
        tracing::info!(
            trace_id = %trace_short,
            prompt_meaning_context = ?prompt_meaning_context,
            prompt_usage_example = ?req.usage_example,
            prompt_scene_complement = ?req.scene_complement,
            prompt_context_elapsed_ms = _prompt_context_started_at.elapsed().as_millis() as u64,
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "img-gen:prompt-context"
        );
        */

        let prompt_llm_started_at = Instant::now();
        /*
        tracing::info!(
            trace_id = %trace_short,
            prompt_engine = if is_demo { "ollama-demo" } else { "ollama" },
            prompt_phrase_len = req.prompt.len(),
            prompt_meaning_len = prompt_meaning_context.as_ref().map(|s| s.len()).unwrap_or(0),
            prompt_example_len = req.usage_example.as_ref().map(|s| s.len()).unwrap_or(0),
            prompt_alt_example_len = req.alternative_example.as_ref().map(|s| s.len()).unwrap_or(0),
            prompt_preview = %preview_for_log(&req.prompt, 120),
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "img-gen:prompt-llm-start"
        );
        */

        let is_premium = role == "premium" || is_admin;
        let use_direct_gemini_prod = self.config.is_production && is_premium && !is_demo;

        let (visual_description, image_generator): (String, &Arc<dyn ImageGenerator>) = if use_direct_gemini_prod {
            tracing::info!(
                "⚡ Producción (Premium/Admin): uso directo de gemini-3.1-flash-lite-image para '{}'",
                req.prompt
            );
            let gen = self
                .gemini_flash_lite_image_gen
                .as_ref()
                .unwrap_or(&self.landing_demo_image_gen);
            (req.prompt.clone(), gen)
        } else {
            let mut pos_with_engine = category.clone();
            if let Some(engine) = &req.prompt_engine {
                pos_with_engine = format!("{}|ENGINE={}", category, engine);
            }

            let visual_description = match if is_demo {
                self.ai_tutor.improve_prompt_for_landing_demo_image(
                    &req.prompt,
                    &category,
                    prompt_meaning_context.as_deref().or(req.meaning.as_deref()),
                    req.usage_example.as_deref(),
                    req.scene_complement.as_deref(),
                )
            } else {
                self.ai_tutor.improve_prompt_for_image(
                    &req.prompt,
                    &pos_with_engine,
                    prompt_meaning_context.as_deref().or(req.meaning.as_deref()),
                    req.usage_example.as_deref(),
                )
            }
            .await
            {
                Ok(desc) => extract_final_visual_description(&desc),
                Err(e) => {
                    tracing::error!(
                        trace_id = %trace_short,
                        error = %e,
                        landing_demo = is_demo,
                        prompt_llm_elapsed_ms = prompt_llm_started_at.elapsed().as_millis() as u64,
                        elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                        "img-gen:prompt-llm-failed"
                    );
                    if is_demo {
                        let example = req.usage_example.as_deref().unwrap_or(&req.prompt);
                        fallback_demo_visual_description(example, req.scene_complement.as_deref())
                    } else {
                        return Err(anyhow::anyhow!(
                            "Error en el pipeline de prompts: El generador local (Ollama/Qwen) falló o no está iniciado. Detalle: {}",
                            e
                        ));
                    }
                }
            };

            let gen = if is_demo {
                &self.landing_demo_image_gen
            } else {
                &self.image_gen
            };
            (visual_description, gen)
        };

        let final_prompt =
            image_generator.finalize_prompt(&visual_description, req.scene_complement.as_deref());

        // Log image generation prompts locally to image_generation.log
        if let Ok(log_line) = serde_json::to_string(&serde_json::json!({
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "trace_id": trace_short,
            "word": req.prompt,
            "meaning": req.meaning,
            "example": req.usage_example,
            "category": req.category,
            "deck": req.deck,
            "card_index": req.index,
            "definition_index": req.def_index,
            "visual_description": visual_description,
            "final_prompt": final_prompt,
        })) {
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open("../image_generation.log")
            {
                use std::io::Write;
                let _ = writeln!(file, "{}", log_line);
            }
        }

        /*
        tracing::info!(
            trace_id = %trace_short,
            visual_description_len = visual_description.len(),
            final_prompt_len = final_prompt.len(),
            landing_demo = is_demo,
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "img-gen:final-prompt"
        );
        */

        /*
        tracing::info!(
            trace_id = %trace_short,
            landing_demo = is_demo,
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "img-gen:model-request"
        );
        */

        let raw_bytes = image_generator.generate(&final_prompt).await.map_err(|e| {
            tracing::error!(
                trace_id = %trace_short,
                error = %e,
                elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                "img-gen:model-failed"
            );
            anyhow::anyhow!("[trace={trace_short}] image model: {e}")
        })?;

        /*
        tracing::info!(
            trace_id = %trace_short,
            raw_bytes = raw_bytes.len(),
            landing_demo = is_demo,
            image_stage_elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "img-gen:model-ok"
        );
        */

        // Compresión a AVIF 768x512 (formato canónico de tarjetas).
        let compressed_bytes = self
            .image_compressor
            .compress_to_avif(&raw_bytes, avif_quality)
            .map_err(|e| {
                tracing::error!(
                    trace_id = %trace_short,
                    error = %e,
                    elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                    "img-gen:compression-failed"
                );
                anyhow::anyhow!("[trace={trace_short}] compression: {e}")
            })?;

        /*
        tracing::info!(
            trace_id = %trace_short,
            compressed_bytes = compressed_bytes.len(),
            avif_quality = avif_quality,
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "img-gen:compression-ok"
        );
        */

        let upload_started_at = Instant::now();
        /*
        tracing::info!(
            trace_id = %trace_short,
            blob_path = %blob_path,
            upload_bytes = compressed_bytes.len(),
            upload_started_ms = request_started_at.elapsed().as_millis() as u64,
            "img-gen:upload-start"
        );
        */

        self.storage_repo
            .upload_blob(&blob_path, compressed_bytes, "image/avif")
            .await
            .map_err(|e| {
                tracing::error!(
                    trace_id = %trace_short,
                    error = %e,
                    blob_path = %blob_path,
                    upload_elapsed_ms = upload_started_at.elapsed().as_millis() as u64,
                    elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                    "img-gen:upload-failed"
                );
                anyhow::anyhow!("[trace={trace_short}] upload: {e}")
            })?;

        /*
        tracing::info!(
            trace_id = %trace_short,
            blob_path = %blob_path,
            upload_elapsed_ms = upload_started_at.elapsed().as_millis() as u64,
            total_elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "img-gen:upload-ok"
        );
        */

        Ok((self.versioned_image_url(&file_name, &blob_path).await, true))
    }

    /// Borra imágenes. Admin borra capa global; usuario normal borra solo su capa personal.
    pub async fn delete_image(
        &self,
        category: &str,
        deck: &str,
        index: usize,
        def_index: usize,
        course_direction: Option<&str>,
        form: Option<&str>,
        user_email: &str,
        is_admin: bool,
    ) -> Result<bool> {
        let category = safe_storage_segment(category, "category")?;
        let (deck_media_dir, deck_file_prefix) = safe_deck_media_path(deck)?;
        let form_suffix = safe_form_suffix(form)?;

        let base_pattern = if is_admin {
            global_image_base(
                course_direction,
                &category,
                &deck_media_dir,
                &deck_file_prefix,
                index,
                def_index,
                &form_suffix,
            )
        } else {
            personal_image_base(
                user_email,
                course_direction,
                &category,
                &deck_media_dir,
                &deck_file_prefix,
                index,
                def_index,
                &form_suffix,
            )
        };

        let mut base_patterns = vec![base_pattern];
        if !is_landing_demo_namespace(&category) {
            let legacy_base = if is_admin {
                format!(
                    "{}/{}/{}/{}_card_{}_def{}{}",
                    normalize_course_direction(course_direction),
                    category,
                    deck_media_dir,
                    deck_file_prefix,
                    index,
                    def_index,
                    form_suffix
                )
            } else {
                format!(
                    "users/{}/{}/{}/{}_card_{}_def{}{}",
                    user_path_segment(user_email),
                    category,
                    deck_media_dir,
                    deck_file_prefix,
                    index,
                    def_index,
                    form_suffix
                )
            };
            base_patterns.push(legacy_base);
        }

        let mut deleted_any = false;
        for candidate_base in base_patterns {
            for ext in [".avif", ".jpg", ".png", ".jpeg", ".webp"] {
                let blob_path = format!(
                    "{}/{}{}",
                    self.config.gcs_images_prefix, candidate_base, ext
                );
                if let Ok(true) = self.storage_repo.blob_exists(&blob_path).await {
                    if self.storage_repo.delete_blob(&blob_path).await.is_ok() {
                        tracing::info!("✅ Deleted: {}", blob_path);
                        deleted_any = true;
                    }
                }
            }
        }

        Ok(deleted_any)
    }

    /// Resuelve la mejor ruta de imagen sin generar.
    /// - usuarios actuales → biblioteca global compartida
    /// - futuro Platinum → capa personal primero, fallback a global
    /// - admin → capa global
    pub async fn resolve_image_path(
        &self,
        category: &str,
        deck: &str,
        index: usize,
        def_index: usize,
        course_direction: Option<&str>,
        form: Option<&str>,
        user_email: &str,
        role: &str,
    ) -> Result<Option<String>> {
        let category = safe_storage_segment(category, "category")?;
        let (deck_media_dir, deck_file_prefix) = safe_deck_media_path(deck)?;
        let form_suffix = safe_form_suffix(form)?;
        let images_prefix = &self.config.gcs_images_prefix;

        let role = normalize_role(role);
        tracing::info!(
            "🔍 resolve_image: category={} deck={} index={} def={} form={:?} role={}",
            category,
            deck,
            index,
            def_index,
            form,
            role
        );

        // Premium (no admin): capa personal primero
        if is_personal_image_role(&role) {
            let personal_base = personal_image_base(
                user_email,
                course_direction,
                &category,
                &deck_media_dir,
                &deck_file_prefix,
                index,
                def_index,
                &form_suffix,
            );
            let personal_avif = format!("{}/{}.avif", images_prefix, personal_base);
            tracing::info!("  → check personal: {}", personal_avif);
            if let Some(url) = self
                .existing_versioned_image_url(&format!("{}.avif", personal_base), &personal_avif)
                .await?
            {
                tracing::info!("  ✔️ found personal: {}", personal_avif);
                return Ok(Some(url));
            }

            if !is_landing_demo_namespace(&category) {
                let legacy_personal_base = format!(
                    "users/{}/{}/{}/{}_card_{}_def{}{}",
                    user_path_segment(user_email),
                    category,
                    deck_media_dir,
                    deck_file_prefix,
                    index,
                    def_index,
                    form_suffix
                );
                let legacy_personal_avif =
                    format!("{}/{}.avif", images_prefix, legacy_personal_base);
                if let Some(url) = self
                    .existing_versioned_image_url(
                        &format!("{}.avif", legacy_personal_base),
                        &legacy_personal_avif,
                    )
                    .await?
                {
                    return Ok(Some(url));
                }
            }
        }

        // Capa global predeterminada (todos los roles)
        let global_base = global_image_base(
            course_direction,
            &category,
            &deck_media_dir,
            &deck_file_prefix,
            index,
            def_index,
            &form_suffix,
        );
        let global_avif = format!("{}/{}.avif", images_prefix, global_base);
        tracing::info!("  → check global: {}", global_avif);
        if let Some(url) = self
            .existing_versioned_image_url(&format!("{}.avif", global_base), &global_avif)
            .await?
        {
            tracing::info!("  ✔️ found global: {}", global_avif);
            return Ok(Some(url));
        }

        // Compatibilidad de lectura con la etapa en que las imágenes globales
        // se escribían bajo es_en/… o en_es/…. La biblioteca canónica ya no
        // depende del idioma; la dirección solo aplica a futuras capas personales.
        if !is_landing_demo_namespace(&category) {
            let legacy_global_base = format!(
                "{}/{}/{}/{}_card_{}_def{}{}",
                normalize_course_direction(course_direction),
                category,
                deck_media_dir,
                deck_file_prefix,
                index,
                def_index,
                form_suffix
            );
            let legacy_global_avif = format!("{}/{}.avif", images_prefix, legacy_global_base);
            if let Some(url) = self
                .existing_versioned_image_url(
                    &format!("{}.avif", legacy_global_base),
                    &legacy_global_avif,
                )
                .await?
            {
                return Ok(Some(url));
            }
        }

        tracing::info!(
            "  ❌ no image found for {}/{}_card_{}_def{}{}",
            category,
            deck_file_prefix,
            index,
            def_index,
            form_suffix
        );
        Ok(None)
    }

    /// Downloads raw bytes for any blob (used by asset-serving handlers).
    pub async fn download_blob(&self, blob_path: &str) -> Result<Vec<u8>> {
        self.storage_repo.download_blob(blob_path).await
    }

    /// Sube una imagen manualmente. Hoy solo admin; la capa personal queda
    /// preparada para el futuro plan Platinum.
    pub async fn upload_image(
        &self,
        req: UploadImageRequest,
        user_email: &str,
        is_admin: bool,
    ) -> Result<String> {
        let category = safe_storage_segment(&req.category, "category")?;
        let (deck_media_dir, deck_file_prefix) = safe_deck_media_path(&req.deck)?;
        let form_suffix = safe_form_suffix(req.form.as_deref())?;

        // No confiar en la extensión del nombre de archivo ni en el content-type
        // que manda el cliente: se verifica el contenido real y, si no es AVIF
        // válido, se recodifica. Así solo puede terminar en el repositorio un
        // AVIF real, sin importar cómo llegó (jpg/png/webp/renombrado).
        let target_bytes = if Self::bytes_are_avif(&req.file_data) {
            req.file_data
        } else {
            self.image_compressor
                .compress_to_avif(&req.file_data, 80)
                .map_err(|e| anyhow::anyhow!("La imagen subida no se pudo convertir a AVIF: {e}"))?
        };

        let base_name = if is_admin {
            global_image_base(
                req.course_direction.as_deref(),
                &category,
                &deck_media_dir,
                &deck_file_prefix,
                req.card_index,
                req.def_index,
                &form_suffix,
            )
        } else {
            personal_image_base(
                user_email,
                req.course_direction.as_deref(),
                &category,
                &deck_media_dir,
                &deck_file_prefix,
                req.card_index,
                req.def_index,
                &form_suffix,
            )
        };
        let final_name = format!("{base_name}.avif");
        let blob_path = format!("{}/{}", self.config.gcs_images_prefix, final_name);

        tracing::info!("📤 Uploading manual image to: {}", blob_path);
        self.storage_repo
            .upload_blob(&blob_path, target_bytes, "image/avif")
            .await?;

        Ok(self.versioned_image_url(&final_name, &blob_path).await)
    }

    #[allow(dead_code)]
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
}

#[cfg(test)]
mod tests {
    use super::{global_image_base, personal_image_base};

    #[test]
    fn global_images_are_shared_across_course_directions() {
        assert_eq!(
            global_image_base(
                Some("es_en"),
                "verbs",
                "1-basic/action",
                "1-basic_action",
                4,
                1,
                "",
            ),
            "verbs/1-basic/action/1-basic_action_card_4_def1"
        );
    }

    #[test]
    fn personal_images_are_scoped_by_user_and_course_direction() {
        assert_eq!(
            personal_image_base(
                "Student@example.com",
                Some("es_en"),
                "verbs",
                "1-basic/action",
                "1-basic_action",
                4,
                1,
                "_v2",
            ),
            "users/student_example_com/es_en/verbs/1-basic/action/1-basic_action_card_4_def1_v2"
        );
    }

    #[test]
    fn landing_demo_keeps_its_dedicated_legacy_namespace() {
        assert_eq!(
            global_image_base(
                Some("es_en"),
                "landing-demo",
                "verbs-essentials",
                "verbs-essentials",
                0,
                0,
                "",
            ),
            "landing-demo/verbs-essentials/verbs-essentials_card_0_def0"
        );
    }
}
