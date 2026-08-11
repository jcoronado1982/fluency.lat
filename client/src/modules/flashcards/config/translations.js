import { DECK_GROUP_TRANSLATIONS_ES } from '../../../contracts/deckGroupTranslations.js';

export const flashcardTranslations = {
    es: {
        toneSelector: {
            label: "Tono Voz:",
            options: {
                presenter: "Presentador",
                casual: "Casual",
                clear: "Claro",
                formal: "Formal",
                fast: "Rápido"
            }
        },
        categorySelector: {
            categoryTitle: "CATEGORÍA",
            loadingCategories: "Cargando categorías…",
            level: "Nivel",
            cards: "tarjetas en total",
            cardsInLevel: "tarjetas en este nivel",
            learned: "aprendidas",
            complete: "✓ completo",
            newStr: "nuevo",
            restartGroup: "Reiniciar",
            restartGroupConfirm: "¿Quieres reiniciar la subcategoría \"{group}\"?",
            groups: DECK_GROUP_TRANSLATIONS_ES,
            levels: {
                basic: "Básico",
                intermediate: "Intermedio",
                advanced: "Avanzado"
            },
            helpButtonLabel: "Ayuda de categoría",
            helpPopoverTitle: "¿Qué es esta categoría?",
            helpPopoverIntro: "Aquí agrupamos palabras por su función en la oración.",
            helpPopoverUsageLabel: "Cómo usarla",
            helpPopoverExampleLabel: "Ejemplo",
            categoryHelp: {
                nouns: {
                    title: "Sustantivos",
                    summary: "Es una palabra que nombra algo.",
                    usage: "Puede nombrar una persona, un animal, una cosa, un lugar, una idea, un sentimiento o una actividad.",
                    exampleTable: [
                        { label: "Persona", items: ["teacher = profesor", "student = estudiante"] },
                        { label: "Animal", items: ["dog = perro", "cat = gato"] },
                        { label: "Cosa", items: ["book = libro", "phone = teléfono"] },
                        { label: "Lugar", items: ["school = escuela", "house = casa"] },
                        { label: "Idea o actividad", items: ["love = amor", "time = tiempo", "working = trabajar"] },
                    ],
                    exampleNotes: [
                        "This is a book. Este es un libro. book es sustantivo.",
                        "She is a teacher. Ella es profesora. teacher es sustantivo.",
                        "Working is difficult. Trabajar es difícil. working funciona como sustantivo porque nombra una actividad.",
                        "Regla simple: si nombra algo, es sustantivo."
                    ],
                    exampleHighlight: ["teacher", "student", "dog", "cat", "book", "phone", "school", "house", "love", "time", "working"]
                },
                verbs: {
                    title: "Verbos",
                    summary: "Es una palabra que expresa una acción, un estado o algo que está pasando.",
                    usage: "Los verbos son necesarios para formar oraciones, porque indican qué hace una persona, animal o cosa.",
                    example: "Por ejemplo:\nI run.\nYo corro.\nShe studies.\nElla estudia.\nThey work.\nEllos trabajan.",
                    exampleHighlight: ["run", "corro", "studies", "estudia", "work", "trabajan"]
                },
                adjectives: {
                    title: "Adjetivos",
                    summary: "Es una palabra que describe un sustantivo.",
                    usage: "Sirve para decir cómo es una persona, cosa o lugar.",
                    exampleTable: [
                        { label: "Ejemplos", items: ["grande = big", "pequeño = small", "nuevo = new", "viejo / antiguo = old"] },
                    ],
                    exampleNotes: [
                        "Esta es una casa grande.",
                        "Tengo un teléfono nuevo."
                    ],
                    exampleHighlight: ["grande", "pequeño", "nuevo", "viejo", "antiguo"]
                },
                adverbs: {
                    title: "Adverbios",
                    summary: "Es una palabra que modifica o da más información sobre un verbo, un adjetivo, otro adverbio o una oración completa.",
                    usage: "El adverbio puede decir cómo, cuándo, dónde, con qué frecuencia o qué tan intensa es una acción o descripción. Un adverbio da información extra.",
                    exampleNotes: [
                        "Ella corre rápidamente.",
                        "Estudio hoy.",
                        "Esta es una casa muy grande.",
                        "Él corre muy rápidamente.",
                        "Afortunadamente, llegamos a tiempo."
                    ],
                    exampleHighlight: ["rápidamente", "hoy", "muy", "Afortunadamente"]
                },
                preposition: {
                    title: "Preposiciones",
                    summary: "Una preposición conecta una palabra con otra para mostrar dónde, cuándo o hacia dónde.",
                    usage: "Sirve para expresar relaciones de lugar, tiempo y dirección dentro de una oración.",
                    exampleTable: [
                        { label: "Lugar", items: ["Las llaves están sobre la mesa.", "El perro está debajo de la silla."] },
                        { label: "Tiempo", items: ["Estudio por la mañana.", "Tenemos clase a las ocho."] },
                        { label: "Dirección", items: ["Ella va al banco.", "Camina hasta la esquina."] },
                    ],
                    exampleHighlight: ["sobre", "debajo", "por", "a", "al", "hasta"]
                },
                pronouns: {
                    title: "Pronombres",
                    summary: "Es una palabra que se usa para reemplazar un nombre o sustantivo.",
                    usage: "Sirve para no repetir muchas veces el mismo nombre.",
                    example: "María es mi amiga. Ella está feliz.",
                    exampleHighlight: "Ella"
                },
                connectors: {
                    title: "Conectores",
                    summary: "Es una palabra o frase que une ideas dentro de una oración o entre varias oraciones.",
                    usage: "Sirve para que las ideas no queden separadas y el mensaje sea más claro. Un conector une ideas y ayuda a entender cómo se relacionan.",
                    exampleNotes: [
                        "Estaba cansado, pero terminé mi tarea.",
                        "Me quedé en casa porque estaba lloviendo.",
                        "Primero, me ducho. Luego, preparo el desayuno."
                    ],
                    exampleHighlight: ["pero", "porque", "Primero", "Luego"]
                },
                determinant: {
                    title: "Determinantes",
                    summary: "Es una palabra que va antes del sustantivo y ayuda a identificarlo mejor.",
                    usage: "Sirve para mostrar cuál es, cuántos hay, de quién es y si es uno o varios.",
                    exampleTable: [
                        { label: "Cuál es", items: ["Este libro es interesante.", "Ese restaurante es barato."] },
                        { label: "Cuántos hay", items: ["Tengo tres manzanas.", "Hay muchas personas aquí."] },
                        { label: "De quién es", items: ["Mi teléfono está en la cama.", "Su bolso es negro."] },
                        { label: "Uno o varios", items: ["Un perro está afuera.", "Unas galletas están en la mesa."] },
                    ],
                    exampleHighlight: ["Este", "Ese", "tres", "muchas", "Mi", "Su", "Un", "Unas"]
                },
                phrasal_verbs: {
                    title: "Verbos frasales",
                    summary: "Es la combinacion de un verbo y una particula como up, on, off, out, in o for.",
                    usage: "Cuando se unen, funcionan como una sola idea y muchas veces crean un significado diferente al de cada palabra por separado. Verbo + particula = una expresion con significado propio. Los verbos frasales son muy comunes en el ingles diario y hablado; en ingles muy formal, muchas veces se prefieren verbos de una sola palabra.",
                    exampleTable: [
                        { label: "Usos comunes", items: ["get up = levantarse", "turn off = apagar", "look for = buscar", "give up = rendirse"] },
                        { label: "Uso mas natural", items: ["find out the cause", "put off the meeting", "go on with the project"] },
                        { label: "Uso mas formal", items: ["determine the cause", "postpone the meeting", "continue the project"] },
                    ],
                    exampleHighlight: ["get up", "turn off", "look for", "give up", "find out", "put off", "go on", "determine", "postpone", "continue"]
                }
            },
            categories: {
                nouns: "Sustantivos",
                verbs: "Verbos",
                adjectives: "Adjetivos",
                adverbs: "Adverbios",
                preposition: "Preposiciones",
                pronouns: "Pronombres",
                connectors: "Conectores",
                determinant: "Determinantes",
                phrasal_verbs: "Verbos frasales"
            }
        },
        phonicsModal: {
            loading: "Cargando reglas de fonética...",
            errorEmpty: "No se encontraron reglas."
        },
        ipaModal: {
            title: "Tabla de Vocales",
            front: "Anterior",
            central: "Central",
            back: "Posterior",
            close: "Cerrada",
            mid: "Media",
            open: "Abierta",
            long: "Larga / tensa",
            short: "Corta / laxa"
        },
        controls: {
            prev: "Anterior",
            next: "Siguiente",
            reset: "Reiniciar",
            resetConfirmTitle: "¿Resetear progreso?",
            resetConfirmMessage: "Se borrará el avance de aprendizaje de este bloque.",
            correct: "Marcar como Aprendida",
            play: "Reproducir Audio",
            work: "Palabra:"
        },
        completionCard: {
            badge: "Excelente",
            groupTitle: "Tema completado",
            levelTitle: "Mazo completado",
            groupSubtitle: "Terminaste el tema \"{topic}\". Ya puedes seguir con el siguiente bloque recomendado.",
            levelSubtitle: "Terminaste el mazo {level}. Te sugerimos continuar con el siguiente mazo recomendado.",
            badgeReviewed: "Buen trabajo",
            groupTitleReviewed: "Repasaste el tema",
            levelTitleReviewed: "Repasaste el mazo",
            groupSubtitleReviewed: "¡Buen trabajo! Repasaste todas las tarjetas de \"{topic}\". Sigue con el siguiente bloque recomendado, repásalo de nuevo, o marca las que ya sabes.",
            levelSubtitleReviewed: "¡Buen trabajo! Repasaste todo el mazo {level}. Continúa con el siguiente mazo recomendado, repásalo de nuevo, o marca las tarjetas que ya sabes.",
            defaultTopic: "actual",
            defaultLevel: "actual",
            progressLabel: "Progreso",
            statusLabel: "Estado",
            statusValue: "Completado",
            statusValueReviewed: "Repasado",
            nextStepLabel: "Siguiente paso sugerido",
            noRecommendation: "Ya recorriste toda la ruta disponible. Puedes repetir una categoría o explorar otra.",
            continueButton: "Continuar ruta",
            catalogButton: "Ver categorías",
            restartButton: "Repetir este mazo",
            reviewAgainButton: "Repasar de nuevo"
        }
    },
    en: {
        toneSelector: {
            label: "Voice Tone:",
            options: {
                presenter: "Presenter",
                casual: "Casual",
                clear: "Clear",
                formal: "Formal",
                fast: "Fast"
            }
        },
        categorySelector: {
            categoryTitle: "CATEGORY",
            loadingCategories: "Loading categories…",
            level: "Level",
            cards: "total cards",
            cardsInLevel: "cards of this level",
            learned: "learned",
            complete: "✓ complete",
            newStr: "new",
            restartGroup: "Restart",
            restartGroupConfirm: "Do you want to restart the \"{group}\" subcategory?",
            groups: {
                General: "General",
                Action: "Action",
                "Being State": "Being State",
                "Being & State": "Being & State",
                "Action & Movement": "Action & Movement",
                "Daily Life": "Daily Life",
                "Communication": "Communication",
                "Change & Result": "Change & Result",
                "Mind & Senses": "Mind & Senses",
                "Social & Exchange": "Social & Exchange",
                "Handling & Creating": "Handling & Creating",
                "Daily Routine": "Daily Routine",
                "Building & Creating": "Building & Creating",
                "Managing & Control": "Managing & Control",
                "Thinking & Deciding": "Thinking & Deciding",
                "Daily Tasks": "Daily Tasks",
                "Feelings & Reactions": "Feelings & Reactions",
                "Body & Movement": "Body & Movement",
                "Social & Daily Life": "Social & Daily Life",
                "Academic Communication": "Academic Communication",
                "Age & Novelty": "Age & Novelty",
                "Animals": "Animals",
                "Arts & Media": "Arts & Media",
                "Body Parts": "Body Parts",
                "Clothing": "Clothing",
                "Colors": "Colors",
                "Connectors: Addition": "Connectors: Addition",
                "Connectors: Alternative": "Connectors: Alternative",
                "Connectors: Cause & Effect": "Connectors: Cause & Effect",
                "Connectors: Clarification": "Connectors: Clarification",
                "Connectors: Conclusion": "Connectors: Conclusion",
                "Connectors: Condition": "Connectors: Condition",
                "Connectors: Contrast": "Connectors: Contrast",
                "Connectors: Example": "Connectors: Example",
                "Connectors: Relative": "Connectors: Relative",
                "Connectors: Sequence": "Connectors: Sequence",
                "Connectors: Time": "Connectors: Time",
                "Critical Thinking": "Critical Thinking",
                "Days of the Week": "Days of the Week",
                "Demonstrative": "Demonstrative",
                "Determiners: Articles": "Determiners: Articles",
                "Determiners: Demonstratives": "Determiners: Demonstratives",
                "Determiners: Distributives": "Determiners: Distributives",
                "Determiners: Numbers": "Determiners: Numbers",
                "Determiners: Other": "Determiners: Other",
                "Determiners: Partitives": "Determiners: Partitives",
                "Determiners: Possessives": "Determiners: Possessives",
                "Determiners: Quantifiers": "Determiners: Quantifiers",
                "Difficulty & Effort": "Difficulty & Effort",
                "Directions": "Directions",
                "Family": "Family",
                "Feelings": "Feelings",
                "Feelings & Emotions": "Feelings & Emotions",
                "Food": "Food",
                "General Concepts": "General Concepts",
                "Goals & Results": "Goals & Results",
                "Government & Society": "Government & Society",
                "Health & Medicine": "Health & Medicine",
                "Health & Well-being": "Health & Well-being",
                "Household": "Household",
                "Indefinite": "Indefinite",
                "Influence & Change": "Influence & Change",
                "Interrogative/Relative": "Interrogative/Relative",
                "Logic & Evaluation": "Logic & Evaluation",
                "Mind & Attitude": "Mind & Attitude",
                "Months": "Months",
                "Movement": "Movement",
                "Nature": "Nature",
                "Nature & Environment": "Nature & Environment",
                "Nature & Materials": "Nature & Materials",
                "Numbers": "Numbers",
                "Object": "Object",
                "Partitives": "Partitives",
                "People": "People",
                "Personality & Social": "Personality & Social",
                "Personality Traits": "Personality Traits",
                "Phrasal Verbs: Break": "Phrasal Verbs: Break",
                "Phrasal Verbs: Bring": "Phrasal Verbs: Bring",
                "Phrasal Verbs: Call": "Phrasal Verbs: Call",
                "Phrasal Verbs: Calm": "Phrasal Verbs: Calm",
                "Phrasal Verbs: Carry": "Phrasal Verbs: Carry",
                "Phrasal Verbs: Check": "Phrasal Verbs: Check",
                "Phrasal Verbs: Come": "Phrasal Verbs: Come",
                "Phrasal Verbs: Drop": "Phrasal Verbs: Drop",
                "Phrasal Verbs: Figure": "Phrasal Verbs: Figure",
                "Phrasal Verbs: Find": "Phrasal Verbs: Find",
                "Phrasal Verbs: Get": "Phrasal Verbs: Get",
                "Phrasal Verbs: Make": "Phrasal Verbs: Make",
                "Phrasal Verbs: Pick": "Phrasal Verbs: Pick",
                "Phrasal Verbs: Put": "Phrasal Verbs: Put",
                "Phrasal Verbs: Run": "Phrasal Verbs: Run",
                "Phrasal Verbs: Set": "Phrasal Verbs: Set",
                "Phrasal Verbs: Show": "Phrasal Verbs: Show",
                "Phrasal Verbs: Take": "Phrasal Verbs: Take",
                "Phrasal Verbs: Turn": "Phrasal Verbs: Turn",
                "Phrasal Verbs: Wake": "Phrasal Verbs: Wake",
                "Phrasal Verbs: Work": "Phrasal Verbs: Work",
                "Physical & Sensory": "Physical & Sensory",
                "Physical State": "Physical State",
                "Places": "Places",
                "Places & Locations": "Places & Locations",
                "Poss. Adjective": "Poss. Adjective",
                "Poss. Pronoun": "Poss. Pronoun",
                "Possession Exchange": "Possession Exchange",
                "Prepositions: Addition & Exception": "Prepositions: Addition & Exception",
                "Prepositions: Agent & Instrument": "Prepositions: Agent & Instrument",
                "Prepositions: Cause & Reason": "Prepositions: Cause & Reason",
                "Prepositions: Comparison": "Prepositions: Comparison",
                "Prepositions: Comparison & Role": "Prepositions: Comparison & Role",
                "Prepositions: Contrast": "Prepositions: Contrast",
                "Prepositions: Movement & Direction": "Prepositions: Movement & Direction",
                "Prepositions: Opposition": "Prepositions: Opposition",
                "Prepositions: Origin": "Prepositions: Origin",
                "Prepositions: Other": "Prepositions: Other",
                "Prepositions: Place": "Prepositions: Place",
                "Prepositions: Place & Time": "Prepositions: Place & Time",
                "Prepositions: Possession & Relation": "Prepositions: Possession & Relation",
                "Prepositions: Reference": "Prepositions: Reference",
                "Prepositions: Representation": "Prepositions: Representation",
                "Prepositions: Substitution": "Prepositions: Substitution",
                "Prepositions: Time": "Prepositions: Time",
                "Prepositions: Time & Purpose": "Prepositions: Time & Purpose",
                "Prepositions: Topic": "Prepositions: Topic",
                "Professional Action": "Professional Action",
                "Professional & Business": "Professional & Business",
                "Quality & Value": "Quality & Value",
                "Reciprocal": "Reciprocal",
                "Reflexive": "Reflexive",
                "Relative": "Relative",
                "School & Work": "School & Work",
                "Science & Biology": "Science & Biology",
                "Seasons": "Seasons",
                "Size & Dimension": "Size & Dimension",
                "Social Dynamics": "Social Dynamics",
                "Social & Status": "Social & Status",
                "Society": "Society",
                "Speed & Time": "Speed & Time",
                "State & Fortune": "State & Fortune",
                "Subject": "Subject",
                "Technology & Internet": "Technology & Internet",
                "Thinking": "Thinking",
                "Thinking & Senses": "Thinking & Senses",
                "Time": "Time",
                "Transportation": "Transportation",
                "Transportation & Travel": "Transportation & Travel",
                "Value & Wealth": "Value & Wealth"
            },
            levels: {
                basic: "Basic",
                intermediate: "Intermediate",
                advanced: "Advanced"
            },
            helpButtonLabel: "Category help",
            helpPopoverTitle: "What is this category?",
            helpPopoverIntro: "Words are grouped here by their role in a sentence.",
            helpPopoverUsageLabel: "How to use it",
            helpPopoverExampleLabel: "Example",
            categoryHelp: {
                nouns: {
                    title: "Nouns",
                    summary: "It is a word that names something.",
                    usage: "It can name a person, an animal, a thing, a place, an idea, a feeling, or an activity.",
                    exampleTable: [
                        { label: "Person", items: ["teacher = profesor", "student = estudiante"] },
                        { label: "Animal", items: ["dog = perro", "cat = gato"] },
                        { label: "Thing", items: ["book = libro", "phone = teléfono"] },
                        { label: "Place", items: ["school = escuela", "house = casa"] },
                        { label: "Idea or activity", items: ["love = amor", "time = tiempo", "working = trabajar"] },
                    ],
                    exampleNotes: [
                        "This is a book. Este es un libro. book is a noun.",
                        "She is a teacher. Ella es profesora. teacher is a noun.",
                        "Working is difficult. Trabajar es difícil. working works as a noun because it names an activity.",
                        "Simple rule: if it names something, it is a noun."
                    ],
                    exampleHighlight: ["teacher", "student", "dog", "cat", "book", "phone", "school", "house", "love", "time", "working"]
                },
                verbs: {
                    title: "Verbs",
                    summary: "Express actions, states, or processes.",
                    usage: "They show what the subject does or what happens to it.",
                    example: "I run.\nYo corro.\nShe studies.\nElla estudia.\nThey work.\nEllos trabajan.",
                    exampleHighlight: ["run", "corro", "studies", "estudia", "work", "trabajan"]
                },
                adjectives: {
                    title: "Adjectives",
                    summary: "It is a word that describes a noun.",
                    usage: "It helps describe how a person, thing, or place is.",
                    exampleTable: [
                        { label: "Examples", items: ["big = grande", "small = pequeño", "new = nuevo", "old = viejo / antiguo"] },
                    ],
                    exampleNotes: [
                        "This is a big house.",
                        "I have a new phone."
                    ],
                    exampleHighlight: ["big", "small", "new", "old"]
                },
                adverbs: {
                    title: "Adverbs",
                    summary: "It is a word that modifies or gives more information about a verb, an adjective, another adverb, or a whole sentence.",
                    usage: "An adverb can tell how, when, where, how often, or how intense an action or description is. An adverb gives extra information.",
                    exampleNotes: [
                        "She runs quickly. (Ella corre rápidamente).",
                        "I study today. (Estudio hoy).",
                        "This is a very big house. (Esta es una casa muy grande).",
                        "He runs very quickly. (Él corre muy rápidamente).",
                        "Fortunately, we arrived on time. (Afortunadamente, llegamos a tiempo)."
                    ],
                    exampleHighlight: ["quickly", "rápidamente", "today", "hoy", "very", "muy", "Fortunately", "Afortunadamente"]
                },
                preposition: {
                    title: "Prepositions",
                    summary: "A preposition connects one word to another to show where, when, or in what direction.",
                    usage: "Use it to express relationships of place, time, and direction in a sentence.",
                    exampleTable: [
                        { label: "Place", items: ["The keys are on the table.", "The dog is under the chair."] },
                        { label: "Time", items: ["I study in the morning.", "We have class at eight."] },
                        { label: "Direction", items: ["She is going to the bank.", "Walk to the corner."] },
                    ],
                    exampleHighlight: ["on", "under", "in", "at", "to"]
                },
                pronouns: {
                    title: "Pronouns",
                    summary: "A word used to replace a name or noun.",
                    usage: "It helps you avoid repeating the same name many times.",
                    example: "Maria is my friend. She is happy.",
                    exampleHighlight: "She"
                },
                connectors: {
                    title: "Connectors",
                    summary: "It is a word or phrase that joins ideas within a sentence or between sentences.",
                    usage: "It helps ideas stay connected so the message is clearer. A connector shows how ideas relate to each other.",
                    exampleNotes: [
                        "I was tired, but I finished my homework.",
                        "I stayed home because it was raining.",
                        "First, I take a shower. Then, I make breakfast."
                    ],
                    exampleHighlight: ["but", "because", "First", "Then"]
                },
                determinant: {
                    title: "Determiners",
                    summary: "It is a word that goes before a noun and helps identify it more clearly.",
                    usage: "It shows which one it is, how many there are, whose it is, and whether it is one or several.",
                    exampleTable: [
                        { label: "Which one", items: ["This book is interesting.", "That restaurant is cheap."] },
                        { label: "How many", items: ["I have three apples.", "There are many people here."] },
                        { label: "Whose", items: ["My phone is on the bed.", "Her bag is black."] },
                        { label: "One or several", items: ["A dog is outside.", "Some cookies are on the table."] },
                    ],
                    exampleHighlight: ["This", "That", "three", "many", "My", "Her", "A", "Some"]
                },
                phrasal_verbs: {
                    title: "Phrasal verbs",
                    summary: "It is the combination of a verb and a particle such as up, on, off, out, in, or for.",
                    usage: "When they join, they work as one idea and often create a meaning that is different from each word on its own. Verb + particle = an expression with its own meaning. Phrasal verbs are very common in everyday spoken English; in very formal English, a one-word verb is often preferred.",
                    exampleTable: [
                        { label: "Common uses", items: ["get up = levantarse", "turn off = apagar", "look for = buscar", "give up = rendirse"] },
                        { label: "More natural use", items: ["find out the cause", "put off the meeting", "go on with the project"] },
                        { label: "More formal use", items: ["determine the cause", "postpone the meeting", "continue the project"] },
                    ],
                    exampleHighlight: ["get up", "turn off", "look for", "give up", "find out", "put off", "go on", "determine", "postpone", "continue"]
                }
            },
            categories: {
                nouns: "Nouns",
                verbs: "Verbs",
                adjectives: "Adjectives",
                adverbs: "Adverbs",
                preposition: "Prepositions",
                pronouns: "Pronouns",
                connectors: "Connectors",
                determinant: "Determinants",
                phrasal_verbs: "Phrasal Verbs"
            }
        },
        phonicsModal: {
            loading: "Loading phonics rules...",
            errorEmpty: "No rules found."
        },
        ipaModal: {
            title: "Vowel Chart",
            front: "Front",
            central: "Central",
            back: "Back",
            close: "Close",
            mid: "Mid",
            open: "Open",
            long: "Long / tense",
            short: "Short / lax"
        },
        controls: {
            prev: "Previous",
            next: "Next",
            reset: "Reset",
            resetConfirmTitle: "Reset progress?",
            resetConfirmMessage: "Learning progress for this block will be cleared.",
            correct: "Mark as Learned",
            play: "Play Audio",
            work: "Word:"
        },
        completionCard: {
            badge: "Great job",
            groupTitle: "Topic complete",
            levelTitle: "Deck complete",
            groupSubtitle: "You finished the topic \"{topic}\". You can continue with the next recommended block.",
            levelSubtitle: "You finished the {level} deck. We suggest continuing with the next recommended deck.",
            badgeReviewed: "Good job",
            groupTitleReviewed: "Topic reviewed",
            levelTitleReviewed: "Deck reviewed",
            groupSubtitleReviewed: "Good job! You reviewed all the cards in \"{topic}\". Continue with the next recommended block, review it again, or mark the ones you already know.",
            levelSubtitleReviewed: "Good job! You reviewed the whole {level} deck. Continue with the next recommended deck, review it again, or mark the cards you already know.",
            defaultTopic: "current one",
            defaultLevel: "current",
            progressLabel: "Progress",
            statusLabel: "Status",
            statusValue: "Completed",
            statusValueReviewed: "Reviewed",
            nextStepLabel: "Recommended next step",
            noRecommendation: "You already completed the available route. You can review a category or explore another one.",
            continueButton: "Continue path",
            catalogButton: "View categories",
            restartButton: "Study this deck again",
            reviewAgainButton: "Review again"
        }
    }
};

