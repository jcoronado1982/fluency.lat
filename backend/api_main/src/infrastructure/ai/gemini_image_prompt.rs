//! Construcción del system prompt de generación de imágenes, especializado por categoría.
//!
//! Antes existía un único prompt de ~90 líneas que toda card leía completo: una card de
//! sustantivo atravesaba las reglas de fases verbales, pronombres, preposiciones y días de la
//! semana antes de llegar a la suya. Eso diluye la atención del modelo y sesga la escena hacia
//! la acción cuando el protagonista debería ser el objeto.
//!
//! El prompt se arma ahora en tres piezas: `HEADER` (rol, input, lienzo, objetivo) +
//! el bloque de UNA sola categoría + `CRAFT` (realismo fotográfico, luz, encuadre, salida).
//! Cada card ve solo las reglas de su categoría, y las reglas de oficio viven en un único lugar.
//!
//! Contexto del problema que originó la especialización: `docs/prompt-temporal-precision.md`.

/// Categorías reales del catálogo (`WORD_CARD_CATEGORIES` en `gemini_word_card_prompt.rs`),
/// colapsadas a los ejes visuales que de verdad cambian la estrategia de imagen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptCategory {
    /// Verbos y phrasal verbs: el eje es la FASE del movimiento.
    Verbs,
    /// Sustantivos: el eje es la IDENTIDAD del objeto (o la situación, si es abstracto).
    Nouns,
    /// Adjetivos: el eje es el GRADO o la CUALIDAD.
    Adjectives,
    /// Adverbios: el eje es la MANERA de la acción.
    Adverbs,
    /// Preposiciones: el eje es la RELACIÓN ESPACIAL.
    Prepositions,
    /// Pronombres y determinantes: el eje es QUIÉN posee o recibe.
    Pronouns,
    /// Conectores: el eje es la RELACIÓN LÓGICA entre dos hechos visibles.
    Connectors,
    /// Categoría desconocida: se cae al bloque genérico.
    Generic,
}

impl PromptCategory {
    /// Detecta la categoría a partir del segmento de storage que llega al provider.
    ///
    /// El valor real puede venir como `verbs`, pero también como namespace de mazo personal
    /// (`personal-verbs-email_coronado_gmail_com`) o de demo del landing, así que se compara por
    /// contenido y no por igualdad exacta.
    ///
    /// El ORDEN de las ramas es la parte delicada, porque varias categorías son subcadenas de
    /// otras: `adverbs` contiene `verb` y `pronouns` contiene `noun`. Las más específicas van
    /// primero; mover una rama hacia abajo rompe la detección en silencio.
    pub fn detect(pos_category: &str) -> Self {
        let c = pos_category.to_ascii_lowercase();
        if c.contains("adverb") {
            Self::Adverbs
        } else if c.contains("adjective") {
            Self::Adjectives
        } else if c.contains("phrasal") || c.contains("verb") {
            Self::Verbs
        } else if c.contains("preposition") {
            Self::Prepositions
        } else if c.contains("pronoun") || c.contains("determinant") {
            Self::Pronouns
        } else if c.contains("connector") {
            Self::Connectors
        } else if c.contains("noun") {
            Self::Nouns
        } else {
            Self::Generic
        }
    }

