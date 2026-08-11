use crate::{image_use_cases::ImageGenRequest, safe_deck_media_path};
use fluency_core::domain::models::flashcard::Flashcard;
use std::collections::HashSet;
use std::io::{stdout, Write};

use super::context::BatchFilter;

const CANONICAL_EXT: &str = ".avif";
const LEGACY_EXTENSIONS: &[&str] = &[".jpg", ".jpeg", ".png", ".webp"];

pub async fn run_batch_image_generation(
    ctx: super::context::ImageBatchContext,
    filter: BatchFilter,
) -> anyhow::Result<()> {
    run_batch(ctx, BatchMode::GenerateAndLink, filter).await
}

pub async fn run_batch_image_linking(
    ctx: super::context::ImageBatchContext,
    filter: BatchFilter,
) -> anyhow::Result<()> {
    run_batch(ctx, BatchMode::LinkOnly, filter).await
}

#[derive(Clone, Copy)]
enum BatchMode {
    GenerateAndLink,
    LinkOnly,
}

/// v1 = definitions[]; v2/v3 = irregular.past|participle.definitions[] (solo si existen).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FormVariant {
    V1,
    V2,
    V3,
}

impl FormVariant {
    fn form_arg(self) -> Option<&'static str> {
        match self {
            FormVariant::V1 => None,
            FormVariant::V2 => Some("v2"),
            FormVariant::V3 => Some("v3"),
        }
    }

    fn suffix(self) -> &'static str {
        match self {
            FormVariant::V1 => "",
            FormVariant::V2 => "_v2",
            FormVariant::V3 => "_v3",
        }
    }

    fn label(self) -> &'static str {
        match self {
            FormVariant::V1 => "v1",
            FormVariant::V2 => "v2",
            FormVariant::V3 => "v3",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct DefSlot {
    form: FormVariant,
    def_index: usize,
}

async fn run_batch(
    ctx: super::context::ImageBatchContext,
    mode: BatchMode,
    filter: BatchFilter,
) -> anyhow::Result<()> {
    let title = match mode {
        BatchMode::GenerateAndLink => "GENERACIÓN MASIVA + ENLACE JSON",
        BatchMode::LinkOnly => "ENLACE MASIVO DE IMÁGENES EXISTENTES",
    };

    println!("\n========================================================");
    println!("🚀 INICIANDO {title} (RUST MODE)");
    if let Some(ref cat) = filter.category {
        print!("   Filtro categoría: {cat}");
        if let Some(ref deck) = filter.deck {
            println!(" / deck: {deck}");
        } else {
            println!(" / todos los decks");
        }
    } else {
        println!("   Sin filtro: procesará TODAS las categorías");
    }
    println!("========================================================\n");
    let _ = stdout().flush();

    let course_dir = crate::normalize_course_direction(Some(&filter.course_direction));
    let mut categories = ctx.deck.list_categories(course_dir).await?;
    if let Some(ref cat) = filter.category {
        categories.retain(|c| c == cat);
        if categories.is_empty() {
            println!("❌ Categoría no encontrada: {cat}");
            return Ok(());
        }
    }
    println!(
        "🔍 Categorías a procesar: {} → {:?}",
        categories.len(),
        categories
    );
    let _ = stdout().flush();

    let images_prefix = &ctx.settings.gcs_images_prefix;
    let mut global_counter = 0;
    let mut stats = BatchStats::default();

    for cat_name in categories {
        println!("\n📂 CATEGORÍA: {cat_name}");
        let _ = stdout().flush();

        let mut decks = ctx
            .deck
            .list_decks(&cat_name, course_dir)
            .await?;
        if let Some(ref deck) = filter.deck {
            let deck_file = if deck.ends_with(".json") {
                deck.clone()
            } else {
                format!("{deck}.json")
            };
            decks.retain(|d| {
                d == deck
                    || d == &deck_file
                    || d.ends_with(&format!("/{deck_file}"))
                    || d.starts_with(&format!("{deck}/"))
            });
            if decks.is_empty() {
                println!("  ❌ Deck no encontrado: {deck}");
                continue;
            }
        }

        for deck_name in decks {
            let (deck_media_dir, deck_file_prefix) = safe_deck_media_path(&deck_name)?;
            println!("  📦 Mazo: {deck_name}");
            let _ = stdout().flush();

            let mut deck_data = ctx
                .deck
                .get_deck_json(&cat_name, &deck_name, course_dir)
                .await?;
            let card_count = deck_data.flashcards().len();

            // Las imágenes generadas por lote son globales y compartidas por
            // todos los catálogos; solo el JSON conserva dirección de idioma.
            let img_dir = format!("{images_prefix}/{cat_name}/{deck_media_dir}");
            let deck_files = ctx.deck.list_files_in_dir(&img_dir).await?;
            let file_index: HashSet<String> = deck_files.into_iter().collect();
            println!(
                "  🖼️  Índice de imágenes: {} archivos en {img_dir}",
                file_index.len()
            );
            println!("  🏷️  Procesando {card_count} tarjetas...");
            let _ = stdout().flush();

            let mut deck_dirty = false;
            let mut pending_links: Vec<(usize, DefSlot, String)> = Vec::new();
            let mut clear_paths: Vec<(usize, DefSlot)> = Vec::new();

            for i in 0..card_count {
                let card = &deck_data.flashcards()[i];
                let card_name = card_display_name(card);
                let slots = collect_def_slots(card);

                for slot in slots {
                    global_counter += 1;

                    let (meaning, usage_example, usage_context, alternative_example, prompt_val) =
                        extract_definition_fields(card, slot.def_index, slot.form);

                    let form_suffix = slot.form.suffix();
                    let base_pattern = format!(
                        "{}/{}/{}_card_{}_def{}{}",
                        cat_name, deck_media_dir, deck_file_prefix, i, slot.def_index, form_suffix
                    );
                    let filename = format!(
                        "{deck_file_prefix}_card_{i}_def{}{form_suffix}.avif",
                        slot.def_index
                    );

                    print!(
                        "    [{global_counter}] [{}/{}] \"{card_name}\" ({}) > {filename} ",
                        i + 1,
                        card_count,
                        slot.form.label()
                    );
                    let _ = stdout().flush();

                    let proxy_path = if matches!(mode, BatchMode::LinkOnly) {
                        match lookup_image_in_index(&file_index, &base_pattern) {
                            Some(path) => {
                                println!("... ⏭️  EXISTE");
                                stats.skipped += 1;
                                stats.linked += 1;
                                Some(path)
                            }
                            None => {
                                println!("... ⚠️  SIN IMAGEN");
                                stats.missing += 1;
                                None
                            }
                        }
                    } else {
                        match lookup_image_in_index(&file_index, &base_pattern) {
                            Some(path) => {
                                println!("... ⏭️  EXISTE");
                                stats.skipped += 1;
                                Some(path)
                            }
                            None => {
                                let legacy_image_path =
                                    get_definition_image_path(card, slot.def_index, slot.form);
                                let had_legacy_image_path = legacy_image_path.is_some();
                                if had_legacy_image_path {
                                    println!("... 🔧 JSON legacy; reubicando o generando...");
                                } else {
                                    print!("... 🤖 Generando con IA... ");
                                    let _ = stdout().flush();
                                }
                                let req = ImageGenRequest {
                                    category: cat_name.clone(),
                                    deck: deck_name.clone(),
                                    index: i,
                                    def_index: slot.def_index,
                                    course_direction: Some(course_dir.to_string()),
                                    prompt: prompt_val,
                                    meaning,
                                    usage_example,
                                    usage_context,
                                    alternative_example,
                                    force_generation: false,
                                    form: slot.form.form_arg().map(str::to_string),
                                    legacy_image_path,
                                    prompt_engine: None,
                                    scene_complement: None,
                                };

                                match ctx
                                    .image
                                    .get_or_generate_image(&req, "batch", "admin")
                                    .await
                                {
                                    Ok((url, is_new)) => {
                                        if is_new {
                                            println!("... ✨ GENERADA!");
                                            stats.generated += 1;
                                            tokio::time::sleep(tokio::time::Duration::from_secs(1))
                                                .await;
                                        } else {
                                            println!("... ⏭️  YA EXISTÍA");
                                            stats.skipped += 1;
                                        }
                                        Some(normalize_to_canonical_path(&url))
                                    }
                                    Err(e) => {
                                        println!("... ❌ ERROR: {e} (grep trace_id en log con RUST_LOG=info)");
                                        stats.errors += 1;
                                        if had_legacy_image_path {
                                            clear_paths.push((i, slot));
                                        }
                                        None
                                    }
                                }
                            }
                        }
                    };

                    if let Some(path) = proxy_path {
                        pending_links.push((i, slot, path));
                    }
                }
            }

            let cards = deck_data.flashcards_mut();
            for (i, slot) in clear_paths {
                if clear_definition_image_path(&mut cards[i], slot.def_index, slot.form) {
                    deck_dirty = true;
                    println!(
                        "    🧹 Limpiado imagePath huérfano: \"{}\" {}",
                        card_display_name(&cards[i]),
                        slot_label(slot)
                    );
                }
            }
            for (i, slot, path) in pending_links {
                let card_name = card_display_name(&cards[i]);
                if set_definition_image_path(&mut cards[i], slot.def_index, &path, slot.form) {
                    deck_dirty = true;
                    stats.json_updates += 1;
                    println!("    ✅ JSON: \"{card_name}\" {} → {path}", slot_label(slot));
                } else {
                    stats.already_linked += 1;
                    println!("    ✓  Ya enlazado: \"{card_name}\" {}", slot_label(slot));
                }
            }

            if deck_dirty {
                match ctx
                    .deck
                    .save_deck_json(&cat_name, &deck_name, &deck_data, course_dir)
                    .await
                {
                    Ok(()) => {
                        println!("  💾 JSON guardado y subido: {cat_name}/{deck_name}");
                        stats.decks_saved += 1;
                    }
                    Err(e) => println!("  ❌ Error guardando JSON {cat_name}/{deck_name}: {e}"),
                }
            } else {
                println!("  ✨ JSON sin cambios: {cat_name}/{deck_name}");
            }
            let _ = stdout().flush();
        }
    }

    println!("\n========================================================");
    println!("✨ ¡PROCESO COMPLETADO! (entradas: {global_counter})");
    println!("   Generadas:       {}", stats.generated);
    println!("   Imágenes OK:     {}", stats.skipped);
    println!("   JSON actualizado:{}", stats.json_updates);
    println!("   Ya enlazadas:    {}", stats.already_linked);
    println!("   Sin imagen:      {}", stats.missing);
    println!("   Errores:         {}", stats.errors);
    println!("   Decks guardados: {}", stats.decks_saved);
    println!("========================================================\n");

    // ComfyUI se deja corriendo: matarlo al terminar impedía encadenar mazos
    // (p. ej. adjectives → nouns) y fallaba la generación de huérfanos restantes.

    Ok(())
}

#[derive(Default)]
struct BatchStats {
    generated: usize,
    skipped: usize,
    linked: usize,
    json_updates: usize,
    already_linked: usize,
    missing: usize,
    errors: usize,
    decks_saved: usize,
}

fn card_display_name(card: &Flashcard) -> String {
    card.extra
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            if card.word.is_empty() {
                "?".to_string()
            } else {
                card.word.clone()
            }
        })
}

