//! "Crear palabra" — mazo personal por usuario (ver `docs/modules/flashcards.md` §Personal Words).
//!
//! El usuario escribe una palabra/frase; Gemini detecta su categoría gramatical Y su nivel
//! (básico/intermedio/avanzado — nunca se le pregunta al estudiante) y arma la card completa
//! (misma forma que el catálogo compartido). La card se guarda internamente en un namespace
//! personal **plano** (sin `/`) — `personal-<categoria>-<segmento-email>` — nunca en el catálogo
//! compartido ni en su `catalog-manifest.json` cacheado en RAM (con varios nodos backend corriendo
//! a la vez, mutar ese manifiesto sería inconsistente entre nodos).
//!
//! El namespace es plano a propósito: `image_use_cases`/`audio_use_cases` validan `category` con
//! `safe_storage_segment` (rechaza `/`), mientras que el storage de JSON de mazos acepta rutas con
//! `/`. Un slug plano es compatible con AMBOS validadores.
//!
//! **De cara al frontend, este namespace es 100% interno.** El catálogo general
//! (`DeckUseCases::list_decks`/`get_deck_summaries`) NO cambia ni se toca — el frontend pide por
//! separado (`GET /api/personal-words`, ver `personal_words_summaries`) si el usuario tiene mazo
//! personal para una categoría, y si lo tiene antepone su nombre de mazo reservado
//! (`<nivel>/my_words`, mismo patrón que un mazo real anidado, ej. `2-intermediate/action`) a la
//! lista que ya venía del catálogo. El frontend nunca ve ni construye `personal-<categoria>-<seg>`
//! — solo nombres de mazo y categorías reales, igual que cualquier mazo del catálogo. Al ABRIR ese
//! mazo, `resolve_storage_category` reescribe `category` al namespace interno usando el sentinel
//! `my_words` + el email ya validado contra el JWT (nunca dato de cliente sin validar).

use anyhow::{Context, Result};
use fluency_core::domain::models::flashcard::{DeckData, Flashcard};
use fluency_core::ports::tutor::{AITutor, ExistingPersonalTopic};
use std::sync::Arc;

use crate::audio_use_cases::{AudioSynthRequest, AudioUseCases};
use crate::image_use_cases::ImageUseCases;
use crate::{normalize_course_direction, user_path_segment, DeckUseCases};

/// Nombre fijo (sentinel) del mazo personal por (usuario, course_direction, categoría, nivel).
/// Nunca choca con un mazo real del catálogo — esos se nombran por tema (`action`,
/// `time_frequency`, ...), nunca `my_words`. Todas las palabras nuevas del usuario en esa
/// categoría+nivel se acumulan en `<nivel>/my_words` (mismo patrón que un mazo anidado real).
pub const PERSONAL_WORDS_DECK_NAME: &str = "my_words";

/// Prefijo del namespace interno personal (`personal-<categoria>-<segmento>`) — nunca visible para
/// el frontend, ver comentario de módulo. `pub(crate)` (no privado) para que `lib.rs` pueda
/// filtrarlo defensivamente al cargar el manifiesto del catálogo (`DeckUseCases::catalog_manifest`).
pub(crate) const PERSONAL_CATEGORY_PREFIX: &str = "personal-";

/// Los 3 niveles reales del catálogo (mismos slugs que las carpetas físicas
/// `json/<pair>/<categoria>/<nivel>/`). Duplicado intencional de `WORD_CARD_LEVELS`
/// (`api_main/.../gemini_word_card_prompt.rs`): `mod_flashcards` no puede depender de `api_main`
/// (regla de capas de `backend/GEMINI.md`), así que cada lado mantiene su propia copia.
pub const PERSONAL_WORD_LEVELS: &[&str] = &["1-basic", "2-intermediate", "3-advanced"];

/// Las 9 categorías gramaticales reales del catálogo. Duplicado intencional de
/// `WORD_CARD_CATEGORIES` (`api_main/.../gemini_word_card_prompt.rs`), mismo motivo que
/// `PERSONAL_WORD_LEVELS` de arriba. Usada para validar `category_override` cuando el usuario
/// elige/edita la categoría en el preview en vez de aceptar la de Gemini.
pub const PERSONAL_WORD_CATEGORIES: &[&str] = &[
    "nouns",
    "verbs",
    "adjectives",
    "adverbs",
    "preposition",
    "pronouns",
    "connectors",
    "determinant",
    "phrasal_verbs",
];

const MAX_WORD_LEN_CHARS: usize = 80;
const MAX_TOPIC_NAME_LEN_CHARS: usize = 60;

/// Namespace interno personal para `user_email`/`category` — función libre (no método) para que
/// `DeckUseCases` (`lib.rs`) y los endpoints de media puedan reescribir `category` vía
/// `resolve_storage_category` sin necesitar una instancia de `CardCreationUseCases`.
fn personal_category_for_email(user_email: &str, category: &str) -> String {
    format!(
        "{}{}-{}",
        PERSONAL_CATEGORY_PREFIX,
        category,
        user_path_segment(user_email)
    )
}

/// `true` si el último segmento de `deck_name` (separado por `/`) es el sentinel reservado
/// `my_words` — ej. `"1-basic/my_words"` o `"my_words"` a secas.
pub fn is_personal_deck_name(deck_name: &str) -> bool {
    deck_name.rsplit('/').next() == Some(PERSONAL_WORDS_DECK_NAME)
}

/// Punto único de reescritura storage: si `deck_name` es un mazo personal (`is_personal_deck_name`),
/// devuelve el namespace interno de `user_email` para `category`; si no, devuelve `category` tal
/// cual. Usado por `DeckUseCases::get_deck_data`/`update_card_status`/`update_cards_batch` y por
/// `AudioUseCases`/`ImageUseCases` antes de tocar storage — así abrir/progresar/generar media para
/// un mazo personal funciona con los mismos endpoints que cualquier mazo del catálogo.
pub fn resolve_storage_category(category: &str, deck_name: &str, user_email: &str) -> String {
    if is_personal_deck_name(deck_name) {
        personal_category_for_email(user_email, category)
    } else {
        category.to_string()
    }
}

/// Resumen de un mazo personal en un nivel — ver `CardCreationUseCases::personal_words_summaries`.
#[derive(Debug, Clone)]
pub struct PersonalDeckSummary {
    pub level: String,
    /// Nombre de mazo listo para `changeDeck`/`fetchDeckData` (`<nivel>/my_words`).
    pub deck: String,
    pub total: usize,
    pub learned: usize,
    /// Nombre puesto por el usuario (`rename_personal_deck`) — `None` si nunca le puso nombre,
    /// en cuyo caso el frontend muestra el label genérico ("My words"/"Mis palabras").
    pub topic_name: Option<String>,
}

