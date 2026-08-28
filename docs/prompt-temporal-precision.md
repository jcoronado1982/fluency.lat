# Precisión Temporal de Acción en el Prompt de Generación de Imágenes

## Problema

El prompt actual que genera descripciones visuales para las tarjetas de estudio no distingue la **fase física exacta** que un verbo representa dentro de una secuencia de movimiento o cambio de estado.

### Caso concreto detectado: `wake up` vs `get up`

- **`wake up`** significa recuperar la consciencia (abrir los ojos, despertar). Es un **cambio de estado interno**, no un movimiento corporal. Sin embargo, la imagen generada muestra al sujeto **ya sentado y erguido** en la cama, estirándose — una postura que visualmente se confunde con "levantarse".
- **`get up`** significa levantarse físicamente de la cama. Su imagen muestra al sujeto sentado al borde del colchón con los pies en el suelo, lo cual sí es correcto.
- **El resultado**: un estudiante que ve ambas tarjetas consecutivas podría pensar que ambas significan lo mismo porque en las dos el sujeto ya está incorporado.

### Por qué el prompt actual no lo prevenía

La regla existente para phrasal verbs decía:

> *"identify the core teachable meaning from MEANING and EXAMPLE first, then visualize that meaning"*

Esto es correcto pero **insuficiente**. No instruye al LLM a pensar en:
1. ¿En qué **momento físico exacto** de una secuencia ocurre este verbo?
2. ¿Existe otro verbo que comparta el mismo escenario pero signifique algo diferente?
3. ¿El verbo describe un **estado interno** (consciencia, emoción, percepción) o un **movimiento físico**?

Sin estas preguntas, el LLM genera una escena que "se ve bien" para el concepto general (persona + cama + mañana) pero no distingue la fase precisa del verbo.

### Alcance del problema

Esto **no es exclusivo de `wake up` / `get up`**. Afecta a cualquier par o grupo de verbos que comparten el mismo escenario pero difieren en la fase temporal o el tipo de acción. Ejemplos:

| Verbo A (estado / inicio) | Verbo B (acción física) | Confusión visual posible |
|---|---|---|
| `wake up` (consciencia) | `get up` (movimiento) | Ambos en una cama, ambos "despiertos" |
| `fall asleep` (quedándose dormido) | `sleep` (ya dormido) | Ambos con ojos cerrados en cama |
| `sit down` (sentándose) | `sit` (ya sentado) | Ambos en una silla |
| `put on` (poniéndose ropa) | `wear` (ya vestido) | Ambos con la prenda visible |
| `pick up` (recogiendo del suelo) | `hold` (sosteniendo) | Ambos con objeto en mano |
| `turn on` (encendiendo) | `use` (usando) | Ambos frente al aparato |
| `lie down` (acostándose) | `lie` (ya acostado) | Ambos horizontales |
| `stand up` (poniéndose de pie) | `stand` (ya de pie) | Ambos verticales |

---

## Primer Intento (insuficiente)

Se agregó una regla en prosa llamada **TEMPORAL PRECISION OF ACTIONS** en la lista de estrategia por categoría gramatical, con tres puntos: estado interno → cuerpo en posición previa; transición física → congelar a mitad del movimiento; y preguntar si otro verbo comparte el escenario.

La regla era correcta pero **no cambiaba el resultado**, porque otras tres reglas del mismo prompt la contradecían.

## Causa Raíz Real: Tres Conflictos Internos del Prompt

El problema no era una regla faltante, sino que la regla de fase **perdía** contra reglas más fuertes ubicadas más abajo en el prompt:

1. **La regla del estereotipo le ganaba a la regla de fase.**
   La instrucción "elige el escenario más estereotípico y universalmente reconocible — obvio y aburrido es mejor que ingenioso" aparecía ~47 líneas *después* de la regla temporal y con más fuerza retórica. Para `wake up`, el escenario más estereotípico **es** la foto de stock de alguien sentado estirando los brazos en la cama. La regla del estereotipo mandaba a generar exactamente la imagen que la regla temporal prohibía.

2. **Las reglas de encuadre escondían la evidencia.**
   La regla temporal exigía que el cambio de estado interno fuera visible "ONLY through facial expression, eye state" — pero otras reglas exigían cuerpos completos sin recortes, sujeto grande y centrado. En un lienzo de 768x512 con un cuerpo entero acostado, los ojos ocupan unos pocos píxeles: el único portador del significado quedaba invisible. La regla de "compensar el encuadre para objetos pequeños" existía, pero estaba redactada sobre *objetos*, así que el LLM no la aplicaba a una cara.