    /// Campos extra del checklist que solo tienen sentido para esta categoría.
    fn checklist_fields(self) -> &'static str {
        match self {
            Self::Verbs => {
                r#"  "ACTION_PHASE": "exactly one of INTERNAL_STATE_CHANGE | PHYSICAL_TRANSITION | ONGOING_STATE | COMPLETED_RESULT",
  "RIVAL_WORD": "the verb most easily confused with this one because it shares the same setting and props (wake up -> get up; put on -> wear; sit down -> sit; pick up -> hold; turn on -> use). Write NONE only if no such verb exists",
  "CONTRASTIVE_EVIDENCE": "the exact body position, eye state and hand placement that is TRUE for the target verb and FALSE for RIVAL_WORD. If RIVAL_WORD is NONE, still state the exact body position","#
            }
            Self::Nouns => {
                r#"  "OBJECT_OR_SITUATION": "for a concrete noun, the physical object itself; for an abstract noun, the everyday situation that embodies it",
  "RIVAL_WORD": "the object or concept most easily mistaken for this one (cup -> mug; chair -> stool; house -> apartment; job -> work). Write NONE only if no such word exists",
  "CONTRASTIVE_EVIDENCE": "the distinguishing physical features — shape, material, size relative to a hand or body, handle, transparency, texture — that are TRUE for the target and FALSE for RIVAL_WORD","#
            }
            Self::Adjectives => {
                r#"  "QUALITY": "the single quality being taught, and whether it is a degree on a scale (warm/hot) or a discrete property (broken, wet)",
  "RIVAL_WORD": "the adjective one step away on the same scale (warm -> hot; big -> huge; dirty -> messy; sad -> angry). Write NONE only if no such word exists",
  "CONTRASTIVE_EVIDENCE": "the physical cue that pins the quality at THIS degree and not at RIVAL_WORD's: how the subject's body, the object's surface, or the surroundings visibly react to it","#
            }
            Self::Adverbs => {
                r#"  "HOST_ACTION": "the ordinary action the adverb modifies — keep it simple and instantly readable, because the lesson is the WAY it is done, not the action itself",
  "RIVAL_WORD": "the adverb at the opposite end of the same manner scale (quickly -> slowly; quietly -> loudly; carefully -> carelessly). Write NONE only if no such word exists",
  "CONTRASTIVE_EVIDENCE": "the visible traces of manner in the body and its consequences — motion blur, off-balance stride, spilled liquid, deliberate slow hand placement, others' reactions — that are TRUE for the target adverb and FALSE for RIVAL_WORD","#
            }
            Self::Prepositions => {
                r#"  "FIGURE_AND_GROUND": "which object is placed (figure) and which object it is placed in relation to (ground)",
  "RIVAL_WORD": "the preposition whose arrangement looks most similar (on -> above; in -> inside; behind -> next to). Write NONE only if no such word exists",
  "CONTRASTIVE_EVIDENCE": "the exact geometry that distinguishes them: visible contact versus a clear air gap, full enclosure versus partial, the size and direction of the space between figure and ground","#
            }
            Self::Pronouns => {
                r#"  "OWNER_OR_RECEIVER": "who owns, receives, or is addressed, and how many people are in frame",
  "RIVAL_WORD": "the pronoun that would be read if the people were arranged differently (my -> his; your -> their; our -> my). Write NONE only if no such word exists",
  "CONTRASTIVE_EVIDENCE": "the gaze, hand contact, body orientation and proximity that make THIS person unmistakably the owner or receiver, and make RIVAL_WORD's reading impossible","#
            }
            Self::Connectors => {
                r#"  "FACT_A_AND_FACT_B": "the two concrete, separately visible facts the connector links",
  "LOGICAL_RELATION": "how they are linked: cause, contrast, addition, condition, or time sequence",
  "RIVAL_WORD": "the connector expressing the closest but different relation (because -> so; but -> and; if -> when). Write NONE only if no such word exists",
  "CONTRASTIVE_EVIDENCE": "the visible ordering, physical consequence, or juxtaposition that shows THIS relation between the two facts and not RIVAL_WORD's","#
            }
            Self::Generic => {
                r#"  "RIVAL_WORD": "the single word most easily confused with this one in the same everyday scene. Write NONE only if no such word exists",
  "CONTRASTIVE_EVIDENCE": "the concrete visual fact that is TRUE for the target word and FALSE for RIVAL_WORD","#
            }
        }
    }

    /// Bloque de estrategia visual propio de la categoría.
    fn strategy_block(self) -> &'static str {
        match self {
            Self::Verbs => VERBS_BLOCK,
            Self::Nouns => NOUNS_BLOCK,
            Self::Adjectives => ADJECTIVES_BLOCK,
            Self::Adverbs => ADVERBS_BLOCK,
            Self::Prepositions => PREPOSITIONS_BLOCK,
            Self::Pronouns => PRONOUNS_BLOCK,
            Self::Connectors => CONNECTORS_BLOCK,
            Self::Generic => GENERIC_BLOCK,
        }
    }

    /// Qué debe declarar explícitamente la línea `FINAL:` para que la fase/eje no quede librado
    /// al prior del modelo de imagen.
    fn final_requirements(self) -> &'static str {
        match self {
            Self::Verbs => "the subject's body position, eye state (open, half-open, closed) and hand placement",
            Self::Nouns => "the object's shape, material, size relative to a hand or body, and how it is being used",
            Self::Adjectives => "the physical cue that fixes the quality at this exact degree",
            Self::Adverbs => "the visible traces of manner in the body and its consequences",
            Self::Prepositions => "the exact relative placement, stating clearly whether there is contact or a visible gap",
            Self::Pronouns => "who each visible person is, where they are looking, and whose hands touch the object",
            Self::Connectors => "both linked facts and the visible ordering or consequence between them",
            Self::Generic => "the concrete physical details that carry the meaning",
        }
    }
}

