use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct SynthesizeSpeechBody {
    pub category: String,
    pub deck: String,
    pub text: String,
    pub voice_name: String,
    pub verb_name: Option<String>,
    pub tone: Option<String>,
    pub lang: Option<String>,
    #[serde(default)]
    pub course_direction: Option<String>,
    #[serde(default)]
    pub exclude_voice: Option<String>,
    #[serde(default)]
    pub force_regenerate: Option<bool>,
}

#[derive(Serialize)]
pub struct SynthesizeSpeechResponse {
    pub audio_url: String,
    pub voice_name: String,
    pub from_cache: bool,
}

#[derive(Deserialize)]
pub struct GenerateImageBody {
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub def_index: usize,
    #[serde(default)]
    pub course_direction: Option<String>,
    pub prompt: String,
    pub meaning: Option<String>,
    pub usage_example: Option<String>,
    #[serde(default)]
    pub usage_context: Option<String>,
    #[serde(default)]
    pub alternative_example: Option<String>,
    #[serde(default)]
    pub force_generation: bool,
    #[serde(default)]
    pub form: Option<String>,
    #[serde(default)]
    pub legacy_image_path: Option<String>,
    #[serde(default)]
    pub prompt_engine: Option<String>,
    /// Demo landing: complemento visual opcional (no sustituye usage_example).
    #[serde(default)]
    pub scene_complement: Option<String>,
}

#[derive(Serialize)]
pub struct GenerateImageResponse {
    pub path: String,
}

#[derive(Deserialize)]
pub struct ResolveImageBody {
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub def_index: usize,
    #[serde(default)]
    pub course_direction: Option<String>,
    #[serde(default)]
    pub form: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteAudioBody {
    pub category: String,
    pub deck: String,
    pub text: String,
    pub voice_name: String,
    pub verb_name: Option<String>,
    pub tone: Option<String>,
    pub lang: Option<String>,
    #[serde(default)]
    pub course_direction: Option<String>,
    #[serde(default)]
    pub exclude_voice: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteImageBody {
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub def_index: usize,
    #[serde(default)]
    pub course_direction: Option<String>,
    #[serde(default)]
    pub form: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteDefinitionBody {
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub def_index: usize,
    #[serde(default)]
    pub course_direction: Option<String>,
    #[serde(default)]
    pub form: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_payload_from_frontend_deserializes_with_defaults() {
        let body: SynthesizeSpeechBody = serde_json::from_value(serde_json::json!({
            "category": "landing-demo",
            "deck": "verbs-essentials",
            "text": "to be",
            "voice_name": "",
            "tone": "",
            "verb_name": "be",
            "lang": "en",
            "course_direction": "es_en"
        }))
        .expect("frontend audio payload");

        assert_eq!(body.category, "landing-demo");
        assert_eq!(body.deck, "verbs-essentials");
        assert_eq!(body.text, "to be");
        assert_eq!(body.verb_name.as_deref(), Some("be"));
        assert_eq!(body.course_direction.as_deref(), Some("es_en"));
        assert_eq!(body.force_regenerate, None);
        assert_eq!(body.exclude_voice, None);
    }

    #[test]
    fn synthesized_audio_options_preserve_rotation_contract() {
        let body: SynthesizeSpeechBody = serde_json::from_value(serde_json::json!({
            "category": "landing-demo",
            "deck": "verbs-essentials",
            "text": "to go",
            "voice_name": "",
            "verb_name": "go",
            "tone": "",
            "lang": "en",
            "course_direction": "en_es",
            "exclude_voice": "Rachel",
            "force_regenerate": true
        }))
        .expect("frontend synthesize payload");

        assert_eq!(body.exclude_voice.as_deref(), Some("Rachel"));
        assert_eq!(body.force_regenerate, Some(true));
    }

    #[test]
    fn resolve_image_payload_accepts_base_and_irregular_forms() {
        let base: ResolveImageBody = serde_json::from_value(serde_json::json!({
            "category": "landing-demo",
            "deck": "verbs-essentials",
            "index": 1,
            "def_index": 0,
            "course_direction": "es_en"
        }))
        .expect("base image payload");
        assert_eq!(base.form, None);

        let irregular: ResolveImageBody = serde_json::from_value(serde_json::json!({
            "category": "landing-demo",
            "deck": "verbs-essentials",
            "index": 1,
            "def_index": 1,
            "course_direction": "en_es",
            "form": "v3"
        }))
        .expect("irregular image payload");
        assert_eq!(irregular.form.as_deref(), Some("v3"));
        assert_eq!(irregular.index, 1);
        assert_eq!(irregular.def_index, 1);
    }

    #[test]
    fn generated_image_payload_defaults_optional_controls() {
        let body: GenerateImageBody = serde_json::from_value(serde_json::json!({
            "category": "landing-demo",
            "deck": "verbs-essentials",
            "index": 2,
            "def_index": 0,
            "prompt": "A clear learning scene",
            "meaning": "escena",
            "usage_example": "This is a scene"
        }))
        .expect("minimal generated image payload");

        assert!(!body.force_generation);
        assert_eq!(body.form, None);
        assert_eq!(body.scene_complement, None);
        assert_eq!(body.prompt_engine, None);
    }

    #[test]
    fn required_frontend_fields_cannot_be_omitted_or_have_wrong_types() {
        assert!(
            serde_json::from_value::<SynthesizeSpeechBody>(serde_json::json!({
                "category": "landing-demo",
                "deck": "verbs-essentials"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<ResolveImageBody>(serde_json::json!({
                "category": "landing-demo",
                "deck": "verbs-essentials",
                "index": "one",
                "def_index": 0
            }))
            .is_err()
        );
    }

    #[test]
    fn media_success_responses_match_what_frontend_adapters_require() {
        let audio = serde_json::to_value(SynthesizeSpeechResponse {
            audio_url: "/card_audio/landing-demo/example.mp3?v=1".to_string(),
            voice_name: "Rachel".to_string(),
            from_cache: true,
        })
        .expect("serializable audio response");
        assert_eq!(
            audio,
            serde_json::json!({
                "audio_url": "/card_audio/landing-demo/example.mp3?v=1",
                "voice_name": "Rachel",
                "from_cache": true
            })
        );

        let image = serde_json::to_value(GenerateImageResponse {
            path: "/card_images/landing-demo/example.avif?v=1".to_string(),
        })
        .expect("serializable image response");
        assert_eq!(
            image,
            serde_json::json!({
                "path": "/card_images/landing-demo/example.avif?v=1"
            })
        );
    }
}