3. **El checklist interno no cargaba la fase.**
   El LLM razona y se compromete con la estructura JSON de STEP 2 (`CORE_EVENT` / `TRIGGER` / `SUBJECT_STATE`). La precisión de fase vivía en un bullet de prosa dentro de la lista de POS, donde se leía como una nota específica para verbos. Lo que no está en el checklist no se decide antes de escribir la escena.

Además, el punto 3 pedía *preguntarse* si existe un verbo rival, pero nunca obligaba a **nombrarlo** ni a declarar una postura que fuera falsa para él. Un chequeo sin nombre se cumple superficialmente.

## Solución Aplicada (segunda iteración)

Cinco cambios coordinados en [`backend/api_main/src/infrastructure/ai/gemini_grpc_provider.rs`](../backend/api_main/src/infrastructure/ai/gemini_grpc_provider.rs):

| # | Cambio | Línea aprox. | Qué resuelve |
|---|---|---|---|
| 1 | Regla **TEMPORAL PRECISION OF ACTIONS** reescrita: cuatro fases tipadas + test contrastivo + lista de **BANNED STOCK POSES** | 599-605 | Da anclas concretas en vez de instrucción abstracta |
| 2 | Checklist STEP 2 gana `ACTION_PHASE`, `RIVAL_WORD`, `CONTRASTIVE_POSTURE`, `EVIDENCE_CARRIER` | 620-626 | Conflicto 3: la fase se decide *antes* de componer la escena |
| 3 | Nueva regla **EVIDENCE-FIRST FRAMING** + excepción explícita en la regla de cuerpo completo | 642-643 | Conflicto 2: permite el primer plano cuando el significado vive en la cara o las manos |
| 4 | **IMPORTANT EXCEPTION** dentro de la regla del estereotipo | 654 | Conflicto 1: el estereotipo ya no puede pisar la fase correcta |
| 5 | La salida `FINAL:` debe declarar en palabras físicas la posición del cuerpo, el estado de los ojos y la ubicación de las manos | 659 | No deja la fase librada al prior del modelo de imagen |

El cambio 1 imita la estructura que **ya funciona** en este prompt: la regla de días de la semana usa `NEVER <pose genérica>` + alternativas concretas enumeradas. Las poses prohibidas se nombran una por una junto con el verbo que sí enseñan.

## Tercera Iteración: el Contraste Depende de la Categoría

La segunda iteración tenía un defecto propio: el checklist de STEP 2 se aplica a **todas** las palabras, pero quedó con forma de verbo. Un sustantivo como `table` o un adjetivo como `warm` estaba obligado a elegir un `ACTION_PHASE` entre cuatro fases de movimiento que no significan nada para él — razonamiento irrelevante que puede llegar a inventarle una acción a una card que solo necesita mostrar un objeto.

El **mecanismo** sí generaliza a todas las categorías: nombrar la palabra rival y mostrar evidencia que sería falsa para ella. Lo que cambia es el **eje** del contraste:

| Categoría | CONTRAST_AXIS | Rival típico | Qué debe ser visible |
|---|---|---|---|
| Verbos / phrasal verbs | Fase del movimiento | `wake up` → `get up` | Posición del cuerpo y estado de los ojos |
| Adjetivos | Grado o cualidad | `warm` → `hot` | Señal física de intensidad en el sujeto |
| Adverbios | Manera de la acción | `quickly` → `slowly` | Velocidad, fuerza o cuidado visibles en el cuerpo |
| Sustantivos concretos | Identidad del objeto | `cup` → `mug` | Rasgos físicos distintivos (asa, material, transparencia) |
| Sustantivos abstractos | La situación que lo encarna | — | Escena específica donde el concepto vecino no encajaría |
| Preposiciones | Relación espacial | `on` → `above` | Contacto vs. hueco visible |
| Pronombres / posesivos | Quién posee o recibe | `my` → `his` | Mirada, manos y proximidad inequívocas |

### Cambios de la tercera iteración

- `ACTION_PHASE` quedó **condicionado a verbos**: para cualquier otra categoría se escribe `N/A` y la regla temporal se salta entera.
- La regla `TEMPORAL PRECISION OF ACTIONS` lleva ahora en su título el alcance explícito: *VERBS, PHRASAL VERBS AND ACTIONS ONLY*.
- Nuevo campo `CONTRAST_AXIS` en el checklist, que selecciona el eje según `POS/CATEGORY`.
- `CONTRASTIVE_POSTURE` se generalizó a **`CONTRASTIVE_EVIDENCE`** (la postura solo aplica a verbos; para un adjetivo es la señal de intensidad, para un sustantivo los rasgos del objeto).
- Nueva regla **CONTRASTIVE PRECISION (ALL CATEGORIES)** con guía concreta por categoría, hermana de la regla temporal.
- `RIVAL_WORD` ahora trae ejemplos de todas las categorías, no solo verbos.