const HEADER: &str = r#"You are a "Real-Life Context" Visual Prompt Engineer for FLUX 2.

INPUT FORMAT (always provided):
WORD/PHRASE: [word]
POS/CATEGORY: [category]
MEANING: [meaning]
CONTEXT_TYPE: [usage context, if present]
SUPPORTING_EXAMPLE: [second example, if present]
EXAMPLE: [example sentence]
OUTPUT MEDIUM: English-learning flashcard image
FINAL CANVAS: 768x512 pixels, 3:2 landscape orientation
COMPOSITION GOAL: immediately understandable at small card size
TEACHING GOAL: the image must explain the target meaning by itself, before the learner reads the sentence"#;

const VERBS_BLOCK: &str = r#"YOUR TARGET IS A VERB OR PHRASAL VERB. The ACTION owns the frame: it must be the first thing the eye lands on. Do not show people merely sitting, posing, or talking unless the verb's meaning is communication itself.

- For phrasal verbs and idioms, identify the core teachable meaning from MEANING and EXAMPLE first, then visualize THAT. Do not illustrate the words literally when the phrase means something else. Supporting objects may appear as evidence, never as the main subject.
- For verbs of appearance or state (seem, appear, be), show the visual evidence that leads to the impression. Do not add random body parts or hidden people.
- TEMPORAL PRECISION: most teaching failures happen when a verb shares its setting and props with a DIFFERENT verb and the body is drawn in the wrong phase of the movement. Resolve ACTION_PHASE first, then obey it literally:
    * INTERNAL_STATE_CHANGE (wake up, realize, notice, remember, understand, hear, feel) -> the body stays in the PRIOR position (still lying on the pillow, still seated, still standing) and does NOT begin the movement that comes next. The change appears ONLY in the face: eye state, eyebrow tension, mouth, gaze direction, breath. Never show the body already risen, already turned, or already reaching.
    * PHYSICAL_TRANSITION (get up, sit down, stand up, lie down, put on, take off, pick up, turn on) -> freeze the body MID-MOVEMENT: weight shifting off balance, one foot planted and the other lifting, a garment half over the arm, fingers closing on the object but not yet lifting it, a fingertip touching the switch. Never the resting state before, never the finished state after.
    * ONGOING_STATE (sleep, sit, stand, wear, hold, live) -> the position is settled and relaxed, with no trace of the transition that produced it: no half-lifted limbs, no garment in mid-air, no reaching hand.
    * COMPLETED_RESULT (arrive, finish, break, spill) -> the movement is over; only its consequence is visible in the object, the body's stillness, or the environment.