fn slot_label(slot: DefSlot) -> String {
    format!("{} def{}", slot.form.label(), slot.def_index)
}

/// v1 siempre; v2/v3 solo si irregular.{past|participle}.definitions[] existe o si tiene usage_example plano.
fn collect_def_slots(card: &Flashcard) -> Vec<DefSlot> {
    let mut slots = Vec::new();

    let v1_count = card
        .extra
        .get("definitions")
        .and_then(|v| v.as_array())
        .map(|arr| arr.len())
        .unwrap_or(1);
    for def_index in 0..v1_count {
        slots.push(DefSlot {
            form: FormVariant::V1,
            def_index,
        });
    }

    for (form, irregular_key) in [(FormVariant::V2, "past"), (FormVariant::V3, "participle")] {
        if let Some(block) = card
            .extra
            .get("irregular")
            .and_then(|v| v.get(irregular_key))
        {
            if let Some(arr) = block.get("definitions").and_then(|v| v.as_array()) {
                if !arr.is_empty() {
                    for def_index in 0..arr.len() {
                        slots.push(DefSlot { form, def_index });
                    }
                }
            } else if block
                .get("usage_example")
                .and_then(|v| v.as_str())
                .is_some()
            {
                slots.push(DefSlot { form, def_index: 0 });
            }
        }
    }

    slots
}