/// Vista previa de dónde va a caer una palabra ANTES de generar imagen/audio — el usuario la
/// confirma en el mismo modal de "Crear palabra" antes de que arranque la parte cara de la
/// generación (pedido explícito: mostrar el destino de forma clara e interactiva, minimalista,
/// en el mismo formulario). Reclasifica con Gemini otra vez al confirmar (`create_personal_word`)
/// en vez de cachear el borrador — es una llamada de texto barata (no imagen/audio), y a
/// temperatura baja el resultado es consistente en la práctica; se documenta como
/// compromiso deliberado, no builder de sesión con estado server-side por simplicidad.
#[derive(Debug, Clone)]
pub struct WordPreview {
    pub duplicate: bool,
    pub category: String,
    pub level: String,
    pub name: String,
    pub is_new_deck: bool,
    /// Nombre que el usuario ya le puso a ese mazo, si existe y no es la primera palabra.
    pub existing_topic_name: Option<String>,
}

/// Resultado interno de clasificar+cargar, compartido por `preview_personal_word` y
/// `create_personal_word` — evita duplicar la llamada a Gemini y la carga del mazo existente.
struct ClassifiedWord {
    draft: serde_json::Value,
    category: String,
    level: String,
    name: String,
    personal_category: String,
    deck_name: String,
    deck: DeckData,
    is_new_deck: bool,
    duplicate: bool,
}

#[derive(Debug, Clone)]
pub enum CreateWordOutcome {
    /// La palabra ya existía en el mazo personal del usuario para la categoría+nivel detectados —
    /// no se llamó a ningún proveedor de IA de medios (cero costo).
    Duplicate {
        /// Categoría gramatical detectada (`nouns`, `verbs`, ...) — nombre real, no el namespace
        /// interno.
        category: String,
        level: String,
        name: String,
    },
    Created {
        category: String,
        level: String,
        card: serde_json::Value,
        /// `true` si esta palabra creó el mazo (no existía ninguna palabra antes en esta
        /// categoría+nivel para este usuario) — el frontend solo ofrece "ponerle nombre al mazo"
        /// en ese caso; si el mazo ya existía (con o sin nombre propio), la palabra simplemente
        /// se suma y no se vuelve a preguntar.
        is_new_deck: bool,
    },
}

fn target_lang_for_course_direction(course_direction: &str) -> &'static str {
    match course_direction {
        "en_es" => "es",
        "es_de" => "de",
        _ => "en",
    }
}