/** Traducciones exclusivas del módulo flashcards (no pertenecen al shell). */
export function getFlashcardTranslations(language = 'en') {
    return flashcardTranslations[language] || flashcardTranslations.en;
}

export const flashcardSidebarLabels = {
    es: {
        learn: 'Aprender',
        flashcards: 'Flashcards',
        wordCollections: 'Colecciones de palabras',
    },
    en: {
        learn: 'Learn',
        flashcards: 'Flashcards',
        wordCollections: 'Word collections',
    },
};

export function getFlashcardSidebarLabels(language = 'en') {
    return flashcardSidebarLabels[language] || flashcardSidebarLabels.en;
}

export const flashcardFloatingMenuLabels = {
    es: {
        learn: 'Aprender',
        categories: 'Categorías',
        wordCollections: 'Colecciones de palabras',
        vowelChart: 'Tabla de vocales',
        referenceChart: 'Tabla de referencia',
    },
    en: {
        learn: 'Learn',
        categories: 'Categories',
        wordCollections: 'Word collections',
        vowelChart: 'Vowels chart',
        referenceChart: 'Reference chart',
    },
};

export function getFlashcardFloatingMenuLabels(language = 'en') {
    return flashcardFloatingMenuLabels[language] || flashcardFloatingMenuLabels.en;
}