fn get_definition_object<'a>(
    extra: &'a serde_json::Value,
    def_index: usize,
    form: FormVariant,
) -> Option<&'a serde_json::Value> {
    match form {
        FormVariant::V1 => extra
            .get("definitions")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.get(def_index)),
        FormVariant::V2 | FormVariant::V3 => {
            let key = if form == FormVariant::V2 {
                "past"
            } else {
                "participle"
            };
            let block = extra.get("irregular").and_then(|v| v.get(key))?;
            if let Some(arr) = block.get("definitions").and_then(|v| v.as_array()) {
                arr.get(def_index)
            } else if def_index == 0 && block.get("usage_example").is_some() {
                Some(block)
            } else {
                None
            }
        }
    }
}

fn get_definition_object_mut<'a>(
    extra: &'a mut serde_json::Value,
    def_index: usize,
    form: FormVariant,
) -> Option<&'a mut serde_json::Map<String, serde_json::Value>> {
    match form {
        FormVariant::V1 => extra
            .get_mut("definitions")
            .and_then(|v| v.as_array_mut())
            .and_then(|arr| arr.get_mut(def_index))
            .and_then(|v| v.as_object_mut()),
        FormVariant::V2 | FormVariant::V3 => {
            let key = if form == FormVariant::V2 {
                "past"
            } else {
                "participle"
            };
            let block = extra
                .as_object_mut()?
                .get_mut("irregular")?
                .as_object_mut()?
                .get_mut(key)?;

            if block.get("definitions").is_some() {
                block
                    .as_object_mut()?
                    .get_mut("definitions")?
                    .as_array_mut()?
                    .get_mut(def_index)?
                    .as_object_mut()
            } else if def_index == 0 && block.get("usage_example").is_some() {
                block.as_object_mut()
            } else {
                None
            }
        }
    }
}

