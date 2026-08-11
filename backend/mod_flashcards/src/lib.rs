use anyhow::Result;
use fluency_core::domain::models::flashcard::DeckData;
use fluency_core::domain::models::srs::{CardProgressUpdate, SrsReviewCandidate, SrsSchedule};
use fluency_core::domain::models::user_activity::{
    DeckProgressInfo, LearningLevelStats, LearningStats, B2_VOCABULARY_TARGET,
};
use fluency_core::ports::db_repository::{CardProgressRepository, UserActivityRepository};
use fluency_core::ports::storage::StorageRepository;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::OnceCell;

pub mod audio_use_cases;
pub mod batch;
pub mod image_use_cases;

/// Categoría de storage para el demo del landing (aislada del sistema interno).
pub const LANDING_DEMO_CATEGORY: &str = "landing-demo";
pub const DEFAULT_COURSE_DIRECTION: &str = "es_en";
const MAX_STORAGE_SEGMENT_LEN: usize = 96;

pub fn is_landing_demo_namespace(category: &str) -> bool {
    category == LANDING_DEMO_CATEGORY
}

/// Ubica el array `definitions` dentro de `extra` (JSON crudo de un `Flashcard`) según la forma
/// verbal activa: v1/`None` → raíz, v2 → `irregular.past`, v3 → `irregular.participle`. Mismo
/// mapeo que `DISPLAY_DATA_MAP` en `client/src/components/flashcardStudy/features/CardFront.jsx`.
fn locate_definitions_mut<'a>(
    extra: &'a mut serde_json::Value,
    form: Option<&str>,
) -> Option<&'a mut Vec<serde_json::Value>> {
    let target = match form {
        Some("v2") => extra.get_mut("irregular")?.get_mut("past")?,
        Some("v3") => extra.get_mut("irregular")?.get_mut("participle")?,
        _ => extra,
    };
    target.get_mut("definitions")?.as_array_mut()
}

pub fn safe_storage_segment(value: &str, field: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_STORAGE_SEGMENT_LEN {
        anyhow::bail!("{field} inválido");
    }

    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return Ok(trimmed.to_ascii_lowercase());
    }

    anyhow::bail!("{field} contiene caracteres no permitidos")
}

pub fn safe_deck_prefix(deck: &str) -> Result<String> {
    let trimmed = deck.trim();
    let without_ext = trimmed.strip_suffix(".json").unwrap_or(trimmed);
    let media_prefix = without_ext.split('/').next().unwrap_or(without_ext);
    safe_storage_segment(media_prefix, "deck")
}

pub fn safe_deck_media_path(deck: &str) -> Result<(String, String)> {
    let trimmed = deck.trim();
    let without_ext = trimmed.strip_suffix(".json").unwrap_or(trimmed);
    let segments: Vec<String> = without_ext
        .split('/')
        .map(|segment| safe_storage_segment(segment, "deck"))
        .collect::<Result<Vec<_>>>()?;

    if segments.is_empty() {
        anyhow::bail!("deck inválido");
    }

    Ok((segments.join("/"), segments.join("_")))
}

pub fn safe_form_suffix(form: Option<&str>) -> Result<String> {
    match form.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("v1") => Ok(String::new()),
        Some("v2") => Ok("_v2".to_string()),
        Some("v3") => Ok("_v3".to_string()),
        Some(_) => anyhow::bail!("form inválido"),
    }
}

pub fn safe_language_suffix(lang: Option<&str>) -> Result<String> {
    match lang.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("en") => Ok(String::new()),
        Some(value) => {
            let normalized = value.to_ascii_lowercase();
            if normalized.len() <= 16
                && normalized
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-')
            {
                Ok(format!("_{normalized}"))
            } else {
                anyhow::bail!("lang inválido")
            }
        }
    }
}

pub fn normalize_course_direction(value: Option<&str>) -> &'static str {
    match value.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
        Some("en_es") => "en_es",
        Some("es_de") => "es_de",
        Some("es_en") => "es_en",
        Some("es_fr") => "es_fr",
        Some("es_it") => "es_it",
        Some("es_pt") => "es_pt",
        Some("en_fr") => "en_fr",
        Some("fr_en") => "fr_en",
        Some("fr_es") => "fr_es",
        Some("it_es") => "it_es",
        Some("pt_en") => "pt_en",
        Some("pt_es") => "pt_es",
        _ => DEFAULT_COURSE_DIRECTION,
    }
}