### Las cuatro fases tipadas (solo verbos)

| ACTION_PHASE | Ejemplos | Regla de cuerpo |
|---|---|---|
| `INTERNAL_STATE_CHANGE` | wake up, realize, notice, remember, hear | Cuerpo en la posición PREVIA; el cambio solo en la cara |
| `PHYSICAL_TRANSITION` | get up, sit down, put on, pick up, turn on | Congelado A MITAD del movimiento, peso desbalanceado |
| `ONGOING_STATE` | sleep, sit, stand, wear, hold | Posición asentada, sin rastro de la transición |
| `COMPLETED_RESULT` | arrive, finish, break, spill | Movimiento terminado; solo la consecuencia visible |

### Resultado esperado

Ante `WORD/PHRASE: "wake up"`, `MEANING: "Despertar"`:

- `ACTION_PHASE` = `INTERNAL_STATE_CHANGE`, `RIVAL_WORD` = `get up`.
- `CONTRASTIVE_POSTURE` = cabeza todavía en la almohada, ojos apenas entreabiertos, torso sin levantar — postura que sería **falsa** para `get up`.
- `EVIDENCE_CARRIER` = cara/ojos → **EVIDENCE-FIRST FRAMING** acerca la cámara a un plano de cabeza y hombros, y la regla de cuerpo completo queda explícitamente exenta.
- La pose de estirarse en la cama está en BANNED STOCK POSES y la excepción del estereotipo impide recuperarla.

## Cuarta Iteración: Un Prompt por Categoría (base + módulo)

La tercera iteración seguía siendo **un solo prompt de ~93 líneas que toda card leía completo**. Una card de sustantivo atravesaba las reglas de fases verbales, pronombres, preposiciones, conectores y días de la semana antes de llegar a la suya. Dos costos reales:

1. **Atención diluida**: la mayoría de las instrucciones que lee el modelo no aplican a la palabra que tiene delante.
2. **Contaminación**: las reglas de verbos ("la ACCIÓN es el foco central", "poses dinámicas") empujan la escena de un sustantivo hacia la acción, cuando el protagonista debería ser el objeto.

El principio es el que planteó el usuario: **en un verbo la acción tiene el protagonismo, en un sustantivo el sustantivo, en un adjetivo el adjetivo**. Cada categoría necesita su propio prompt.

### Arquitectura elegida: base + módulo, no 9 prompts sueltos

Escribir 9 prompts completos e independientes daba máximo aislamiento, pero duplicaba ~50 líneas de reglas de oficio (luz, encuadre, realismo, formato de salida) nueve veces — y esas copias se desincronizan. Se eligió composición en runtime:

```
build_system_prompt(category) =
      HEADER            (rol, input, lienzo, objetivo)         ~13 líneas
    + STRATEGY BLOCK    solo el de SU categoría                4-11 líneas
    + CHECKLIST         campos compartidos + campos del eje
    + CRAFT             luz, encuadre, realismo, FINAL          ~28 líneas
```

Cambiar la regla de iluminación sigue siendo **un solo lugar**; cambiar las fases verbales no toca a los sustantivos.

**Archivo**: [`backend/api_main/src/infrastructure/ai/gemini_image_prompt.rs`](../backend/api_main/src/infrastructure/ai/gemini_image_prompt.rs) — `PromptCategory::detect()` + `build_system_prompt()`. El provider (`gemini_grpc_provider.rs::improve_prompt_for_image`) ya no lleva el prompt inline: llama al builder con la categoría ya limpia de `|ENGINE=`.

### Bloques por categoría

| Categoría | Protagonista del frame | Campos propios del checklist |
|---|---|---|
| Verbos / phrasal | La acción | `ACTION_PHASE` + fases + BANNED STOCK POSES |
| Sustantivos | El objeto | `OBJECT_OR_SITUATION` + días de la semana |
| Adjetivos | La cualidad | `QUALITY` (escala vs. propiedad discreta) |
| Adverbios | La manera | `HOST_ACTION` (acción anfitriona simple) |
| Preposiciones | La relación espacial | `FIGURE_AND_GROUND` |
| Pronombres / determinantes | Quién posee o recibe | `OWNER_OR_RECEIVER` |
| Conectores | La relación lógica | `FACT_A_AND_FACT_B` + `LOGICAL_RELATION` |
| Generic (fallback) | — | solo el mecanismo contrastivo |