- BANNED STOCK POSES — image models default to these, and each one teaches the WRONG verb: sitting upright in bed stretching both arms overhead (that is "get up", never "wake up"); standing fully dressed and settled (that is "wear", never "put on"); already seated at rest (that is "sit", never "sit down"); holding an object at chest height (that is "hold", never "pick up"); merely standing near an appliance (that is "use", never "turn on")."#;

const NOUNS_BLOCK: &str = r#"YOUR TARGET IS A NOUN. The OBJECT owns the frame: it is the visual subject, not the person handling it, and not the activity around it. A person may appear only to give scale or show typical use, never to steal focus.

- Concrete nouns: show the object in natural daily use, angled so its shape, material and size are all legible at once. Show the distinguishing physical features that separate it from its lookalike — a mug's thick handle and opaque stoneware wall versus a glass's transparency.
- Abstract nouns: show one simple everyday situation that EMBODIES the concept, specific enough that a neighbouring concept would not fit the same scene.
- Days of the week and time cycles: NEVER show a person standing in front of a white calendar pointing at a grid cell or writing with a marker. Show the UNIQUE ACTIVITY of that specific day instead:
    * Monday = starting the workweek, morning coffee in a rush, picking up work badges, the commute
    * Wednesday = mid-week energy, a hump-day team meeting, mid-week grocery restock, evening gym
    * Thursday = pre-weekend preparation, happy-hour planning, Thursday night dinner prep, sports practice
    * Friday = the weekend arriving, packing up a bag at the desk, leaving the office early
    * Saturday/Sunday = weekend rest, a park walk, family breakfast, hobbies, casual outdoor activities
- Never let the object end up small, distant or incidental. If it is naturally small, move the camera closer rather than shrinking it into a wider scene."#;

const ADJECTIVES_BLOCK: &str = r#"YOUR TARGET IS AN ADJECTIVE. The QUALITY owns the frame: the learner must read the quality itself, not the object that happens to carry it. Choose the most ordinary object or person for that quality and let the quality dominate.

- Make the degree visible through a physical cue the learner can read WITHOUT knowing the neighbouring adjective: "warm" = steam barely rising, hands relaxed around the mug; "hot" = recoiling fingers, sharp steam, a grimace.
- Show how the quality visibly acts on the world: how a body reacts to it, how a surface looks under it, what it does to the things around it.
- If the quality only exists as a comparison, put the contrast INSIDE the frame — one worn shoe beside one new shoe, a full glass next to an empty one — rather than describing an abstract scale or a split-screen diagram.
- For adjectives describing feelings, the face and posture carry everything: never substitute a symbolic prop for a readable expression."#;

const ADVERBS_BLOCK: &str = r#"YOUR TARGET IS AN ADVERB. The MANNER owns the frame. Pick a host action so ordinary and instantly readable that all the learner's attention lands on HOW it is being done.

- The way must be physically visible, never merely implied. Show speed through motion blur, an off-balance stride, liquid slopping over a rim; care through slow deliberate hand placement, a steadied wrist, a focused gaze; volume through mouth openness and the reactions of people nearby; reluctance through dragging feet and a lowered head.
- Never illustrate the bare action and expect the adverb to be inferred: a person simply walking teaches "walk", not "quickly".
- Consequences in the environment are your strongest tool — a knocked-over cup, a wake of scattered papers, neighbours turning to look — because they show manner even in a frozen frame.
- For adverbs of frequency or time, show the accumulated evidence of repetition (a worn path, a stack of identical receipts) rather than a clock or a calendar."#;

const PREPOSITIONS_BLOCK: &str = r#"YOUR TARGET IS A PREPOSITION. The SPATIAL RELATION owns the frame: the arrangement between two objects IS the entire lesson, and it must be readable in one second.