/// Invariantes del estado SRS. El cliente calcula los valores; el backend
/// solo los valida antes de persistirlos (ver `core::domain::models::srs`).
pub fn validate_srs_schedule(schedule: &SrsSchedule) -> Result<(), String> {
    const MASTERED_BOX_LEVEL: i32 = 99;
    if !(0..=MASTERED_BOX_LEVEL).contains(&schedule.box_level)
        || !schedule.ease_factor.is_finite()
        || !(1.3..=5.0).contains(&schedule.ease_factor)
        || !schedule.interval_days.is_finite()
        || !(1.0..=36_500.0).contains(&schedule.interval_days)
    {
        return Err("Estado SRS inválido".to_string());
    }
    if schedule.box_level != MASTERED_BOX_LEVEL && schedule.next_review_at.is_none() {
        return Err("next_review_at es obligatorio salvo para una tarjeta dominada".to_string());
    }
    Ok(())
}

fn progress_category_key(course_direction: &str, category: &str) -> String {
    format!(
        "{}::{}",
        normalize_course_direction(Some(course_direction)),
        category
    )
}

fn progress_deck_key(course_direction: &str, deck_name: &str) -> String {
    format!(
        "{}::{}",
        normalize_course_direction(Some(course_direction)),
        deck_name.replace(".json", "")
    )
}

fn progress_deck_prefix_key(course_direction: &str, deck_prefix: &str) -> String {
    format!(
        "{}::{}",
        normalize_course_direction(Some(course_direction)),
        deck_prefix
    )
}

#[derive(Clone)]
pub struct FlashcardsConfig {
    pub gcs_audio_prefix: String,
    pub gcs_images_prefix: String,
    /// Habilita el pipeline de generación de imágenes por IA (independiente del proveedor
    /// concreto — hoy Gemini para prompts/demo, ComfyUI para la generación en sí).
    pub image_ai_enabled: bool,
    /// Indica si el servidor corre en entorno de producción
    pub is_production: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogManifest {
    schema_version: u32,
    catalog_version: String,
    directions: HashMap<String, CatalogDirection>,
}

#[derive(Debug, Deserialize)]
struct CatalogDirection {
    categories: Vec<CatalogCategory>,
}

#[derive(Debug, Deserialize)]
struct CatalogCategory {
    name: String,
    total: usize,
    decks: Vec<CatalogDeck>,
}

#[derive(Debug, Deserialize)]
struct CatalogDeck {
    path: String,
    total: usize,
}

pub struct DeckUseCases {
    storage_repo: Arc<dyn StorageRepository>,
    db_repo: Arc<dyn CardProgressRepository>,
    activity_repo: Arc<dyn UserActivityRepository>,
    catalog_manifest: OnceCell<Arc<CatalogManifest>>,
}

const LEARNING_LEVEL_DECKS: &[(&str, &str, bool)] = &[
    ("A1", "1-basic/", false),
    ("A2", "2-intermediate/", false),
    ("B1", "3-advanced/", false),
];

impl DeckUseCases {
    pub fn new(
        storage_repo: Arc<dyn StorageRepository>,
        db_repo: Arc<dyn CardProgressRepository>,
        activity_repo: Arc<dyn UserActivityRepository>,
    ) -> Self {
        Self {
            storage_repo,
            db_repo,
            activity_repo,
            catalog_manifest: OnceCell::new(),
        }
    }

    async fn catalog_manifest(&self) -> Result<&Arc<CatalogManifest>> {
        self.catalog_manifest
            .get_or_try_init(|| async {
                let bytes = self.storage_repo.get_catalog_manifest().await?;
                let manifest: CatalogManifest = serde_json::from_slice(&bytes)?;
                anyhow::ensure!(
                    manifest.schema_version == 1,
                    "schema de catálogo no soportado"
                );
                tracing::info!(
                    catalog_version = %manifest.catalog_version,
                    "catálogo global cargado desde manifiesto"
                );
                Ok(Arc::new(manifest))
            })
            .await
    }

    async fn catalog_direction(&self, course_direction: &str) -> Result<&CatalogDirection> {
        let normalized = normalize_course_direction(Some(course_direction));
        self.catalog_manifest()
            .await?
            .directions
            .get(normalized)
            .ok_or_else(|| anyhow::anyhow!("dirección no incluida en catálogo: {normalized}"))
    }

    pub async fn list_categories(&self, course_direction: &str) -> Result<Vec<String>> {
        Ok(self
            .catalog_direction(course_direction)
            .await?
            .categories
            .iter()
            .map(|category| category.name.clone())
            .collect())
    }

    pub async fn list_categories_with_counts(
        &self,
        course_direction: &str,
    ) -> Result<Vec<serde_json::Value>> {
        let normalized = normalize_course_direction(Some(course_direction));
        Ok(self
            .catalog_direction(normalized)
            .await?
            .categories
            .iter()
            .map(|category| {
                serde_json::json!({
                    "name": category.name,
                    "total": category.total,
                    "course_direction": normalized,
                })
            })
            .collect())
    }