/// Lee `extra.topic_name` de un mazo personal (`DeckData::Object`, ver `rename_personal_deck`).
/// `DeckData::Array` (mazo sin nombre propio todavía) no tiene `extra` — devuelve `None`.
fn read_topic_name(deck: &DeckData) -> Option<String> {
    match deck {
        DeckData::Object { extra, .. } => extra
            .get("topic_name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string()),
        DeckData::Array(_) => None,
    }
}

pub struct CardCreationUseCases {
    ai_tutor: Arc<dyn AITutor>,
    image_use_cases: Arc<ImageUseCases>,
    audio_use_cases: Arc<AudioUseCases>,
    deck_use_cases: Arc<DeckUseCases>,
}

impl CardCreationUseCases {
    pub fn new(
        ai_tutor: Arc<dyn AITutor>,
        image_use_cases: Arc<ImageUseCases>,
        audio_use_cases: Arc<AudioUseCases>,
        deck_use_cases: Arc<DeckUseCases>,
    ) -> Self {
        Self {
            ai_tutor,
            image_use_cases,
            audio_use_cases,
            deck_use_cases,
        }
    }

    /// Clasifica la palabra con Gemini (categoría+nivel, 1 o 2 candidatos), carga el mazo personal
    /// existente (o arranca vacío) y revisa duplicado por cada candidato — SIN generar imagen/audio
    /// ni guardar nada. Compartido por `preview_personal_word` y `create_personal_word`.
    ///
    /// Con `category_override`/`level_override` (ambos presentes o ambos ausentes — validado por
    /// los llamadores públicos), Gemini devuelve exactamente 1 candidato clampeado a esos valores;
    /// sin overrides puede devolver 1 o 2 (Gemini decide si la palabra es gramaticalmente ambigua).
    /// `existing_topics`: solo tiene efecto SIN overrides — ver `AITutor::generate_word_card_draft`.
    async fn classify_and_load(
        &self,
        user_email: &str,
        word_trimmed: &str,
        normalized_direction: &str,
        category_override: Option<&str>,
        level_override: Option<&str>,
        existing_topics: &[ExistingPersonalTopic],
    ) -> Result<Vec<ClassifiedWord>> {
        let drafts = self
            .ai_tutor
            .generate_word_card_draft(
                word_trimmed,
                normalized_direction,
                category_override,
                level_override,
                existing_topics,
            )
            .await
            .context("No se pudo generar el borrador de la palabra")?;

        let mut out = Vec::with_capacity(drafts.len());
        for draft in drafts {
            let category = draft
                .get("category")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .context("Gemini: falta 'category' en el borrador")?
                .trim()
                .to_ascii_lowercase();

            let level = draft
                .get("level")
                .and_then(|v| v.as_str())
                .filter(|s| PERSONAL_WORD_LEVELS.contains(s))
                .context("Gemini: falta o es inválido 'level' en el borrador")?
                .to_string();

            let name = draft
                .get("name")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or(word_trimmed)
                .trim()
                .to_string();
            let name_lower = name.to_ascii_lowercase();

            let personal_category = personal_category_for_email(user_email, &category);
            let deck_name = format!("{level}/{PERSONAL_WORDS_DECK_NAME}");

            // Mazo personal existente para este nivel, o vacío si es la primera palabra ahí.
            let (deck, is_new_deck) = match self
                .deck_use_cases
                .get_deck_json(&personal_category, &deck_name, normalized_direction)
                .await
            {
                Ok(existing) => (existing, false),
                Err(e) => {
                    tracing::info!(
                        "personal-word: mazo '{personal_category}/{deck_name}' aún no existe ({e}), arrancando vacío"
                    );
                    (DeckData::Array(Vec::new()), true)
                }
            };

            let duplicate = deck.flashcards().iter().any(|card| {
                card.extra
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(|existing| existing.trim().eq_ignore_ascii_case(&name_lower))
                    .unwrap_or(false)
            });

            out.push(ClassifiedWord {
                draft,
                category,
                level,
                name,
                personal_category,
                deck_name,
                deck,
                is_new_deck,
                duplicate,
            });
        }
        Ok(out)
    }

    /// Ambos overrides presentes o ambos ausentes; si están presentes, valida que sean valores
    /// conocidos. Compartido por `preview_personal_word` y `create_personal_word`.
    fn validate_overrides(
        category_override: Option<&str>,
        level_override: Option<&str>,
    ) -> Result<()> {
        match (category_override, level_override) {
            (None, None) => Ok(()),
            (Some(category), Some(level)) => {
                anyhow::ensure!(
                    PERSONAL_WORD_CATEGORIES.contains(&category),
                    "Categoría inválida: '{category}'"
                );
                anyhow::ensure!(
                    PERSONAL_WORD_LEVELS.contains(&level),
                    "Nivel inválido: '{level}'"
                );
                Ok(())
            }
            _ => anyhow::bail!(
                "category_override y level_override deben venir juntos o ninguno de los dos"
            ),
        }
    }

    /// Vista previa: clasifica y dice dónde va a caer la palabra (mazo existente + su nombre, o
    /// "mazo nuevo") ANTES de generar imagen/audio. Mismo gate admin/premium que la creación real
    /// — nunca gratis para un rol no autorizado, aunque no genere media.
    ///
    /// `existing_topics` (ignorado si viene junto con `category_override`/`level_override` — esos
    /// ya determinan todo): la lista COMPLETA de mazos personales que el estudiante ya tiene, para
    /// que Gemini pueda RECOMENDAR el mejor encaje en la MISMA llamada — pedido explícito: "vos
    /// debés recomendarlo y colocar esa recomendación como primera opción". Ver
    /// `AITutor::generate_word_card_draft`.
    pub async fn preview_personal_word(
        &self,
        user_email: &str,
        role: &str,
        word: &str,
        course_direction: &str,
        category_override: Option<&str>,
        level_override: Option<&str>,
        existing_topics: &[ExistingPersonalTopic],
    ) -> Result<Vec<WordPreview>> {
        let role_norm = role.trim().to_ascii_lowercase();
        let is_admin = role_norm == "admin";
        let is_premium = role_norm == "premium";
        if !is_admin && !is_premium {
            anyhow::bail!("No autorizado para crear palabras nuevas (requiere plan Premium)");
        }

        let word_trimmed = word.trim();
        anyhow::ensure!(!word_trimmed.is_empty(), "La palabra no puede estar vacía");
        anyhow::ensure!(
            word_trimmed.chars().count() <= MAX_WORD_LEN_CHARS,
            "La palabra es demasiado larga"
        );
        Self::validate_overrides(category_override, level_override)?;

        let normalized_direction = normalize_course_direction(Some(course_direction));
        // La lista solo tiene sentido en la clasificación LIBRE — si ya hay overrides, esos
        // determinan todo por su cuenta (ver `build_word_card_user_message`).
        let no_topics: &[ExistingPersonalTopic] = &[];
        let existing_topics = if category_override.is_some() {
            no_topics
        } else {
            existing_topics
        };
        let classified = self
            .classify_and_load(
                user_email,
                word_trimmed,
                normalized_direction,
                category_override,
                level_override,
                existing_topics,
            )
            .await?;

        Ok(classified
            .into_iter()
            .map(|c| {
                let existing_topic_name = if c.is_new_deck {
                    None
                } else {
                    read_topic_name(&c.deck)
                };
                WordPreview {
                    duplicate: c.duplicate,
                    category: c.category,
                    level: c.level,
                    name: c.name,
                    is_new_deck: c.is_new_deck,
                    existing_topic_name,
                }
            })
            .collect())
    }

    /// Crea una palabra nueva en el mazo personal del usuario. Admin/Premium únicamente. Revisa
    /// duplicado (dentro del mismo nivel) ANTES de llamar a cualquier proveedor de IA de medios.
    pub async fn create_personal_word(
        &self,
        user_email: &str,
        role: &str,
        word: &str,
        course_direction: &str,
        category_override: Option<&str>,
        level_override: Option<&str>,
    ) -> Result<CreateWordOutcome> {
        let role_norm = role.trim().to_ascii_lowercase();
        let is_admin = role_norm == "admin";
        let is_premium = role_norm == "premium";
        if !is_admin && !is_premium {
            anyhow::bail!("No autorizado para crear palabras nuevas (requiere plan Premium)");
        }

        let word_trimmed = word.trim();
        anyhow::ensure!(!word_trimmed.is_empty(), "La palabra no puede estar vacía");
        anyhow::ensure!(
            word_trimmed.chars().count() <= MAX_WORD_LEN_CHARS,
            "La palabra es demasiado larga"
        );
        Self::validate_overrides(category_override, level_override)?;

        let normalized_direction = normalize_course_direction(Some(course_direction));

        // Sin override, `create_personal_word` toma el primer candidato de Gemini (compatibilidad
        // hacia atrás / llamadores que no pasan por el preview). En el camino real, el frontend
        // SIEMPRE manda overrides (incluso para la fila que el usuario no tocó) — así esta función
        // nunca necesita resolver ambigüedad, crea exactamente una tarjeta por llamada.
        let ClassifiedWord {
            draft,
            category,
            level,
            name,
            personal_category,
            deck_name,
            mut deck,
            is_new_deck,
            duplicate,
        } = self
            .classify_and_load(
                user_email,
                word_trimmed,
                normalized_direction,
                category_override,
                level_override,
                // `create_personal_word` SIEMPRE recibe overrides del frontend (ver comentario de
                // `create_personal_word` más abajo) — la lista de `preview_personal_word` no aplica acá.
                &[],
            )
            .await?
            .into_iter()
            .next()
            .context("Gemini no devolvió ninguna clasificación")?;

        if duplicate {
            return Ok(CreateWordOutcome::Duplicate {
                category,
                level,
                name,
            });
        }

        let definitions = draft
            .get("definitions")
            .and_then(|v| v.as_array())
            .context("Gemini: falta 'definitions' en el borrador")?;
        let first_def = definitions
            .first()
            .context("Gemini: 'definitions' vacío en el borrador")?;
        let usage_example = first_def
            .get("usage_example")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .context("Gemini: falta 'usage_example' en el borrador")?
            .to_string();

        let card_index = deck.flashcards().len();
        let def_index = 0usize;

        // Imagen: SIEMPRE Gemini directo — nunca el pipeline local Ollama+ComfyUI (pedido
        // explícito del usuario para esta ruta).
        let blob_path_base = format!(
            "{}/{}_card_{}_def{}",
            personal_category,
            deck_name.replace('/', "_"),
            card_index,
            def_index
        );
        let image_url = self
            .image_use_cases
            .generate_and_store_direct_gemini(&blob_path_base, &usage_example)
            .await
            .context("No se pudo generar la imagen de la palabra")?;

        // Audio: `AudioUseCases::get_or_synthesize_audio` YA usa Gemini por defecto
        // (`RoutingTtsProvider`, sin dependencia local). Pasamos role="admin" para que NO aplique
        // su propio prefijo `users/<segmento>/` — el namespace personal ya aísla por usuario, y
        // duplicar el anidado produciría `users/<seg>/personal-x-<seg>/...`. Pasamos la categoría
        // REAL (no `personal_category`): `get_or_synthesize_audio` reescribe internamente vía
        // `resolve_storage_category` al ver el sentinel `my_words` en `deck` — pasar ya el
        // namespace interno acá lo envolvería dos veces (`personal-personal-...`).
        let audio_req = AudioSynthRequest {
            category: category.clone(),
            deck: deck_name.clone(),
            text: usage_example.clone(),
            voice_name: String::new(),
            verb_name: None,
            tone: None,
            lang: Some(target_lang_for_course_direction(normalized_direction).to_string()),
            course_direction: Some(normalized_direction.to_string()),
            exclude_voice: None,
            force_regenerate: false,
        };
        let audio_result = self
            .audio_use_cases
            .get_or_synthesize_audio(&audio_req, user_email, "admin")
            .await
            .context("No se pudo generar el audio de la palabra")?;

        // Ensamblar la card final con la MISMA forma que ya usan las flashcards del catálogo
        // (`json/**/*.json`): `category`/`level` no son campos reales de `Flashcard.extra` (el
        // nivel ya está codificado en `deck_name`, igual que en un mazo real anidado), se
        // descartan; `force_generation` es constante para cards nuevas (no se le pide al modelo).
        let mut extra = draft;
        if let Some(obj) = extra.as_object_mut() {
            obj.remove("category");
            obj.remove("level");
            obj.insert("force_generation".to_string(), serde_json::Value::Bool(false));
        }
        if let Some(first) = extra
            .get_mut("definitions")
            .and_then(|v| v.as_array_mut())
            .and_then(|defs| defs.get_mut(0))
            .and_then(|v| v.as_object_mut())
        {
            first.insert("imagePath".to_string(), serde_json::Value::String(image_url));
            first.insert(
                "audioPath".to_string(),
                serde_json::Value::String(audio_result.audio_url),
            );
        }

        let card = Flashcard {
            word: String::new(),
            translation: String::new(),
            example: None,
            learned: false,
            learned_at: None,
            extra,
        };

        deck.flashcards_mut().push(card.clone());
        self.deck_use_cases
            .save_deck_json(&personal_category, &deck_name, &deck, normalized_direction)
            .await
            .context("No se pudo guardar la palabra nueva")?;

        Ok(CreateWordOutcome::Created {
            category,
            level,
            is_new_deck,
            card: serde_json::to_value(&card)?,
        })
    }

    /// Resumen en vivo de los mazos personales del usuario para una categoría — uno por cada nivel
    /// donde ya creó al menos una palabra (0 a 3 entradas). Nunca toca el manifiesto cacheado; es
    /// la única lectura extra del flujo, y el frontend la pide aparte (`GET /api/personal-words`)
    /// justo después de cargar el catálogo general de esa categoría, para anteponer el resultado a
    /// la lista ya mostrada — ver comentario de módulo.
    pub async fn personal_words_summaries(
        &self,
        user_email: &str,
        category: &str,
        course_direction: &str,
    ) -> Result<Vec<PersonalDeckSummary>> {
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let personal_category = personal_category_for_email(user_email, category);

        let mut summaries = Vec::new();
        for level in PERSONAL_WORD_LEVELS {
            let deck_name = format!("{level}/{PERSONAL_WORDS_DECK_NAME}");
            let Ok(deck) = self
                .deck_use_cases
                .get_deck_json(&personal_category, &deck_name, normalized_direction)
                .await
            else {
                continue;
            };
            // Las tarjetas retiradas por un admin (`DELETE /api/delete-card`) siguen en el archivo
            // para no correr los índices, pero no cuentan como estudiables en el mosaico.
            let total = deck
                .flashcards()
                .iter()
                .filter(|card| !card.is_deleted())
                .count();
            if total == 0 {
                continue;
            }
            let learned = self
                .deck_use_cases
                .learned_count_for_deck(user_email, &personal_category, &deck_name, normalized_direction)
                .await;
            let topic_name = read_topic_name(&deck);
            summaries.push(PersonalDeckSummary {
                level: level.to_string(),
                deck: deck_name,
                total,
                learned,
                topic_name,
            });
        }
        Ok(summaries)
    }

    /// Le pone/cambia nombre a un mazo personal ya existente (no crea uno nuevo — falla si
    /// `category`+`level` todavía no tiene ninguna palabra). Admin/Premium únicamente, mismo gate
    /// que `create_personal_word`. El frontend solo ofrece esto justo después de crear la PRIMERA
    /// palabra de un mazo nuevo (`CreateWordOutcome::Created.is_new_deck`); si el mazo ya existía
    /// (con o sin nombre), las palabras siguientes se agregan sin volver a preguntar.
    pub async fn rename_personal_deck(
        &self,
        user_email: &str,
        role: &str,
        category: &str,
        level: &str,
        topic_name: &str,
        course_direction: &str,
    ) -> Result<()> {
        let role_norm = role.trim().to_ascii_lowercase();
        let is_admin = role_norm == "admin";
        let is_premium = role_norm == "premium";
        if !is_admin && !is_premium {
            anyhow::bail!("No autorizado para nombrar mazos personales (requiere plan Premium)");
        }

        let level = level.trim();
        anyhow::ensure!(PERSONAL_WORD_LEVELS.contains(&level), "Nivel inválido");

        let topic_name = topic_name.trim();
        anyhow::ensure!(!topic_name.is_empty(), "El nombre no puede estar vacío");
        anyhow::ensure!(
            topic_name.chars().count() <= MAX_TOPIC_NAME_LEN_CHARS,
            "El nombre es demasiado largo"
        );

        let normalized_direction = normalize_course_direction(Some(course_direction));
        let personal_category = personal_category_for_email(user_email, category);
        let deck_name = format!("{level}/{PERSONAL_WORDS_DECK_NAME}");

        let deck = self
            .deck_use_cases
            .get_deck_json(&personal_category, &deck_name, normalized_direction)
            .await
            .context("Ese mazo todavía no existe")?;

        let named = DeckData::Object {
            flashcards: deck.flashcards().to_vec(),
            extra: serde_json::json!({ "topic_name": topic_name }),
        };

        self.deck_use_cases
            .save_deck_json(&personal_category, &deck_name, &named, normalized_direction)
            .await
            .context("No se pudo guardar el nombre del mazo")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::FlashcardsConfig;
    use fluency_core::domain::models::srs::{CardProgressUpdate, SrsReviewCandidate};
    use fluency_core::ports::audio::AudioGenerator;
    use fluency_core::ports::image::ImageGenerator;
    use fluency_core::ports::image_compressor::ImageCompressor;
    use fluency_core::ports::storage::StorageRepository;
    use std::collections::HashMap;
    use std::sync::Mutex;

    // -- Fakes: cada uno solo implementa lo que este archivo ejercita; el resto es
    // `unimplemented!()` a propósito (mismo patrón que `lib.rs`/`image_use_cases.rs`).

    struct FakeStorage {
        decks: Mutex<HashMap<String, DeckData>>,
    }

    impl FakeStorage {
        fn empty() -> Self {
            Self {
                decks: Mutex::new(HashMap::new()),
            }
        }

        fn seeded(course_direction: &str, category: &str, deck_name: &str, data: DeckData) -> Self {
            let mut map = HashMap::new();
            map.insert(format!("{course_direction}/{category}/{deck_name}"), data);
            Self {
                decks: Mutex::new(map),
            }
        }
    }

    #[async_trait::async_trait]
    impl StorageRepository for FakeStorage {
        async fn get_catalog_manifest(&self) -> Result<Vec<u8>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn list_categories_for_direction(&self, _course_direction: &str) -> Result<Vec<String>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn list_decks_for_direction(
            &self,
            _course_direction: &str,
            _category: &str,
        ) -> Result<Vec<String>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
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
                .ok_or_else(|| anyhow::anyhow!("Deck file not found: {key}"))
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
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn download_blob(&self, _blob_path: &str) -> Result<Vec<u8>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn upload_blob(
            &self,
            _blob_path: &str,
            _content: Vec<u8>,
            _content_type: &str,
        ) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn blob_exists(&self, _blob_path: &str) -> Result<bool> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn blob_version(&self, _blob_path: &str) -> Result<Option<String>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn find_blob_by_prefix(&self, _prefix: &str) -> Result<Option<String>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn delete_blob(&self, _blob_path: &str) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn rename_blob(&self, _from_path: &str, _to_path: &str) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn list_files_in_dir(&self, _rel_dir: &str) -> Result<Vec<String>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
    }

    struct FakeCardProgressRepository;

    #[async_trait::async_trait]
    impl fluency_core::ports::db_repository::CardProgressRepository for FakeCardProgressRepository {
        async fn upsert_card_progress(
            &self,
            _user_id: &str,
            _category: &str,
            _deck: &str,
            _card_index: i32,
            _learned: bool,
        ) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn get_learned_cards(
            &self,
            _user_id: &str,
            _category: &str,
            _deck: &str,
        ) -> Result<Vec<i32>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn reset_card_progress(
            &self,
            _user_id: &str,
            _category: &str,
            _deck: &str,
        ) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn reset_category_progress(&self, _user_id: &str, _category: &str) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn count_learned_cards(&self, _user_id: &str) -> Result<i32> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn count_learned_cards_by_deck_prefix(
            &self,
            _user_id: &str,
            _deck_prefix: &str,
        ) -> Result<i32> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn count_learned_cards_by_category(
            &self,
            _user_id: &str,
            _category: &str,
        ) -> Result<HashMap<String, usize>> {
            // Sin tarjetas aprendidas registradas en los fakes que ejercitan esto
            // (`personal_words_summaries`) — vacío es una respuesta válida.
            Ok(HashMap::new())
        }
        async fn get_all_learned_cards(
            &self,
            _user_id: &str,
        ) -> Result<Vec<(String, String, i32, Option<chrono::DateTime<chrono::Utc>>)>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn upsert_cards_batch(
            &self,
            _user_id: &str,
            _category: &str,
            _deck: &str,
            _cards: &[CardProgressUpdate],
        ) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn get_srs_review_candidates(
            &self,
            _user_id: &str,
            _category_prefix: &str,
            _now: chrono::DateTime<chrono::Utc>,
            _limit: usize,
        ) -> Result<Vec<SrsReviewCandidate>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
    }

    struct FakeUserActivityRepository;

    #[async_trait::async_trait]
    impl fluency_core::ports::db_repository::UserActivityRepository for FakeUserActivityRepository {
        async fn increment_visit_count(&self, _email: &str) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn add_session_duration(&self, _email: &str, _secs: i64) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn get_stats(
            &self,
            _email: &str,
        ) -> Result<fluency_core::domain::models::user_activity::UserActivityStats> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn get_all_stats(
            &self,
        ) -> Result<Vec<fluency_core::domain::models::user_activity::UserActivityStats>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn update_last_client(
            &self,
            _email: &str,
            _client: &fluency_core::domain::models::user_activity::ClientInfo,
        ) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn update_last_location(
            &self,
            _email: &str,
            _ip: Option<&str>,
            _country: Option<&str>,
        ) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn record_study_day(&self, _email: &str) -> Result<()> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn get_learning_stats(
            &self,
            _email: &str,
            _mastered_count: i32,
            _target_count: i32,
        ) -> Result<fluency_core::domain::models::user_activity::LearningStats> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
    }

    struct FakeImageGenerator;
    #[async_trait::async_trait]
    impl ImageGenerator for FakeImageGenerator {
        async fn generate(&self, _prompt: &str) -> Result<Vec<u8>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
    }

    struct FakeImageCompressor;
    impl ImageCompressor for FakeImageCompressor {
        fn compress_to_avif(&self, _bytes: &[u8], _quality: u8) -> Result<Vec<u8>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
    }

    struct FakeAudioGenerator;
    #[async_trait::async_trait]
    impl AudioGenerator for FakeAudioGenerator {
        async fn synthesize(
            &self,
            _text: &str,
            _voice_name: &str,
            _lang: Option<&str>,
        ) -> Result<Vec<u8>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn synthesize_ssml(
            &self,
            _ssml: &str,
            _voice_name: &str,
            _lang: Option<&str>,
        ) -> Result<Vec<u8>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
    }

    /// Devuelve un borrador primario válido (categoría/nivel/nombre fijos) y, sin overrides,
    /// también uno por cada tupla de `extra` (categoría, nivel, nombre) — así los tests pueden
    /// simular una palabra con 1 o 2 clasificaciones. Con overrides (simulando lo que pide el
    /// frontend tras el preview), devuelve exactamente 1 elemento clampeado a esos valores,
    /// mismo comportamiento que `GeminiGrpcProvider::generate_word_card_draft`.
    struct FakeAiTutor {
        category: &'static str,
        level: &'static str,
        name: &'static str,
        extra: Vec<(&'static str, &'static str, &'static str)>,
    }

    impl FakeAiTutor {
        fn draft_for(word: &str, category: &str, level: &str, name: &str) -> serde_json::Value {
            serde_json::json!({
                "category": category,
                "level": level,
                "name": name,
                "phonetic": "/test/",
                "spoken_phonetic_us": "/test/",
                "search_term": "noun/test",
                "is_verb": false,
                "group_name": "Test Group",
                "definitions": [{
                    "meaning": "significado de prueba",
                    "usage_example": format!("I use {word} every day."),
                    "usage_example_es": "Uso esto todos los días.",
                    "pronunciation_guide_es": "/test/",
                    "char_count": "two",
                    "usage_context_en": "test",
                    "usage_context_es": "prueba",
                }]
            })
        }
    }

    #[async_trait::async_trait]
    impl AITutor for FakeAiTutor {
        async fn analyze_error(&self, _: &str, _: &str, _: &str) -> Result<String> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn explain_like_child(&self, _: &str, _: &str, _: &str, _: Option<&str>) -> Result<String> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn improve_visual_prompts_batch(
            &self,
            _: &serde_json::Value,
            _: &str,
        ) -> Result<Vec<String>> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn improve_prompt_for_image(
            &self,
            _: &str,
            _: &str,
            _: Option<&str>,
            _: Option<&str>,
        ) -> Result<String> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn improve_prompt_for_landing_demo_image(
            &self,
            _: &str,
            _: &str,
            _: Option<&str>,
            _: Option<&str>,
            _: Option<&str>,
        ) -> Result<String> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn refine_audio_ssml(&self, _: &str, _: &str) -> Result<String> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        #[allow(clippy::too_many_arguments)]
        async fn guide_onboarding_step(
            &self,
            _: &str,
            _: &str,
            _: u32,
            _: u32,
            _: &str,
            _: &str,
            _: &str,
            _: Option<&str>,
            _: Option<&str>,
            _: Option<&str>,
        ) -> Result<String> {
            unimplemented!("not exercised by card_creation_use_cases tests")
        }
        async fn generate_word_card_draft(
            &self,
            word: &str,
            _course_direction: &str,
            category_override: Option<&str>,
            level_override: Option<&str>,
            existing_topics: &[ExistingPersonalTopic],
        ) -> Result<Vec<serde_json::Value>> {
            if let (Some(category), Some(level)) = (category_override, level_override) {
                return Ok(vec![Self::draft_for(word, category, level, self.name)]);
            }
            // Simula que Gemini recomienda el mazo existente SOLO cuando su categoría coincide con
            // la que hubiera clasificado libremente — igual criterio que el prompt real.
            let level = existing_topics
                .iter()
                .find(|t| t.category == self.category)
                .map(|t| t.level.as_str())
                .unwrap_or(self.level);
            let mut out = vec![Self::draft_for(word, self.category, level, self.name)];
            for (category, level, name) in &self.extra {
                out.push(Self::draft_for(word, category, level, name));
            }
            Ok(out)
        }
    }

    fn test_config() -> Arc<FlashcardsConfig> {
        Arc::new(FlashcardsConfig {
            gcs_audio_prefix: "card_audio".to_string(),
            gcs_images_prefix: "card_images".to_string(),
            image_ai_enabled: true,
            is_production: false,
        })
    }

    fn build_use_cases(storage: Arc<FakeStorage>, ai_tutor: Arc<dyn AITutor>) -> CardCreationUseCases {
        let deck_use_cases = Arc::new(DeckUseCases::new(
            storage.clone(),
            Arc::new(FakeCardProgressRepository),
            Arc::new(FakeUserActivityRepository),
        ));
        let image_use_cases = Arc::new(ImageUseCases::new(
            storage.clone(),
            Arc::new(FakeImageGenerator),
            Arc::new(FakeImageGenerator),
            None,
            Arc::new(FakeImageCompressor),
            ai_tutor.clone(),
            test_config(),
        ));
        let audio_use_cases = Arc::new(AudioUseCases::new(
            storage,
            Arc::new(FakeAudioGenerator),
            None,
            ai_tutor.clone(),
            test_config(),
        ));
        CardCreationUseCases::new(ai_tutor, image_use_cases, audio_use_cases, deck_use_cases)
    }

    #[test]
    fn is_personal_deck_name_matches_any_level_prefix() {
        assert!(is_personal_deck_name("my_words"));
        assert!(is_personal_deck_name("1-basic/my_words"));
        assert!(is_personal_deck_name("2-intermediate/my_words"));
        assert!(!is_personal_deck_name("action"));
        assert!(!is_personal_deck_name("2-intermediate/action"));
    }

    #[test]
    fn resolve_storage_category_rewrites_only_for_the_personal_sentinel_deck() {
        let personal = resolve_storage_category(
            "verbs",
            "1-basic/my_words",
            "Jesus.Coronado@Example.com",
        );
        assert_eq!(personal, "personal-verbs-jesus_coronado_example_com");
        assert!(!personal.contains('/'), "namespace interno debe ser plano");

        let untouched = resolve_storage_category("verbs", "1-basic/action", "user@example.com");
        assert_eq!(untouched, "verbs", "un mazo real no se reescribe");
    }

    #[tokio::test]
    async fn create_personal_word_rejects_viewer_role() {
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );
        let err = uc
            .create_personal_word("user@example.com", "viewer", "table", "es_en", None, None)
            .await
            .expect_err("viewer no debería poder crear palabras");
        assert!(err.to_string().contains("No autorizado"));
    }

    #[tokio::test]
    async fn create_personal_word_rejects_empty_word() {
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );
        let err = uc
            .create_personal_word("user@example.com", "premium", "   ", "es_en", None, None)
            .await
            .expect_err("palabra vacía debería rechazarse");
        assert!(err.to_string().contains("vacía"));
    }

    #[tokio::test]
    async fn create_personal_word_detects_duplicate_case_insensitive_within_the_same_level() {
        let existing_card: Flashcard = serde_json::from_value(serde_json::json!({
            "word": "",
            "translation": "",
            "example": null,
            "learned": false,
            "learned_at": null,
            "name": "Table",
            "definitions": []
        }))
        .unwrap();
        let deck = DeckData::Array(vec![existing_card]);
        let storage = Arc::new(FakeStorage::seeded(
            "es_en",
            "personal-nouns-user_example_com",
            "1-basic/my_words",
            deck,
        ));
        let uc = build_use_cases(
            storage,
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        let outcome = uc
            .create_personal_word("user@example.com", "premium", "table", "es_en", None, None)
            .await
            .expect("no debería fallar: el duplicado se detecta antes de llamar a IA de medios");

        match outcome {
            CreateWordOutcome::Duplicate { category, level, name } => {
                assert_eq!(category, "nouns");
                assert_eq!(level, "1-basic");
                assert_eq!(name, "table");
            }
            CreateWordOutcome::Created { .. } => panic!("debería haber detectado el duplicado"),
        }
    }

    #[tokio::test]
    async fn personal_words_summaries_is_empty_when_nothing_created_yet() {
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );
        let summaries = uc
            .personal_words_summaries("user@example.com", "nouns", "es_en")
            .await
            .unwrap();
        assert!(summaries.is_empty());
    }

    #[tokio::test]
    async fn personal_words_summaries_counts_existing_cards_per_level() {
        let card: Flashcard = serde_json::from_value(serde_json::json!({
            "word": "", "translation": "", "example": null,
            "learned": false, "learned_at": null, "name": "table", "definitions": []
        }))
        .unwrap();
        let storage = Arc::new(FakeStorage::seeded(
            "es_en",
            "personal-nouns-user_example_com",
            "1-basic/my_words",
            DeckData::Array(vec![card]),
        ));
        let uc = build_use_cases(
            storage,
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        let summaries = uc
            .personal_words_summaries("user@example.com", "nouns", "es_en")
            .await
            .unwrap();
        assert_eq!(summaries.len(), 1, "solo el nivel básico tiene un mazo creado");
        let summary = &summaries[0];
        assert_eq!(summary.level, "1-basic");
        assert_eq!(summary.deck, "1-basic/my_words");
        assert_eq!(summary.total, 1);
        assert_eq!(summary.learned, 0);
        assert_eq!(summary.topic_name, None, "todavía no le puso nombre");
    }

    #[tokio::test]
    async fn rename_personal_deck_sets_topic_name_and_summary_reflects_it() {
        let card: Flashcard = serde_json::from_value(serde_json::json!({
            "word": "", "translation": "", "example": null,
            "learned": false, "learned_at": null, "name": "table", "definitions": []
        }))
        .unwrap();
        let storage = Arc::new(FakeStorage::seeded(
            "es_en",
            "personal-nouns-user_example_com",
            "1-basic/my_words",
            DeckData::Array(vec![card]),
        ));
        let uc = build_use_cases(
            storage,
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        uc.rename_personal_deck(
            "user@example.com",
            "premium",
            "nouns",
            "1-basic",
            "  Muebles de casa  ",
            "es_en",
        )
        .await
        .expect("el mazo ya existe (tiene 1 palabra), debería poder nombrarse");

        let summaries = uc
            .personal_words_summaries("user@example.com", "nouns", "es_en")
            .await
            .unwrap();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].topic_name.as_deref(), Some("Muebles de casa"), "recortado");
        // Renombrar no debe perder las palabras ya guardadas.
        assert_eq!(summaries[0].total, 1);
    }

    #[tokio::test]
    async fn rename_personal_deck_fails_when_the_deck_does_not_exist_yet() {
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        let err = uc
            .rename_personal_deck("user@example.com", "premium", "nouns", "1-basic", "Casa", "es_en")
            .await
            .expect_err("no se puede nombrar un mazo que todavía no tiene ninguna palabra");
        assert!(err.to_string().contains("todavía no existe"));
    }

    #[tokio::test]
    async fn rename_personal_deck_rejects_non_premium_role() {
        let card: Flashcard = serde_json::from_value(serde_json::json!({
            "word": "", "translation": "", "example": null,
            "learned": false, "learned_at": null, "name": "table", "definitions": []
        }))
        .unwrap();
        let storage = Arc::new(FakeStorage::seeded(
            "es_en",
            "personal-nouns-user_example_com",
            "1-basic/my_words",
            DeckData::Array(vec![card]),
        ));
        let uc = build_use_cases(
            storage,
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        let err = uc
            .rename_personal_deck("user@example.com", "viewer", "nouns", "1-basic", "Casa", "es_en")
            .await
            .expect_err("viewer no debería poder nombrar mazos personales");
        assert!(err.to_string().contains("No autorizado"));
    }

    #[tokio::test]
    async fn preview_personal_word_rejects_non_premium_role() {
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );
        let err = uc
            .preview_personal_word("user@example.com", "viewer", "table", "es_en", None, None, &[])
            .await
            .expect_err("viewer no debería poder previsualizar creación");
        assert!(err.to_string().contains("No autorizado"));
    }

    #[tokio::test]
    async fn preview_personal_word_reports_a_brand_new_deck() {
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );
        let previews = uc
            .preview_personal_word("user@example.com", "premium", "table", "es_en", None, None, &[])
            .await
            .unwrap();
        assert_eq!(previews.len(), 1, "FakeAiTutor sin 'extra' devuelve un solo candidato");
        let preview = &previews[0];
        assert!(!preview.duplicate);
        assert_eq!(preview.category, "nouns");
        assert_eq!(preview.level, "1-basic");
        assert_eq!(preview.name, "table");
        assert!(preview.is_new_deck);
        assert_eq!(preview.existing_topic_name, None);
    }

    #[tokio::test]
    async fn preview_personal_word_reports_the_existing_deck_and_its_name() {
        let card: Flashcard = serde_json::from_value(serde_json::json!({
            "word": "", "translation": "", "example": null,
            "learned": false, "learned_at": null, "name": "chair", "definitions": []
        }))
        .unwrap();
        let named_deck = DeckData::Object {
            flashcards: vec![card],
            extra: serde_json::json!({ "topic_name": "Muebles de casa" }),
        };
        let storage = Arc::new(FakeStorage::seeded(
            "es_en",
            "personal-nouns-user_example_com",
            "1-basic/my_words",
            named_deck,
        ));
        let uc = build_use_cases(
            storage,
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        let previews = uc
            .preview_personal_word("user@example.com", "premium", "table", "es_en", None, None, &[])
            .await
            .unwrap();
        let preview = &previews[0];
        assert!(!preview.duplicate, "'table' != 'chair'");
        assert!(!preview.is_new_deck, "el mazo ya existía");
        assert_eq!(preview.existing_topic_name.as_deref(), Some("Muebles de casa"));
    }

    #[tokio::test]
    async fn preview_personal_word_detects_duplicate_without_creating_anything() {
        let card: Flashcard = serde_json::from_value(serde_json::json!({
            "word": "", "translation": "", "example": null,
            "learned": false, "learned_at": null, "name": "Table", "definitions": []
        }))
        .unwrap();
        let storage = Arc::new(FakeStorage::seeded(
            "es_en",
            "personal-nouns-user_example_com",
            "1-basic/my_words",
            DeckData::Array(vec![card]),
        ));
        let uc = build_use_cases(
            storage,
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        let previews = uc
            .preview_personal_word("user@example.com", "premium", "table", "es_en", None, None, &[])
            .await
            .unwrap();
        let preview = &previews[0];
        assert!(preview.duplicate);
        assert!(!preview.is_new_deck);
    }

    #[tokio::test]
    async fn preview_personal_word_never_touches_storage() {
        // FakeStorage no implementa save_deck_data_for_direction con éxito silencioso — si
        // `preview_personal_word` llegara a guardar algo, este test lo detectaría porque el mazo
        // seguiría "no existiendo" después: no hay nada que limpiar, la ausencia de escritura es
        // justamente la aserción (el mazo previsualizado nunca aparece en `personal_words_summaries`).
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        uc.preview_personal_word("user@example.com", "premium", "table", "es_en", None, None, &[])
            .await
            .unwrap();

        let summaries = uc
            .personal_words_summaries("user@example.com", "nouns", "es_en")
            .await
            .unwrap();
        assert!(summaries.is_empty(), "preview no debe crear ni guardar el mazo");
    }

    #[tokio::test]
    async fn preview_personal_word_returns_one_candidate_per_grammatical_use_when_ambiguous() {
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor {
                category: "verbs",
                level: "2-intermediate",
                name: "appreciate",
                extra: vec![("nouns", "3-advanced", "appreciation")],
            }),
        );

        let previews = uc
            .preview_personal_word("user@example.com", "premium", "appreciate", "es_en", None, None, &[])
            .await
            .unwrap();
        assert_eq!(previews.len(), 2, "la palabra tiene 2 usos gramaticales comunes");
        assert_eq!(previews[0].category, "verbs");
        assert_eq!(previews[0].level, "2-intermediate");
        assert_eq!(previews[1].category, "nouns");
        assert_eq!(previews[1].level, "3-advanced");
    }

    #[tokio::test]
    async fn preview_personal_word_with_override_forces_exactly_one_clamped_candidate() {
        // Aunque `FakeAiTutor` tiene un segundo uso configurado, con overrides Gemini (simulado)
        // devuelve UNO solo, clampeado a lo pedido — igual que `GeminiGrpcProvider`.
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor {
                category: "verbs",
                level: "2-intermediate",
                name: "appreciate",
                extra: vec![("nouns", "3-advanced", "appreciation")],
            }),
        );

        let previews = uc
            .preview_personal_word(
                "user@example.com",
                "premium",
                "appreciate",
                "es_en",
                Some("adjectives"),
                Some("1-basic"),
                &[],
            )
            .await
            .unwrap();
        assert_eq!(previews.len(), 1);
        assert_eq!(previews[0].category, "adjectives");
        assert_eq!(previews[0].level, "1-basic");
    }

    // Regresión ("vos debés recomendarlo y colocar esa recomendación como primera opción"): "crear
    // otra palabra para uno de mis mazos ya existentes" debe resolverse en UNA sola llamada a
    // Gemini — pasando la lista COMPLETA de mazos existentes en el mismo preview libre — en vez de
    // clasificar sin lista y volver a preguntar con overrides cuando el mazo elegido no calzó.
    #[tokio::test]
    async fn preview_personal_word_recommends_an_existing_topic_when_the_free_category_matches() {
        // FakeAiTutor clasificaría "linger" libremente como verbs/2-intermediate — la lista trae un
        // mazo verbs/1-basic ya existente y, como la categoría SÍ coincide, se recomienda ese nivel
        // en la misma llamada.
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "verbs", level: "2-intermediate", name: "linger", extra: vec![] }),
        );

        let existing = vec![ExistingPersonalTopic {
            category: "verbs".to_string(),
            level: "1-basic".to_string(),
            topic_name: None,
        }];
        let previews = uc
            .preview_personal_word(
                "user@example.com",
                "premium",
                "linger",
                "es_en",
                None,
                None,
                &existing,
            )
            .await
            .unwrap();
        assert_eq!(previews.len(), 1);
        assert_eq!(previews[0].category, "verbs");
        assert_eq!(previews[0].level, "1-basic", "debe recomendar el mazo existente en la MISMA llamada");
    }

    #[tokio::test]
    async fn preview_personal_word_ignores_existing_topics_of_a_different_category() {
        // La lista solo recomienda dentro de la MISMA categoría — si la clasificación libre de la
        // palabra cae en otra categoría, un mazo existente de "verbs" no debe forzar nada ahí.
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "2-intermediate", name: "chair", extra: vec![] }),
        );

        let existing = vec![ExistingPersonalTopic {
            category: "verbs".to_string(),
            level: "1-basic".to_string(),
            topic_name: None,
        }];
        let previews = uc
            .preview_personal_word(
                "user@example.com",
                "premium",
                "chair",
                "es_en",
                None,
                None,
                &existing,
            )
            .await
            .unwrap();
        assert_eq!(previews[0].category, "nouns");
        assert_eq!(previews[0].level, "2-intermediate", "un mazo de otra categoría no debe aplicar");
    }

    #[tokio::test]
    async fn preview_personal_word_ignores_existing_topics_when_overrides_are_also_present() {
        // Si el usuario ya editó la fila a mano (overrides), esos mandan por completo — la
        // recomendación entre mazos existentes ya no aplica (`preview_personal_word` la anula
        // antes de llamar a `classify_and_load`).
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "verbs", level: "2-intermediate", name: "linger", extra: vec![] }),
        );

        let existing = vec![ExistingPersonalTopic {
            category: "verbs".to_string(),
            level: "1-basic".to_string(),
            topic_name: None,
        }];
        let previews = uc
            .preview_personal_word(
                "user@example.com",
                "premium",
                "linger",
                "es_en",
                Some("verbs"),
                Some("3-advanced"),
                &existing,
            )
            .await
            .unwrap();
        assert_eq!(previews[0].level, "3-advanced", "el override manda, no la recomendación");
    }

    #[tokio::test]
    async fn preview_personal_word_rejects_override_with_only_one_of_the_two_fields() {
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        let err = uc
            .preview_personal_word(
                "user@example.com",
                "premium",
                "table",
                "es_en",
                Some("verbs"),
                None,
                &[],
            )
            .await
            .expect_err("category_override sin level_override debería rechazarse");
        assert!(err.to_string().contains("deben venir juntos"));
    }

    #[tokio::test]
    async fn preview_personal_word_rejects_an_unknown_override_category() {
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        let err = uc
            .preview_personal_word(
                "user@example.com",
                "premium",
                "table",
                "es_en",
                Some("not-a-real-category"),
                Some("1-basic"),
                &[],
            )
            .await
            .expect_err("categoría desconocida debería rechazarse");
        assert!(err.to_string().contains("Categoría inválida"));
    }

    #[tokio::test]
    async fn create_personal_word_rejects_an_invalid_override_pair_before_calling_ai() {
        // Mismo gate de `validate_overrides` que usa `preview_personal_word` — se ejercita acá
        // desde `create_personal_word` para confirmar que también lo aplica antes de clasificar.
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor { category: "nouns", level: "1-basic", name: "table", extra: vec![] }),
        );

        let err = uc
            .create_personal_word(
                "user@example.com",
                "premium",
                "table",
                "es_en",
                Some("nouns"),
                Some("not-a-real-level"),
            )
            .await
            .expect_err("nivel desconocido debería rechazarse");
        assert!(err.to_string().contains("Nivel inválido"));
    }

    #[tokio::test]
    async fn classify_and_load_with_override_resolves_the_requested_category_and_level() {
        // `create_personal_word` reusa exactamente esta resolución antes de generar imagen/audio —
        // se ejercita acá directamente (mismo módulo, `classify_and_load` es privado) para no
        // depender de fakes de imagen/audio funcionales, que este archivo no modela (el resto de
        // los tests de creación se detienen en el camino de duplicado, ANTES de la generación real).
        let uc = build_use_cases(
            Arc::new(FakeStorage::empty()),
            Arc::new(FakeAiTutor {
                category: "verbs",
                level: "2-intermediate",
                name: "appreciate",
                extra: vec![("nouns", "3-advanced", "appreciation")],
            }),
        );

        let classified = uc
            .classify_and_load(
                "user@example.com",
                "appreciate",
                "es_en",
                Some("nouns"),
                Some("3-advanced"),
                &[],
            )
            .await
            .unwrap();
        assert_eq!(classified.len(), 1, "con overrides siempre 1 candidato, no 2");
        let c = &classified[0];
        assert_eq!(c.category, "nouns");
        assert_eq!(c.level, "3-advanced");
        assert_eq!(c.deck_name, "3-advanced/my_words");
        assert_eq!(c.personal_category, "personal-nouns-user_example_com");
        assert!(c.is_new_deck);
    }
}