- Make the geometry unmistakable and unobstructed: "on" = visible contact with the surface; "above" = a clear air gap; "in" = enclosure the eye can verify; "behind" = overlap with depth cues.
- Use a plain, uncluttered background and a camera angle that shows the relation at its clearest — usually a straight side view, never a three-quarter angle that flattens the gap or hides the contact.
- Both figure and ground must be simple, everyday, easily named objects. Complex or unusual objects steal attention from the relation.
- Keep the gap or contact point near the centre of the frame, large and unshadowed. Nothing may overlap or obscure it."#;

const PRONOUNS_BLOCK: &str = r#"YOUR TARGET IS A PRONOUN, POSSESSIVE OR DETERMINER. The word has NO visual meaning on its own, so PEOPLE and their RELATIONSHIP to the object carry the whole lesson. You MUST show people.

- 1st person (my, our) = the owner or owners clearly IN frame, with hands, body position, gaze or proximity establishing ownership.
- 2nd person (you, your) = the addressed person is visibly central, receiving attention, being handed something, or being looked at by another person in frame.
- 3rd person (his, her, their) = the owner observed from outside, with face, clothing, posture and the nearby object making the relationship legible.
- Articles and determiners: show specificity (the, this) versus generality (a, any) through a selecting gesture — a hand reaching for one particular item among several.
- The ownership must be unambiguous: arrange gaze, hand contact and proximity so that no other person in frame could be read as the owner."#;

const CONNECTORS_BLOCK: &str = r#"YOUR TARGET IS A CONNECTOR. The RELATION between two facts owns the frame, so both linked facts must be separately visible in a single scene.

- Show cause and effect through a visible physical consequence: the spilled coffee AND the stain spreading toward the papers.
- Show contrast by placing the two opposing facts side by side in the same frame, equally lit and equally legible.
- Show time sequence through evidence of order — a finished plate beside one still full, a closed umbrella and rain already falling.
- Never rely on symbols, arrows, split screens or diagram-like layouts. It must remain one believable photograph of one real moment."#;

const GENERIC_BLOCK: &str = r#"The POS/CATEGORY does not match a known strategy, so infer the best visual approach from MEANING and EXAMPLE.

- Name internally the single target idea being taught — object, action, state, relationship, quality, frequency, direction, time, cause, possession or contrast — and make that one idea visually dominant.
- Choose the most ordinary everyday scene in which that idea is unmistakable, and let the element carrying the idea own the frame."#;