    pub async fn list_decks(&self, category: &str, course_direction: &str) -> Result<Vec<String>> {
        let direction = self.catalog_direction(course_direction).await?;
        let category = direction
            .categories
            .iter()
            .find(|entry| entry.name == category)
            .ok_or_else(|| anyhow::anyhow!("categoría no encontrada"))?;
        Ok(category
            .decks
            .iter()
            .map(|deck| deck.path.clone())
            .collect())
    }

    /// Obtiene el estado comprimido (total y aprendidas) de todos los mazos de una categoría.
    /// 0 lecturas de disco (usa el manifiesto en RAM) y 1 sola consulta a SurrealDB.
    pub async fn get_deck_summaries(
        &self,
        user_id: &str,
        category_name: &str,
        course_direction: &str,
    ) -> Result<HashMap<String, serde_json::Value>> {
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let direction = self.catalog_direction(normalized_direction).await?;
        let category_entry = direction
            .categories
            .iter()
            .find(|c| c.name == category_name)
            .ok_or_else(|| anyhow::anyhow!("categoría no encontrada"))?;

        let progress_category = progress_category_key(normalized_direction, category_name);
        let learned_counts = self
            .db_repo
            .count_learned_cards_by_category(user_id, &progress_category)
            .await
            .unwrap_or_default();

        let mut summaries = HashMap::with_capacity(category_entry.decks.len());
        for deck in &category_entry.decks {
            let deck_path = &deck.path;
            let deck_key = progress_deck_key(normalized_direction, deck_path);
            let learned = learned_counts.get(&deck_key).copied().unwrap_or(0);
            // Clave sin ".json": el frontend guarda deckNames sin extensión
            // (sortDeckNames la quita), igual que el resto de endpoints del módulo.
            let response_key = deck_path.trim_end_matches(".json").to_string();
            summaries.insert(
                response_key,
                serde_json::json!({
                    "total": deck.total,
                    "learned": learned,
                }),
            );
        }

        Ok(summaries)
    }

    /// Carga únicamente el manifiesto pequeño; nunca abre los JSON de decks.
    pub async fn warm_catalog_manifest(&self) {
        if let Err(err) = self.catalog_manifest().await {
            tracing::error!("no se pudo cargar catalog-manifest.json: {err}");
        }
    }