/// Busca en el índice precargado (sin red por tarjeta).
fn lookup_image_in_index(file_index: &HashSet<String>, base_pattern: &str) -> Option<String> {
    let deck_prefix = base_pattern.rsplit('/').next().unwrap_or(base_pattern);
    let avif_name = format!("{deck_prefix}{CANONICAL_EXT}");
    if file_index.contains(&avif_name) {
        return Some(format!("/card_images/{base_pattern}{CANONICAL_EXT}"));
    }
    for ext in LEGACY_EXTENSIONS {
        let legacy_name = format!("{deck_prefix}{ext}");
        if file_index.contains(&legacy_name) {
            return Some(format!("/card_images/{base_pattern}{ext}"));
        }
    }
    None
}

fn extract_definition_fields(
    card: &Flashcard,
    def_index: usize,
    form: FormVariant,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
) {
    let mut meaning = None;
    let mut usage_example = None;
    let mut usage_context = None;
    let mut alternative_example = None;

    if let Some(def_obj) = get_definition_object(&card.extra, def_index, form) {
        meaning = def_obj
            .get("meaning")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        usage_example = def_obj
            .get("usage_example")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        usage_context = def_obj
            .get("usage_context_en")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        alternative_example = def_obj
            .get("alternative_example")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
    }

    if meaning.is_none() && !card.translation.is_empty() {
        meaning = Some(card.translation.clone());
    }
    if usage_example.is_none() {
        usage_example = card.example.clone();
    }

    let fallback = card_display_name(card);
    let prompt_val = usage_example.clone().unwrap_or(fallback);

    (
        meaning,
        usage_example,
        usage_context,
        alternative_example,
        prompt_val,
    )
}

fn normalize_to_canonical_path(url: &str) -> String {
    let path = strip_cache_bust(url);
    if path.ends_with(CANONICAL_EXT) {
        return path;
    }
    if let Some(dot) = path.rfind('.') {
        return format!("{}{CANONICAL_EXT}", &path[..dot]);
    }
    format!("{path}{CANONICAL_EXT}")
}