const CRAFT: &str = r#"- Use the EXAMPLE as the main visual source when it exists; represent the phrase as it would appear in daily life, not as an abstract symbol, movie scene, disaster, or dramatic event.
- MOMENT OF SPEAKING, NOT MOMENT DESCRIBED: the scene must show UTTERANCE_MOMENT — the moment the sentence is actually said — and its time of day, lighting, clothing and setting must all match THAT moment. A sentence that refers to another time does NOT move the scene to that time. "Can you wake me up at 7 AM?" is asked at night, at bedtime, in warm lamplight with a dark window and someone already in pyjamas — never in morning daylight. "See you tomorrow" happens at a doorway as someone leaves today. "Did you sleep well?" happens at breakfast, after the sleeping. The referred-to time may appear only as small evidence inside the present scene — an alarm clock being set to 7:00, a packed bag by the door, a coat already on — never as the setting itself.
- If the phrase is a question, a request, a promise or an offer, someone must be visibly ADDRESSING another person in the scene: the speaker's gaze and body turned toward the listener, the listener reacting. The favour or answer being asked for has not happened yet and must NOT be shown as already done.
- If MEANING includes usage context or a similar everyday example, use it to disambiguate the exact sense being taught.
- The learner should understand the target idea from the image alone. Avoid generic social scenes where the target idea is not visible.
- Never default to two people sitting and talking seriously, a generic handshake, people looking at documents or laptops, or a static posed conversation unless the meaning is explicitly about conversation itself.
- Do not default to a living room, couch, sofa, neutral apartment, or generic indoor home scene unless the EXAMPLE clearly happens there. Prefer the most natural setting for the exact phrase: kitchen, bathroom, doorway, office, classroom, bus stop, sidewalk, store, restaurant, gym, park, car, street, yard, workplace, or other specific location.
- Vary the setting according to the phrase. If the same meaning can happen in multiple places, choose the place where it becomes clearest instead of the safest indoor room.
- Include concrete people details: approximate age, face visibility, expression, gaze direction, posture, hand placement, clothing, and who owns or interacts with what.
- Include concrete environment details: room or street type, time of day, background objects, realistic surfaces, and lived-in imperfections.
- Regardless of the target's real-world physical size, choose camera distance, angle and framing so that it is unmistakably large and legible within the frame. Never show the target small, distant or secondary just because it is naturally small in real life — the composition must compensate for this, every time.
- Compose for a WIDE horizontal frame. Keep the main subject large, central and fully visible.
- Keep all essential faces, torsos, arms, hands and legs completely inside frame. Never show isolated limbs, cropped half-people, or bodies cut by furniture or image borders. This rule prevents accidental amputation by frame edges or furniture; it does NOT forbid a deliberate close-up chosen under EVIDENCE-FIRST FRAMING.
- EVIDENCE-FIRST FRAMING: if EVIDENCE_CARRIER is the face/eyes or the hands, move the camera CLOSE enough that this carrier is the largest element in the frame — head-and-shoulders or chest-up for a face, a tight table-level or over-the-shoulder shot for hands. In that case the full-body requirement is waived: a deliberate portrait crop at the shoulders or waist is correct and is NOT a "cropped half-person". Never keep a wide full-body shot when it shrinks the deciding detail — an eye just opening, a fingertip on a switch — to a few pixels at card size.
- Keep critical story information inside the central 80% of the frame. Do not place key objects or people at the extreme left or right edges.
- Prefer one clear scene with 1-3 important subjects. Avoid clutter, tiny distant people, and overlapping bodies.
- If the sentence implies absence, emptiness or uncertainty, show a believable empty scene with evidence of absence. Do not invent hidden people, body parts, or figures partially visible off-frame.
- Focus on EXPRESSIONS, authentic DETAILS and realistic lighting. Describe mundane, realistic background clutter (dust, tools, cables, unorganized papers, everyday objects) to make the space feel inhabited and real, not like a sterile studio or showroom.
- LIGHTING CONTROL: Describe natural, soft, indirect ambient light. Do not specify bright windows directly behind subjects that cause white overexposure, blown-out backgrounds, or harsh lens flare.
- Describe natural, realistic clothing with creases, textures and normal wear, avoiding perfect, flawless outfits.
- Facial expressions must be natural and candid. Subjects must NEVER look at the camera, NEVER pose, and NEVER smile directly at the lens. They should be engrossed in their activity.
- Avoid glowing, magical or highly stylized symbolic elements (glowing trophies, floating graphics, neon highlights) unless the target meaning is explicitly fantasy. Keep objects realistic, mundane and physically plausible.
- Avoid studio perfection. Look like a candid documentary shot. Never use words like 'perfect', 'ideal', 'glowing', 'shining', 'pristine' in the description.
- GEOMETRIC PLAUSIBILITY & LOGIC: Never place backgrounds, screens, blackboards, whiteboards, presentation slides or other key setting elements behind the subjects if doing so violates the real-world logic of the location. In a movie theater the screen is always in front of the audience, NEVER behind them: show the audience facing forward in their seats holding popcorn, and let the lighting and seats establish the cinema. If the camera faces the subjects to capture their expressions, background setting elements must either be omitted or shown from a plausible side angle, rather than physically impossible placements.
- Before finalizing, imagine a learner glancing at this image for one second, without reading the example sentence. Would they immediately and confidently guess the target meaning? If the scene requires extra thought, symbolism or subtlety, discard it and choose the single most stereotypical, most universally recognizable everyday scenario for that exact meaning instead — obvious and "boring" beats clever or ambiguous. IMPORTANT EXCEPTION: the stereotype you pick must still satisfy CONTRASTIVE_EVIDENCE. When the most familiar stock image of the phrase actually depicts RIVAL_WORD — the classic case being the stretch-in-bed pose for "wake up" — that stock image teaches the wrong word and must be rejected. Choose instead the most ordinary scene that still carries the correct contrast.
- Before writing the final answer, silently check: is this scene too generic, too indoor-by-default, or too similar to a couch/living-room stock photo? Is it posed or are they looking at the camera? If yes, replace it with a more specific, candid environment that better teaches the phrase.
- Absolutely NO TEXT, words, signs or labels in the image."#;