    /// Carga el deck desde almacenamiento y sobreescribe `learned`
    /// con el progreso real guardado en la base de datos.
    pub async fn get_deck_data(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
        course_direction: &str,
    ) -> Result<DeckData> {
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let deck_key = progress_deck_key(normalized_direction, deck_name);
        let progress_category = progress_category_key(normalized_direction, category);
        let mut data = self
            .storage_repo
            .get_deck_data_for_direction(normalized_direction, category, deck_name)
            .await?;

        for card in data.flashcards_mut() {
            card.learned = false;
        }

        match self
            .db_repo
            .get_learned_cards(user_id, &progress_category, &deck_key)
            .await
        {
            Ok(learned_indices) => {
                if !learned_indices.is_empty() {
                    let cards = data.flashcards_mut();
                    for idx in learned_indices {
                        if let Some(card) = cards.get_mut(idx as usize) {
                            card.learned = true;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    "No se pudo obtener progreso de DB: {}. Usando solo almacenamiento.",
                    e
                );
            }
        }

        Ok(data)
    }

    /// Guarda el estado aprendido en la base de datos. No modifica el JSON fuente.
    pub async fn update_card_status(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
        index: usize,
        learned: bool,
        course_direction: &str,
    ) -> Result<()> {
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let deck_key = progress_deck_key(normalized_direction, deck_name);
        let progress_category = progress_category_key(normalized_direction, category);
        tracing::info!(
            "Guardando progreso: {}/{}/{} user={} index={} learned={}",
            normalized_direction,
            category,
            deck_key,
            user_id,
            index,
            learned
        );
        self.db_repo
            .upsert_card_progress(
                user_id,
                &progress_category,
                &deck_key,
                index as i32,
                learned,
            )
            .await?;
        if learned {
            self.activity_repo.record_study_day(user_id).await?;
        }
        Ok(())
    }

    /// Resetea el progreso del deck eliminando las filas de progreso.
    pub async fn reset_deck_status(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
        course_direction: &str,
    ) -> Result<()> {
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let deck_key = progress_deck_key(normalized_direction, deck_name);
        let progress_category = progress_category_key(normalized_direction, category);
        self.db_repo
            .reset_card_progress(user_id, &progress_category, &deck_key)
            .await
    }

    pub async fn reset_category_status(
        &self,
        user_id: &str,
        category: &str,
        course_direction: &str,
    ) -> Result<()> {
        let progress_category =
            progress_category_key(normalize_course_direction(Some(course_direction)), category);
        self.db_repo
            .reset_category_progress(user_id, &progress_category)
            .await
    }

    pub async fn get_phonics_data(&self) -> Result<serde_json::Value> {
        self.storage_repo.get_phonics_data().await
    }

    pub async fn get_deck_json(
        &self,
        category: &str,
        deck_name: &str,
        course_direction: &str,
    ) -> Result<DeckData> {
        self.storage_repo
            .get_deck_data_for_direction(
                normalize_course_direction(Some(course_direction)),
                category,
                deck_name,
            )
            .await
    }

    pub async fn save_deck_json(
        &self,
        category: &str,
        deck_name: &str,
        data: &DeckData,
        course_direction: &str,
    ) -> Result<()> {
        self.storage_repo
            .save_deck_data_for_direction(
                normalize_course_direction(Some(course_direction)),
                category,
                deck_name,
                data,
            )
            .await?;
        Ok(())
    }

    /// Elimina permanentemente `definitions[def_index]` del card en `index`, dentro del deck
    /// `category/deck_name` para `course_direction`. `form` selecciona v1 (raíz, default) / v2
    /// (`irregular.past`) / v3 (`irregular.participle`) — mismo mapeo que `DISPLAY_DATA_MAP` en
    /// `CardFront.jsx`. Devuelve `Ok(false)` si `index`/`def_index` están fuera de rango (no hay
    /// nada que borrar); no toca imagen/audio existentes de esa posición (quedan huérfanos).
    pub async fn delete_definition(
        &self,
        category: &str,
        deck_name: &str,
        index: usize,
        def_index: usize,
        form: Option<&str>,
        course_direction: &str,
    ) -> Result<bool> {
        let mut deck = self
            .get_deck_json(category, deck_name, course_direction)
            .await?;

        let Some(card) = deck.flashcards_mut().get_mut(index) else {
            return Ok(false);
        };
        let Some(defs) = locate_definitions_mut(&mut card.extra, form) else {
            return Ok(false);
        };
        if def_index >= defs.len() {
            return Ok(false);
        }
        defs.remove(def_index);

        self.save_deck_json(category, deck_name, &deck, course_direction)
            .await?;
        Ok(true)
    }

    pub async fn blob_exists(&self, blob_path: &str) -> Result<bool> {
        self.storage_repo.blob_exists(blob_path).await
    }

    pub async fn list_files_in_dir(&self, rel_dir: &str) -> Result<Vec<String>> {
        self.storage_repo.list_files_in_dir(rel_dir).await
    }

    /// Persiste un lote de actualizaciones de tarjetas en una sola operación.
    /// Equivalente a llamar `update_card_status` N veces pero con una sola petición HTTP.
    pub async fn update_cards_batch(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
        cards: &[CardProgressUpdate],
        course_direction: &str,
    ) -> Result<()> {
        if cards.is_empty() {
            return Ok(());
        }
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let deck_key = progress_deck_key(normalized_direction, deck_name);
        let progress_category = progress_category_key(normalized_direction, category);
        self.db_repo
            .upsert_cards_batch(user_id, &progress_category, &deck_key, cards)
            .await?;

        let any_learned = cards.iter().any(|card| card.learned);
        if any_learned {
            self.activity_repo.record_study_day(user_id).await?;
        }
        Ok(())
    }

    /// Obtiene candidatos vencidos y elimina el namespace interno antes de
    /// exponer las coordenadas al cliente. La urgencia se calcula en React.
    pub async fn get_srs_review_candidates(
        &self,
        user_id: &str,
        course_direction: &str,
        now: chrono::DateTime<chrono::Utc>,
        limit: usize,
    ) -> Result<Vec<SrsReviewCandidate>> {
        const MAX_CANDIDATES: usize = 5_000;
        let candidate_limit = limit.clamp(1, MAX_CANDIDATES);
        let direction = normalize_course_direction(Some(course_direction));
        let prefix = format!("{direction}::");
        let mut rows = self
            .db_repo
            .get_srs_review_candidates(user_id, &prefix, now, candidate_limit)
            .await?;

        for row in &mut rows {
            row.category = row
                .category
                .strip_prefix(&prefix)
                .unwrap_or(&row.category)
                .to_string();
            row.deck = row
                .deck
                .strip_prefix(&prefix)
                .unwrap_or(&row.deck)
                .to_string();
        }
        Ok(rows)
    }

    pub async fn touch_study_day(&self, user_id: &str) -> Result<()> {
        self.activity_repo.record_study_day(user_id).await
    }

    async fn count_cards_for_deck_prefix(
        &self,
        deck_prefix: &str,
        course_direction: &str,
    ) -> Result<i32> {
        Ok(self
            .catalog_direction(course_direction)
            .await?
            .categories
            .iter()
            .flat_map(|category| category.decks.iter())
            .filter(|deck| deck.path.starts_with(deck_prefix))
            .map(|deck| deck.total as i32)
            .sum())
    }

    pub async fn get_learning_stats(
        &self,
        user_id: &str,
        course_direction: &str,
    ) -> Result<LearningStats> {
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let mut free_levels = Vec::new();
        let mut cumulative_target = 0_i32;
        let mut cumulative_mastered = 0_i32;
        let mut mastered_count = 0_i32;

        for &(level, deck_prefix, premium) in LEARNING_LEVEL_DECKS {
            let namespaced_prefix = progress_deck_prefix_key(normalized_direction, deck_prefix);
            let target_count = self
                .count_cards_for_deck_prefix(deck_prefix, normalized_direction)
                .await?;
            let mastered_for_level = self
                .db_repo
                .count_learned_cards_by_deck_prefix(user_id, &namespaced_prefix)
                .await?
                .clamp(0, target_count.max(0));
            cumulative_target += target_count;
            cumulative_mastered += mastered_for_level;
            mastered_count += mastered_for_level;
            free_levels.push(LearningLevelStats {
                level: level.to_string(),
                mastered_count: mastered_for_level,
                target_count,
                cumulative_mastered,
                cumulative_target,
                completed: target_count <= 0 || mastered_for_level >= target_count,
                premium,
            });
        }

        let free_target = cumulative_target;
        let b2_target = B2_VOCABULARY_TARGET.max(free_target);
        let b2_mastered = mastered_count.clamp(0, b2_target);
        let b2_span = (b2_target - free_target).max(0);
        let b2_in_level = (b2_mastered - free_target).clamp(0, b2_span);
        let b2_completed = b2_target <= 0 || b2_mastered >= b2_target;

        let mut levels = free_levels;
        levels.push(LearningLevelStats {
            level: "B2".to_string(),
            mastered_count: b2_in_level,
            target_count: b2_span,
            cumulative_mastered: b2_mastered,
            cumulative_target: b2_target,
            completed: b2_completed,
            premium: true,
        });

        let current = levels
            .iter()
            .find(|level| !level.completed)
            .or_else(|| levels.last())
            .cloned()
            .unwrap_or_else(|| LearningLevelStats {
                level: "A1".to_string(),
                mastered_count,
                target_count: B2_VOCABULARY_TARGET,
                cumulative_mastered: mastered_count,
                cumulative_target: B2_VOCABULARY_TARGET,
                completed: mastered_count >= B2_VOCABULARY_TARGET,
                premium: false,
            });
        let level_percent = if current.target_count <= 0 {
            if current.completed {
                100
            } else {
                0
            }
        } else {
            ((current.mastered_count as f64 / current.target_count as f64) * 100.0).round() as i32
        };

        let learned_cards = self.db_repo.get_all_learned_cards(user_id).await?;
        let mut learned_map: HashMap<
            (String, String),
            (
                std::collections::HashSet<i32>,
                Option<chrono::DateTime<chrono::Utc>>,
            ),
        > = HashMap::new();
        for (cat, deck, card_index, learned_at) in learned_cards {
            let cat_clean = cat.split("::").last().unwrap_or(&cat).to_lowercase();
            let deck_clean = deck.split("::").last().unwrap_or(&deck).to_lowercase();
            let entry = learned_map
                .entry((cat_clean, deck_clean))
                .or_insert_with(|| (std::collections::HashSet::new(), None));
            entry.0.insert(card_index);
            if let Some(la) = learned_at {
                if entry.1.is_none() || Some(la) > entry.1 {
                    entry.1 = Some(la);
                }
            }
        }

        // El manifiesto contiene solo rutas y totales. Las imágenes/tarjetas
        // se resuelven bajo demanda para los pocos decks recomendados.
        let catalog = self.catalog_direction(normalized_direction).await?;
        let decks_progress: Vec<DeckProgressInfo> = catalog
            .categories
            .iter()
            .flat_map(|category| {
                category.decks.iter().map(|deck| {
                    let normalized_cat = category.name.to_lowercase();
                    let normalized_deck = deck.path.replace(".json", "").to_lowercase();

                    let (learned_set, last_touched) =
                        if let Some(val) = learned_map.get(&(normalized_cat, normalized_deck)) {
                            (Some(&val.0), val.1)
                        } else {
                            (None, None)
                        };

                    let learned_count = learned_set.map(|s| s.len() as i32).unwrap_or(0);

                    DeckProgressInfo {
                        category: category.name.clone(),
                        deck: deck.path.clone(),
                        learned_count,
                        total_count: deck.total as i32,
                        last_touched,
                        first_image_path: None,
                    }
                })
            })
            .collect();

        self.activity_repo
            .get_learning_stats(user_id, mastered_count, b2_target)
            .await
            .map(|mut stats| {
                stats.current_level = current.level;
                stats.level_percent = level_percent.clamp(0, 100);
                stats.levels = levels;
                stats.decks_progress = decks_progress;
                stats
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn landing_demo_namespace_is_isolated() {
        assert!(is_landing_demo_namespace("landing-demo"));
        assert!(!is_landing_demo_namespace("verbs"));
    }

    #[test]
    fn test_deck_definitions_extra() {
        let json_data = r#"[
            {
                "word": "I",
                "definitions": [
                    {
                        "imagePath": "/card_images/pronouns/1-basic/1-basic_card_0_def0.avif"
                    }
                ]
            }
        ]"#;
        let deck: DeckData = serde_json::from_str(json_data).unwrap();
        let card = deck.flashcards().first().unwrap();
        let first_image = card
            .extra
            .get("definitions")
            .and_then(|defs| defs.as_array())
            .and_then(|arr| arr.first())
            .and_then(|def| def.get("imagePath").or_else(|| def.get("image_path")))
            .and_then(|img| img.as_str())
            .map(|s| s.to_string());
        assert_eq!(
            first_image,
            Some("/card_images/pronouns/1-basic/1-basic_card_0_def0.avif".to_string())
        );
    }

    struct FakeStorageRepository {
        manifest_bytes: Vec<u8>,
    }

    #[async_trait::async_trait]
    impl StorageRepository for FakeStorageRepository {
        async fn get_catalog_manifest(&self) -> Result<Vec<u8>> {
            Ok(self.manifest_bytes.clone())
        }
        async fn list_categories_for_direction(
            &self,
            _course_direction: &str,
        ) -> Result<Vec<String>> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn list_decks_for_direction(
            &self,
            _course_direction: &str,
            _category: &str,
        ) -> Result<Vec<String>> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn get_deck_data_for_direction(
            &self,
            _course_direction: &str,
            _category: &str,
            _deck_name: &str,
        ) -> Result<DeckData> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn save_deck_data_for_direction(
            &self,
            _course_direction: &str,
            _category: &str,
            _deck_name: &str,
            _data: &DeckData,
        ) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn get_phonics_data(&self) -> Result<serde_json::Value> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn download_blob(&self, _blob_path: &str) -> Result<Vec<u8>> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn upload_blob(
            &self,
            _blob_path: &str,
            _content: Vec<u8>,
            _content_type: &str,
        ) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn blob_exists(&self, _blob_path: &str) -> Result<bool> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn blob_version(&self, _blob_path: &str) -> Result<Option<String>> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn find_blob_by_prefix(&self, _prefix: &str) -> Result<Option<String>> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn delete_blob(&self, _blob_path: &str) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn rename_blob(&self, _from_path: &str, _to_path: &str) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn list_files_in_dir(&self, _rel_dir: &str) -> Result<Vec<String>> {
            unimplemented!("not exercised by get_learning_stats")
        }
    }

    #[derive(Default)]
    struct FakeCardProgressRepository {
        /// Tarjetas dominadas por prefijo namespaced (ej. "es_en::1-basic/").
        learned_by_prefix: HashMap<String, i32>,
        all_learned: Vec<(String, String, i32, Option<chrono::DateTime<chrono::Utc>>)>,
    }

    #[async_trait::async_trait]
    impl CardProgressRepository for FakeCardProgressRepository {
        async fn upsert_card_progress(
            &self,
            _user_id: &str,
            _category: &str,
            _deck: &str,
            _card_index: i32,
            _learned: bool,
        ) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn get_learned_cards(
            &self,
            _user_id: &str,
            _category: &str,
            _deck: &str,
        ) -> Result<Vec<i32>> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn reset_card_progress(
            &self,
            _user_id: &str,
            _category: &str,
            _deck: &str,
        ) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn reset_category_progress(&self, _user_id: &str, _category: &str) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn count_learned_cards(&self, _user_id: &str) -> Result<i32> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn count_learned_cards_by_deck_prefix(
            &self,
            _user_id: &str,
            deck_prefix: &str,
        ) -> Result<i32> {
            Ok(self
                .learned_by_prefix
                .get(deck_prefix)
                .copied()
                .unwrap_or(0))
        }
        async fn count_learned_cards_by_category(
            &self,
            _user_id: &str,
            _category: &str,
        ) -> Result<HashMap<String, usize>> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn get_all_learned_cards(
            &self,
            _user_id: &str,
        ) -> Result<Vec<(String, String, i32, Option<chrono::DateTime<chrono::Utc>>)>> {
            Ok(self.all_learned.clone())
        }
        async fn upsert_cards_batch(
            &self,
            _user_id: &str,
            _category: &str,
            _deck: &str,
            _cards: &[CardProgressUpdate],
        ) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn get_srs_review_candidates(
            &self,
            _user_id: &str,
            _category_prefix: &str,
            _now: chrono::DateTime<chrono::Utc>,
            _limit: usize,
        ) -> Result<Vec<SrsReviewCandidate>> {
            unimplemented!("not exercised by get_learning_stats")
        }
    }

    struct FakeUserActivityRepository;

    #[async_trait::async_trait]
    impl UserActivityRepository for FakeUserActivityRepository {
        async fn increment_visit_count(&self, _email: &str) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn add_session_duration(&self, _email: &str, _secs: i64) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn get_stats(
            &self,
            _email: &str,
        ) -> Result<fluency_core::domain::models::user_activity::UserActivityStats> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn get_all_stats(
            &self,
        ) -> Result<Vec<fluency_core::domain::models::user_activity::UserActivityStats>> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn update_last_client(
            &self,
            _email: &str,
            _client: &fluency_core::domain::models::user_activity::ClientInfo,
        ) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn update_last_location(
            &self,
            _email: &str,
            _ip: Option<&str>,
            _country: Option<&str>,
        ) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn record_study_day(&self, _email: &str) -> Result<()> {
            unimplemented!("not exercised by get_learning_stats")
        }
        async fn get_learning_stats(
            &self,
            _email: &str,
            mastered_count: i32,
            target_count: i32,
        ) -> Result<LearningStats> {
            // Simula lo que devolvería el adapter real: mastered/target ya resueltos,
            // el resto (nivel, decks_progress) lo completa DeckUseCases::get_learning_stats.
            Ok(
                fluency_core::domain::models::user_activity::build_learning_stats(
                    mastered_count,
                    target_count,
                    "palabras",
                    "A1",
                    0,
                    vec![],
                    None,
                    0,
                    0,
                    "2026-01-01",
                    "2025-12-31",
                ),
            )
        }
    }

    /// Manifiesto mínimo con un deck por nivel (A1/A2/B1), 10 tarjetas cada uno.
    fn fixture_manifest_bytes() -> Vec<u8> {
        serde_json::json!({
            "schemaVersion": 1,
            "catalogVersion": "test",
            "directions": {
                "es_en": {
                    "categories": [{
                        "name": "verbs",
                        "total": 30,
                        "decks": [
                            {"path": "1-basic/action.json", "total": 10},
                            {"path": "2-intermediate/action.json", "total": 10},
                            {"path": "3-advanced/action.json", "total": 10}
                        ]
                    }]
                }
            }
        })
        .to_string()
        .into_bytes()
    }

    #[tokio::test]
    async fn get_learning_stats_computes_current_level_and_decks_progress_from_real_wiring() {
        let storage = FakeStorageRepository {
            manifest_bytes: fixture_manifest_bytes(),
        };
        // A1 (1-basic/) completo (10/10 dominadas); A2/B1 en cero → el nivel actual
        // debe pasar a A2, el primero no completado.
        let mut learned_by_prefix = HashMap::new();
        learned_by_prefix.insert("es_en::1-basic/".to_string(), 10);
        let db_repo = FakeCardProgressRepository {
            learned_by_prefix,
            all_learned: vec![(
                "es_en::verbs".to_string(),
                "es_en::1-basic/action".to_string(),
                0,
                None,
            )],
        };

        let uc = DeckUseCases::new(
            Arc::new(storage),
            Arc::new(db_repo),
            Arc::new(FakeUserActivityRepository),
        );
        let stats = uc
            .get_learning_stats("user-1", "es_en")
            .await
            .expect("get_learning_stats");

        assert_eq!(stats.current_level, "A2");
        assert_eq!(stats.levels.len(), 4); // A1, A2, B1, B2
        assert_eq!(stats.decks_progress.len(), 3);
        let a1_deck = stats
            .decks_progress
            .iter()
            .find(|d| d.deck == "1-basic/action.json")
            .expect("A1 deck present");
        assert_eq!(a1_deck.learned_count, 1);
        assert_eq!(a1_deck.total_count, 10);
        let a2_deck = stats
            .decks_progress
            .iter()
            .find(|d| d.deck == "2-intermediate/action.json")
            .expect("A2 deck present");
        assert_eq!(a2_deck.learned_count, 0);
    }

    struct DeckContentFake {
        decks: std::sync::Mutex<HashMap<String, DeckData>>,
    }

    impl DeckContentFake {
        fn new(direction: &str, category: &str, deck_name: &str, data: DeckData) -> Self {
            let mut map = HashMap::new();
            map.insert(format!("{direction}/{category}/{deck_name}"), data);
            Self {
                decks: std::sync::Mutex::new(map),
            }
        }
    }

    #[async_trait::async_trait]
    impl StorageRepository for DeckContentFake {
        async fn get_catalog_manifest(&self) -> Result<Vec<u8>> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn list_categories_for_direction(&self, _course_direction: &str) -> Result<Vec<String>> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn list_decks_for_direction(
            &self,
            _course_direction: &str,
            _category: &str,
        ) -> Result<Vec<String>> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn get_deck_data_for_direction(
            &self,
            course_direction: &str,
            category: &str,
            deck_name: &str,
        ) -> Result<DeckData> {
            let key = format!("{course_direction}/{category}/{deck_name}");
            self.decks
                .lock()
                .unwrap()
                .get(&key)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("deck not found: {key}"))
        }
        async fn save_deck_data_for_direction(
            &self,
            course_direction: &str,
            category: &str,
            deck_name: &str,
            data: &DeckData,
        ) -> Result<()> {
            let key = format!("{course_direction}/{category}/{deck_name}");
            self.decks.lock().unwrap().insert(key, data.clone());
            Ok(())
        }
        async fn get_phonics_data(&self) -> Result<serde_json::Value> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn download_blob(&self, _blob_path: &str) -> Result<Vec<u8>> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn upload_blob(
            &self,
            _blob_path: &str,
            _content: Vec<u8>,
            _content_type: &str,
        ) -> Result<()> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn blob_exists(&self, _blob_path: &str) -> Result<bool> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn blob_version(&self, _blob_path: &str) -> Result<Option<String>> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn find_blob_by_prefix(&self, _prefix: &str) -> Result<Option<String>> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn delete_blob(&self, _blob_path: &str) -> Result<()> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn rename_blob(&self, _from_path: &str, _to_path: &str) -> Result<()> {
            unimplemented!("not exercised by delete_definition")
        }
        async fn list_files_in_dir(&self, _rel_dir: &str) -> Result<Vec<String>> {
            unimplemented!("not exercised by delete_definition")
        }
    }

    fn two_definition_card_json() -> &'static str {
        r#"[
            {
                "word": "run",
                "definitions": [
                    {"meaning": "correr", "usage_example": "Voy a correr."},
                    {"meaning": "dirigir", "usage_example": "Ella dirige la empresa."}
                ]
            }
        ]"#
    }

    fn build_deck_use_cases(storage: DeckContentFake) -> DeckUseCases {
        DeckUseCases::new(
            Arc::new(storage),
            Arc::new(FakeCardProgressRepository::default()),
            Arc::new(FakeUserActivityRepository),
        )
    }

    #[tokio::test]
    async fn delete_definition_removes_the_targeted_entry() {
        let deck: DeckData = serde_json::from_str(two_definition_card_json()).unwrap();
        let uc = build_deck_use_cases(DeckContentFake::new("es_en", "verbs", "action.json", deck));

        let deleted = uc
            .delete_definition("verbs", "action.json", 0, 0, None, "es_en")
            .await
            .expect("delete_definition");
        assert!(deleted);

        let updated = uc
            .get_deck_json("verbs", "action.json", "es_en")
            .await
            .unwrap();
        let card = updated.flashcards().first().unwrap();
        let defs = card
            .extra
            .get("definitions")
            .and_then(|d| d.as_array())
            .unwrap();
        assert_eq!(defs.len(), 1);
        assert_eq!(
            defs[0].get("meaning").and_then(|m| m.as_str()),
            Some("dirigir")
        );
    }

    #[tokio::test]
    async fn delete_definition_out_of_range_returns_false_without_mutating() {
        let deck: DeckData = serde_json::from_str(two_definition_card_json()).unwrap();
        let uc = build_deck_use_cases(DeckContentFake::new("es_en", "verbs", "action.json", deck));

        assert!(!uc
            .delete_definition("verbs", "action.json", 0, 9, None, "es_en")
            .await
            .unwrap());
        assert!(!uc
            .delete_definition("verbs", "action.json", 9, 0, None, "es_en")
            .await
            .unwrap());

        let unchanged = uc
            .get_deck_json("verbs", "action.json", "es_en")
            .await
            .unwrap();
        let defs = unchanged
            .flashcards()
            .first()
            .unwrap()
            .extra
            .get("definitions")
            .and_then(|d| d.as_array())
            .unwrap();
        assert_eq!(defs.len(), 2);
    }
}
