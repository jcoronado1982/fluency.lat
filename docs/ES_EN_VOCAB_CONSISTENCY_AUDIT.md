# Auditoría de consistencia gramatical y duplicados — `json/es_en`

Fecha: 2026-07-27

Alcance: las 9 categorías de `json/es_en` (`adjectives`, `adverbs`, `connectors`, `determinant`,
`nouns`, `phrasal_verbs`, `preposition`, `pronouns`, `verbs`). No se tocó `json/en_es` (ver nota
al final) ni ningún otro par de idiomas.

Método: script versionado [`scripts/audit-es-en-vocab-consistency.mjs`](../scripts/audit-es-en-vocab-consistency.mjs)
(dry-run por defecto, `--fix` aplica los duplicados exactos 100% seguros) + dos herramientas de
renumeración puntual creadas para esta pasada —
[`scripts/renumber-es-en-deck.mjs`](../scripts/renumber-es-en-deck.mjs) (borra tarjetas de un
mazo y renombra las imágenes de las que quedan) y
[`scripts/strip-es-en-definition.mjs`](../scripts/strip-es-en-definition.mjs) (borra UNA
`definition` redundante dentro de una tarjeta y renombra sus imágenes) — + revisión manual de
cada candidato señalado (no se leyeron las ~2.230 tarjetas una por una; se leyeron a mano las que
la detección mecánica marcó como sospechosas). Los archivos fusionados `*_e_*.json` se excluyeron
del análisis por ser uniones literales de dos mazos ya existentes del mismo nivel (verificado
programáticamente: las 43 uniones coinciden con la suma exacta de sus dos archivos fuente).

Base: 2.228 tarjetas canónicas → 2.212 después de esta pasada (213 archivos, sin contar los 43
fusionados).

## Regla de seguridad aplicada

El `imagePath`/audio de cada tarjeta se genera con `{deck}_card_{índice}_def{n}`
(`backend/mod_flashcards/src/image_use_cases.rs::global_image_base`), donde el índice es la
**posición en el array del JSON**, no un id estable — y el progreso de usuarios reales en
SurrealDB (`card_progress`) se guarda por esa misma posición (`card_index` en
`backend/core/src/ports/db_repository.rs`). El audio, en cambio, se nombra por el **contenido del
texto** (`legacy_audio_prefixes` en `backend/mod_flashcards/src/audio_use_cases.rs`), no por
posición, así que no se ve afectado por reordenar tarjetas.

Por eso, cada borrado de tarjeta o de `definition` en esta pasada fue acompañado de una
renumeración física: las imágenes de las tarjetas/definiciones que quedan después de la posición
borrada se renombraron en disco (`card_images/`) para seguir coincidiendo con su nueva posición.
Esto se hizo con las dos herramientas mencionadas arriba, verificando en cada archivo que el
conteo de imágenes renombradas coincidiera con lo esperado. **No se tocó `card_progress` en
SurrealDB** — no hay acceso a la base de datos de producción desde esta sesión; si estos mazos ya
tienen progreso real de usuarios, queda desalineado para las tarjetas que cambiaron de posición
hasta que se sincronice (ver nota final).

## 1. Aplicado en esta pasada

### 1.1 Duplicados exactos borrados (mismo sentido, redundante)

| Categoría | Palabra | Se borró de | Se conserva en |
|---|---|---|---|
| nouns | middle | `nouns/1-basic/process_change.json` | `nouns/1-basic/location.json#18` |
| nouns | orange | `nouns/1-basic/food_drink.json#19` | `nouns/1-basic/colors.json#11` |
| nouns | medicine | `nouns/2-intermediate/health.json#0` | `nouns/1-basic/health.json#2` |
| nouns | patient | `nouns/2-intermediate/health.json#3` | `nouns/1-basic/health.json#3` |
| nouns | illness | `nouns/2-intermediate/health.json#4` | `nouns/1-basic/health.json#4` |
| nouns | garage | `nouns/2-intermediate/places.json#10` | `nouns/1-basic/home_rooms.json#12` |
| nouns | entrance | `nouns/2-intermediate/places.json#12` | `nouns/1-basic/location.json#20` |
| nouns | direction | `nouns/2-intermediate/location.json#1` | `nouns/1-basic/location.json#22` |
| nouns | steel | `nouns/2-intermediate/materials_substances.json#0` | `nouns/1-basic/materials_substances.json#9` |
| nouns | cloud | `nouns/2-intermediate/technology.json#10` | `nouns/1-basic/nature.json#26` |
| nouns | hundred | `nouns/2-intermediate/numbers.json#7` | `nouns/1-basic/numbers.json#22` |
| nouns | passport | `nouns/2-intermediate/transport.json#16` | `nouns/1-basic/personal_items.json#10` |
| pronouns | his | `pronouns/2-intermediate/possessive_pronouns_and_emphasis.json#5` | `pronouns/1-basic/possessive_adjectives.json` (copia byte-idéntica, 2 `definitions`) |