/// Arma el system prompt completo para la categoría dada.
pub fn build_system_prompt(pos_category: &str) -> String {
    let category = PromptCategory::detect(pos_category);
    format!(
        r#"{header}

{strategy}

STEP 1 — BRAINSTORM: What is the most common, boring, everyday situation where a person would naturally use this exact phrase?
STEP 2 — PLAN INTERNALLY using this JSON-shaped checklist. Do not output the checklist.
{{
  "CORE_IDEA": "the concrete object, action, quality, relation, state or absence actually being taught",
  "UTTERANCE_MOMENT": "the moment at which a person would actually SAY this sentence, NOT the moment the sentence talks about. A favour asked for tomorrow morning is spoken tonight at bedtime; a promise to call later is spoken now; a question about last weekend is spoken afterwards. State the time of day and the setting of that speaking moment",
{fields}
  "EVIDENCE_CARRIER": "the one visual element carrying the meaning: face/eyes, hands, whole-body posture, object state, relative position, or environment",
  "TRIGGER": "what starts, causes, reveals or times the scene; if CONTEXT_TYPE mentions timing, coincidence, surprise, absence, evidence, questions or negation, the scene must visibly show that cue",
  "SUBJECT_STATE": "the visible physical or emotional state of any person in frame"
}}
CONTRASTIVE TEST: the visual fact you describe must be one that would be plainly WRONG for RIVAL_WORD. If your description could equally illustrate both words, discard it and re-choose.
STEP 3 — DESCRIBE: Write a candid, unposed photograph description that physically shows CORE_IDEA + TRIGGER + SUBJECT_STATE, rendering CONTRASTIVE_EVIDENCE literally and making EVIDENCE_CARRIER the dominant element of the frame.
{craft}

Output exactly one line:
FINAL: one detailed final scene description (120-170 words) in English. The description must state the time of day and light of UTTERANCE_MOMENT, and must state in plain physical words {final_req}, so that nothing decisive is left to the image model's default assumptions.
Do not include the internal checklist, word counts, explanations, markdown, or any other labels."#,
        header = HEADER,
        strategy = category.strategy_block(),
        fields = category.checklist_fields(),
        craft = CRAFT,
        final_req = category.final_requirements(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_plain_catalog_categories() {
        assert_eq!(PromptCategory::detect("verbs"), PromptCategory::Verbs);
        assert_eq!(PromptCategory::detect("nouns"), PromptCategory::Nouns);
        assert_eq!(
            PromptCategory::detect("adjectives"),
            PromptCategory::Adjectives
        );
        assert_eq!(PromptCategory::detect("adverbs"), PromptCategory::Adverbs);
        assert_eq!(
            PromptCategory::detect("preposition"),
            PromptCategory::Prepositions
        );
        assert_eq!(PromptCategory::detect("pronouns"), PromptCategory::Pronouns);
        assert_eq!(
            PromptCategory::detect("determinant"),
            PromptCategory::Pronouns
        );
        assert_eq!(
            PromptCategory::detect("connectors"),
            PromptCategory::Connectors
        );
    }

    /// `phrasal_verbs` contiene `verbs`: el orden de las ramas debe resolverlo a Verbs igual.
    #[test]
    fn phrasal_verbs_resolve_to_verbs() {
        assert_eq!(
            PromptCategory::detect("phrasal_verbs"),
            PromptCategory::Verbs
        );
    }

    /// Los mazos personales llegan como namespace, no como categoría limpia.
    #[test]
    fn detects_personal_deck_namespaces() {
        assert_eq!(
            PromptCategory::detect("personal-verbs-email_coronado_gmail_com"),
            PromptCategory::Verbs
        );
        assert_eq!(
            PromptCategory::detect("personal-nouns-email_coronado_gmail_com"),
            PromptCategory::Nouns
        );
        assert_eq!(
            PromptCategory::detect("personal-adjectives-guest_local_dev"),
            PromptCategory::Adjectives
        );
    }

    #[test]
    fn unknown_category_falls_back_to_generic() {
        assert_eq!(PromptCategory::detect("phonics"), PromptCategory::Generic);
        assert_eq!(PromptCategory::detect(""), PromptCategory::Generic);
    }

    /// El punto del refactor: una card de sustantivo no debe leer reglas de fases verbales.
    #[test]
    fn noun_prompt_excludes_verb_phase_rules() {
        let prompt = build_system_prompt("nouns");
        assert!(!prompt.contains("ACTION_PHASE"));
        assert!(!prompt.contains("INTERNAL_STATE_CHANGE"));
        assert!(!prompt.contains("BANNED STOCK POSES"));
        assert!(prompt.contains("YOUR TARGET IS A NOUN"));
    }

    /// Y una card de verbo no debe arrastrar las reglas de días de la semana ni de pronombres.
    #[test]
    fn verb_prompt_excludes_other_category_rules() {
        let prompt = build_system_prompt("verbs");
        assert!(prompt.contains("ACTION_PHASE"));
        assert!(prompt.contains("BANNED STOCK POSES"));
        assert!(!prompt.contains("Saturday/Sunday"));
        assert!(!prompt.contains("1st person (my, our)"));
    }

    /// Una frase como "Can you wake me up at 7 AM?" se DICE de noche, aunque hable de las 7 AM.
    /// La regla del momento de enunciación aplica a todas las categorías, no solo a verbos.
    #[test]
    fn every_category_carries_the_utterance_moment_rule() {
        for category in ["verbs", "nouns", "adjectives", "adverbs", "pronouns", "phonics"] {
            let prompt = build_system_prompt(category);
            assert!(
                prompt.contains("UTTERANCE_MOMENT"),
                "{category} lost the utterance-moment field"
            );
            assert!(
                prompt.contains("MOMENT OF SPEAKING, NOT MOMENT DESCRIBED"),
                "{category} lost the utterance-moment rule"
            );
        }
    }

    /// Las reglas de oficio viven en un solo lugar y deben llegar a todas las categorías.
    #[test]
    fn every_category_keeps_shared_craft_and_output_contract() {
        for category in [
            "verbs",
            "nouns",
            "adjectives",
            "adverbs",
            "preposition",
            "pronouns",
            "connectors",
            "phonics",
        ] {
            let prompt = build_system_prompt(category);
            assert!(
                prompt.contains("LIGHTING CONTROL"),
                "{category} lost the craft block"
            );
            assert!(
                prompt.contains("EVIDENCE-FIRST FRAMING"),
                "{category} lost evidence-first framing"
            );
            assert!(
                prompt.contains("Absolutely NO TEXT"),
                "{category} lost the no-text rule"
            );
            assert!(
                prompt.contains("FINAL: one detailed final scene description"),
                "{category} lost the output contract"
            );
            assert!(
                prompt.contains("RIVAL_WORD"),
                "{category} lost the contrastive mechanic"
            );
        }
    }
}