Lo que **sí** comparten todas: `RIVAL_WORD` + `CONTRASTIVE_EVIDENCE` + `EVIDENCE_CARRIER` y el CONTRASTIVE TEST. El mecanismo es universal; solo cambia el eje.

### Tamaño por categoría

De ~93 líneas para todas, a 58-65 líneas de las cuales **todas son relevantes**:

| Categoría | Bloque propio | Total que lee la card |
|---|---|---|
| verbs | 10 | 64 |
| nouns | 11 | 65 |
| adjectives / adverbs / preposition / connectors | 6 | 60 |
| pronouns | 7 | 61 |

### Trampa de detección (cubierta por tests)

`PromptCategory::detect()` compara por substring porque los mazos personales llegan como namespace (`personal-verbs-email_coronado_gmail_com`). El **orden de las ramas es crítico** y ya causó un fallo real que atrapó el test: `adverbs` contiene `verb`, así que los adverbios se detectaban como verbos. También `pronouns` contiene `noun`. Las ramas específicas van primero; mover una hacia abajo rompe la detección en silencio.

Tests en el mismo archivo (7, todos verdes): detección por categoría, namespaces personales, phrasal→verbs, fallback genérico, y dos tests de aislamiento que verifican que el prompt de sustantivo **no** contenga `ACTION_PHASE`/`BANNED STOCK POSES` y que el de verbo **no** contenga las reglas de días de la semana ni de pronombres.

## Quinta Iteración: Momento de Enunciación vs. Momento Descrito

Detectado sobre una imagen real generada para **"Can you wake me up at 7 AM?"**: la escena salió **de día**, con luz de mañana.

El error es de otra naturaleza que el de las fases. La frase no describe a alguien despertándose: describe a alguien **pidiendo un favor antes de irse a dormir**. Ese pedido se pronuncia **de noche**, en pijama, con la ventana oscura. Las 7 AM son el momento *referido*, no el momento *vivido*.

El modelo estaba ilustrando el **contenido** de la oración en lugar de la **situación de habla**. Es una clase entera de frases:

| Frase | Se dice… | Error típico |
|---|---|---|
| "Can you wake me up at 7 AM?" | De noche, al acostarse | Sale de día |
| "See you tomorrow" | Hoy, al despedirse | Sale al día siguiente |
| "I'll call you later" | Ahora | Sale hablando por teléfono |
| "Did you sleep well?" | A la mañana, después | Sale durmiendo |
| "Don't forget your umbrella" | En la puerta, antes de salir | Sale bajo la lluvia |

### Cambios aplicados

- Nuevo campo compartido **`UTTERANCE_MOMENT`** en el checklist, resuelto justo después de `CORE_IDEA`: obliga a declarar la hora y el escenario del momento en que la frase **se dice**.
- Nueva regla en CRAFT: **MOMENT OF SPEAKING, NOT MOMENT DESCRIBED**. La hora, la luz, la ropa y el escenario deben corresponder a `UTTERANCE_MOMENT`. El tiempo *referido* puede aparecer solo como evidencia pequeña dentro de la escena presente — un despertador siendo puesto a las 7:00, un bolso ya preparado junto a la puerta — **nunca como el escenario mismo**.
- Regla complementaria: si la frase es pregunta, pedido, promesa u oferta, alguien debe estar **dirigiéndose visiblemente a otra persona**, y el favor pedido **todavía no ocurrió** (no mostrarlo como ya hecho).
- La línea `FINAL:` ahora exige declarar explícitamente la hora del día y la luz de `UTTERANCE_MOMENT`.

Cubierto por el test `every_category_carries_the_utterance_moment_rule` (aplica a todas las categorías, no solo verbos).

## Estado Conocido / Pendiente

- La copia abreviada del prompt en `gemini_landing_demo_prompts.rs` (`GEMINI_SYSTEM`, usada solo para las imágenes demo del landing) **no** incluye estas reglas. Las cards del landing son un set fijo y pequeño; sincronizar solo si aparece el mismo síntoma ahí.
- Las imágenes ya generadas antes de este cambio conservan la fase incorrecta: para corregirlas hay que **regenerarlas**, el cambio de prompt solo afecta generaciones nuevas.

### Fechas

- Primera iteración (regla en prosa): 24 de agosto de 2026.
- Segunda iteración (resolución de los tres conflictos): 24 de agosto de 2026.