`medicine`, `patient` e `illness` ya estaban compensados del lado `en_es` (ver
`translatedDescriptionNames` en `scripts/audit-en-es-content.mjs`), pero la duplicación real
vivía aquí y no estaba corregida.

### 1.2 Tarjetas mal ubicadas dentro de `pronouns` (contenido de sujeto/objeto en el mazo equivocado)

`object_pronouns.json` tenía dos tarjetas de contenido de **sujeto** que no le correspondían
(`you`: "(Sujeto)"/"You are my friend."; `it`: "(Sujeto neutro)"/"It is cold outside."),
duplicando exactamente lo que ya existía, bien ubicado, en `subject_pronouns.json`.
`possessive_adjectives.json` tenía una tarjeta de contenido de **objeto** que no le correspondía
(`her`: "(Objeto)"/"I know her."), duplicando lo que ya existía en `object_pronouns.json`. Se
borraron las tres copias mal ubicadas, conservando las copias correctamente ubicadas:

| Palabra | Se borró de (mal ubicada) | Se conserva en (bien ubicada) |
|---|---|---|
| you | `pronouns/1-basic/object_pronouns.json#4` | `pronouns/1-basic/subject_pronouns.json#5` |
| it | `pronouns/1-basic/object_pronouns.json#5` | `pronouns/1-basic/subject_pronouns.json#6` |
| her | `pronouns/1-basic/possessive_adjectives.json#5` | `pronouns/1-basic/object_pronouns.json#6` |

### 1.3 Definiciones redundantes borradas dentro de una tarjeta (no se borró la tarjeta completa)

Al revisar a mano el hallazgo original de §4 ("pronombre que es en realidad determinante"), se
encontró que **no eran tarjetas completas mal clasificadas**: cada una ya tenía una segunda
`definition` con sentido genuino de pronombre (standalone, sin sustantivo después) — la tarjeta
completa sí pertenece a `pronouns`, pero cargaba además una `definition` redundante que duplicaba
literalmente el contenido de `determinant`. Se borró solo esa `definition` sobrante en cada caso,
conservando la definición de pronombre genuina:

| Categoría | Palabra | Archivo | `definition` borrada (duplicaba `determinant`) | `definition` que queda |
|---|---|---|---|---|
| pronouns | both | `pronouns/1-basic/quantifier_pronouns.json#1` | "Ambos/as (Determinante)" — "Both parents are here." | "Ambos/as (Pronombre)" — "Both are correct." |
| pronouns | many | `pronouns/1-basic/quantifier_pronouns.json#2` | "Muchos/as (Determinante)" — "I have many friends." | "Muchos/as (Pronombre)" — "Many are called, but few are chosen." |
| pronouns | few | `pronouns/2-intermediate/quantifier_pronouns.json#0` | "Pocos/as (Determinante)" — "He has few friends." | "Pocos/as (Pronombre)" — "Many tried, but few succeeded." |
| pronouns | several | `pronouns/2-intermediate/quantifier_pronouns.json#1` | "Varios/as (Determinante)" — "He made several mistakes." | "Varios/as (Pronombre)" — "Several of them are broken." |
| pronouns | either | `pronouns/2-intermediate/quantifier_pronouns.json#2` | "Cualquiera (Determinante)" — "You can take either road." | "Cualquiera (Pronombre)" — "Which one do you want? Either is fine." |
| pronouns | neither | `pronouns/2-intermediate/quantifier_pronouns.json#3` | "Ninguno (Determinante)" — "Neither answer is correct." | "Ninguno (Pronombre)" — "Neither is correct." |
| pronouns | his | `pronouns/1-basic/possessive_adjectives.json#5` | "Su/Sus (de él) (Determinante)" — "That is his car." | "Suyo/Suyos (de él) (Pronombre)" — "The red car is his." |
| connectors | then | `connectors/1-basic/time_and_sequence.json#4` | "Entonces / En ese caso" — "If you are hungry, then you should eat." (duplicaba `cause_effect_basics.json#4`) | "Luego / Después" — "First I work, then I rest." (sentido temporal, propio de este mazo) |

Con esto, ninguna tarjeta de `pronouns` conserva una `definition` cuya frase demuestre uso de
determinante — cada palabra que legítimamente funciona como determinante Y como pronombre (el
inglés no distingue la forma en `both/many/few/several/either/neither/his`) ahora vive con su
sentido de determinante en `determinant` y su sentido de pronombre (frase standalone, sin
sustantivo después) en `pronouns`, sin repetir la misma frase en los dos lados.