fn get_definition_image_path(
    card: &Flashcard,
    def_index: usize,
    form: FormVariant,
) -> Option<String> {
    get_definition_object(&card.extra, def_index, form)
        .and_then(|d| d.get("imagePath"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn clear_definition_image_path(card: &mut Flashcard, def_index: usize, form: FormVariant) -> bool {
    let Some(def) = get_definition_object_mut(&mut card.extra, def_index, form) else {
        return false;
    };
    def.remove("imagePath").is_some()
}

fn set_definition_image_path(
    card: &mut Flashcard,
    def_index: usize,
    image_path: &str,
    form: FormVariant,
) -> bool {
    let Some(def) = get_definition_object_mut(&mut card.extra, def_index, form) else {
        return false;
    };

    let current = def.get("imagePath").and_then(|v| v.as_str()).unwrap_or("");

    if current == image_path {
        return false;
    }

    def.insert(
        "imagePath".to_string(),
        serde_json::Value::String(image_path.to_string()),
    );
    true
}

fn strip_cache_bust(url: &str) -> String {
    url.split('?').next().unwrap_or(url).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_card() -> Flashcard {
        Flashcard {
            word: String::new(),
            translation: String::new(),
            example: None,
            learned: false,
            learned_at: None,
            extra: json!({
                "name": "be",
                "definitions": [
                    {"meaning": "Ser", "usage_example": "I am happy."},
                    {"meaning": "Estar", "usage_example": "I am here."}
                ],
                "irregular": {
                    "past": {
                        "definitions": [
                            {"meaning": "Pasado Ser", "usage_example": "I was a student."},
                            {"meaning": "Pasado Estar", "usage_example": "We were at the beach."}
                        ]
                    },
                    "participle": {
                        "definitions": [
                            {"meaning": "Participio Ser", "usage_example": "She has been a doctor."}
                        ]
                    }
                }
            }),
        }
    }

    fn sample_card_flat() -> Flashcard {
        Flashcard {
            word: String::new(),
            translation: String::new(),
            example: None,
            learned: false,
            learned_at: None,
            extra: json!({
                "name": "say",
                "definitions": [{"meaning": "decir", "usage_example": "She says hello."}],
                "irregular": {
                    "past": {"usage_example": "She said hi.", "meaning": "Pasado"},
                    "participle": {"usage_example": "It is said.", "meaning": "Participio"}
                }
            }),
        }
    }

    #[test]
    fn collect_def_slots_includes_v1_v2_v3_when_applicable() {
        let slots = collect_def_slots(&sample_card());
        assert_eq!(slots.len(), 5);
        assert_eq!(
            slots[0],
            DefSlot {
                form: FormVariant::V1,
                def_index: 0
            }
        );
        assert_eq!(
            slots[2],
            DefSlot {
                form: FormVariant::V2,
                def_index: 0
            }
        );
        assert_eq!(
            slots[4],
            DefSlot {
                form: FormVariant::V3,
                def_index: 0
            }
        );
    }

    #[test]
    fn collect_def_slots_includes_irregular_without_definitions_array() {
        let slots = collect_def_slots(&sample_card_flat());
        assert_eq!(slots.len(), 3);
        assert_eq!(
            slots[0],
            DefSlot {
                form: FormVariant::V1,
                def_index: 0
            }
        );
        assert_eq!(
            slots[1],
            DefSlot {
                form: FormVariant::V2,
                def_index: 0
            }
        );
        assert_eq!(
            slots[2],
            DefSlot {
                form: FormVariant::V3,
                def_index: 0
            }
        );
    }

    #[test]
    fn set_and_get_image_path_for_v2() {
        let mut card = sample_card();
        let path = "/card_images/verbs/1-basic/1-basic_card_0_def1_v2.avif";
        assert!(set_definition_image_path(
            &mut card,
            1,
            path,
            FormVariant::V2
        ));
        assert_eq!(
            get_definition_image_path(&card, 1, FormVariant::V2).as_deref(),
            Some(path)
        );
    }

    #[test]
    fn set_and_get_image_path_for_v2_flat() {
        let mut card = sample_card_flat();
        let path = "/card_images/verbs/1-basic/1-basic_card_0_def0_v2.avif";
        assert!(set_definition_image_path(
            &mut card,
            0,
            path,
            FormVariant::V2
        ));
        assert_eq!(
            get_definition_image_path(&card, 0, FormVariant::V2).as_deref(),
            Some(path)
        );
    }
}