### 1.4 Ejemplo reescrito (sin borrar ni mover de categoría)

| Categoría | Palabra | Archivo | Antes | Después |
|---|---|---|---|---|
| nouns | one | `nouns/1-basic/numbers.json#1` | "I have one brother." (uso de determinante/numeral, no de sustantivo) | "One plus one is two." (uso genuino de sustantivo/numeral independiente) |

La imagen ya generada para esta tarjeta corresponde al ejemplo anterior y quedará desactualizada
hasta que se regenere por el flujo normal de administración (`POST /api/generate-image`) — no es
un problema nuevo, es el mismo camino que ya usa cualquier corrección de texto.

## 2. Verificación

- Los 213 archivos canónicos de `json/es_en` siguen siendo JSON válido (`json.load` sobre cada
  uno, sin errores).
- Re-ejecutar `node scripts/audit-es-en-vocab-consistency.mjs` después de esta pasada reporta:
  `safeRemovals: 0` (ya no queda ningún duplicado exacto por aplicar), `crossCategoryDuplicates:
  93` (sin cambios — sigue siendo polisemia legítima), `heuristicCandidates: 4` (sin cambios,
  falsos positivos ya confirmados), `pendingDuplicates: 1` — ver nota abajo.
- **`pendingDuplicates` restante ("then")**: el script todavía reporta que la palabra "then"
  aparece dos veces dentro de `connectors` (una tarjeta en `cause_effect_basics.json`, otra en
  `time_and_sequence.json`). Esto es intencional y correcto, no un bug: cada tarjeta demuestra
  ahora un sentido distinto y ya no se solapan (lógico/condicional vs. secuencia temporal),
  organizados en el mazo temático que corresponde a cada uno — el detector de duplicados exactos
  del script compara solo por nombre, no por sentido, así que no puede distinguir este caso de un
  duplicado real; se deja anotado aquí en vez de ajustar el script para un solo caso.
- `git status --short json/es_en card_images` muestra exactamente 16 archivos JSON modificados y
  120 archivos de imagen tocados (95 renombradas/`M`, 24 vacantes al final de su mazo/`D`, 1 que
  git reporta como nueva por no detectar el rename en el modo `--short`) — todas las imágenes
  "borradas" son las que quedaron sin tarjeta sucesora al final de un mazo que se achicó; no hay
  archivos `.migrating-*` residuales (verificado).

## 3. Duplicados entre categorías (permitido por la regla — revisado a mano, sin cambios)

93 palabras aparecen en 2+ categorías. Se revisaron las 93 a mano; salvo los 9 casos ya corregidos
en §1.3/§1.4, el resto (84) es polisemia gramatical real y legítima en inglés (`work`/`love`/
`cost` como sustantivo y verbo; `this`/`many`/`few` como determinante y pronombre; `fast`/`hard`/
`early` como adjetivo y adverbio) con la frase correcta en cada categoría — sin acción. Lista
completa: campo `crossCategoryDuplicates` de `node scripts/audit-es-en-vocab-consistency.mjs`.

**Heurísticas de "categoría equivocada" (baratas, basadas en patrones)**: se probaron 3
heurísticas mecánicas (artículo/posesivo inglés antes de la palabra en `verbs`/`phrasal_verbs`;
`meaning` en español que es un infinitivo suelto en `nouns`; `meaning` que empieza con artículo en
`adjectives`/`adverbs`). Solo la heurística de `nouns` produjo candidatos (4), y los 4 son falsos
positivos confirmados a mano: `thumb`→"Pulgar", `sugar`→"Azúcar", `pleasure`→"Placer",
`cancer`→"Cáncer" — sustantivos españoles que terminan en "-ar"/"-er" por coincidencia, no verbos
mal clasificados.

## 4. Pendiente (fuera de alcance de esta pasada)

- **`card_progress` en SurrealDB**: si alguno de los 15 mazos tocados ya tiene progreso real de
  usuarios en producción, las tarjetas que cambiaron de posición quedan desalineadas hasta migrar
  esa tabla — no accesible desde esta sesión. Los archivos `json/` y `card_images/` locales están
  desacoplados del despliegue (se sincronizan al servidor real con pasos explícitos, ver
  `scripts/sync_json_to_oracle.skill.md` / `sync_images_to_oracle.skill.md`), así que este cambio
  no llega a producción hasta un sync deliberado — dejar esta nota disponible para quien lo haga.
- **Sincronizar `json/en_es`**: es un espejo derivado de `es_en`, auditado por
  `scripts/audit-en-es-content.mjs` (cruza por contenido, no por índice — no se ve afectado por
  las renumeraciones de esta pasada). No se tocó en esta pasada; conviene correr ese script para
  detectar si alguno de los 16 pares borrados/reescritos aquí tiene una copia huérfana del lado
  `en_es`.
