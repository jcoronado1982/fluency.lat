# Auditoría de contenido inglés → español

Fecha: 2026-07-13

Alcance: todos los JSON de `json/en_es`, ordenados por ruta y luego por posición dentro del archivo.

Método: validación estructural completa; cruce de cada par de ejemplos con `json/es_en` por contenido (nunca por índice); comprobación del idioma de títulos, significados, ejemplos y contextos; revisión manual de las alertas de categoría, gramática, duplicación y naturalidad. Las imágenes no se modificaron.

Normalización común: se retiró el marcador temporal de pronunciación, se eliminaron sufijos internos como `(def 2)` y se guardó `target_meaning_es` para que cada acepción conserve su traducción española específica. En la presentación inglés → español se ocultan las aclaraciones entre paréntesis del término y del audio; el contexto se conserva en los ejemplos y metadatos de cada acepción.

Resumen: 2462 tarjetas revisadas en 25 bloques; 152 tarjetas con corrección de contenido específica.

## Bloque 01: registros 1–100

Revisados: 100. Definiciones normalizadas: 109. Correcciones específicas: 1.

- Registro 43, `adjectives/1-basic/physical_state_and_condition.json#18`: par de ejemplos corregido

## Bloque 02: registros 101–200

Revisados: 100. Definiciones normalizadas: 101. Correcciones específicas: 0.

Resultado: no fue necesario cambiar frases, títulos ni categorías en este bloque.

## Bloque 03: registros 201–300

Revisados: 100. Definiciones normalizadas: 108. Correcciones específicas: 7.

- Registro 216, `adverbs/1-basic/manner_degree_quantity.json#9`: título «Demasiado / También» → «Demasiado»
- Registro 230, `adverbs/1-basic/place_direction.json#10`: par de ejemplos corregido
- Registro 234, `adverbs/1-basic/place_direction.json#14`: título «A la derecha / Correcto» → «A la derecha»
- Registro 276, `adverbs/3-advanced/degree_focus.json#1`: par de ejemplos corregido
- Registro 283, `adverbs/3-advanced/degree_focus_e_discourse_logic.json#2`: par de ejemplos corregido
- Registro 286, `adverbs/3-advanced/degree_focus_e_discourse_logic.json#5`: acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 295, `adverbs/3-advanced/discourse_logic.json#2`: acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido

## Bloque 04: registros 301–400

Revisados: 100. Definiciones normalizadas: 119. Correcciones específicas: 1.

- Registro 399, `connectors/3-advanced/formal_addition_clarification_e_formal_cause_effect.json#5`: par de ejemplos corregido

## Bloque 05: registros 401–500

Revisados: 100. Definiciones normalizadas: 107. Correcciones específicas: 4.

- Registro 403, `connectors/3-advanced/formal_cause_effect.json#2`: par de ejemplos corregido
- Registro 447, `determinant/1-basic/reference_and_selection.json#8`: par de ejemplos corregido
- Registro 451, `determinant/1-basic/reference_and_selection.json#12`: título «Cuál / Cuáles» → «Qué / Cuál»; par de ejemplos corregido
- Registro 488, `determinant/3-advanced/compound_and_partitive.json#7`: par de ejemplos corregido

## Bloque 06: registros 501–600

Revisados: 100. Definiciones normalizadas: 109. Correcciones específicas: 4.

- Registro 502, `nouns/1-basic/animals.json#7`: título «Oveja (singular y plural)» → «Oveja»
- Registro 526, `nouns/1-basic/body.json#6`: par de ejemplos corregido
- Registro 532, `nouns/1-basic/body.json#12`: par de ejemplos corregido
- Registro 570, `nouns/1-basic/calendar.json#18`: título «Fecha / Cita» → «Fecha»

## Bloque 07: registros 601–700

Revisados: 100. Definiciones normalizadas: 101. Correcciones específicas: 43.

- Registro 631, `nouns/1-basic/colors.json#11`: título «The color between red and yellow.» → «Naranja (color)»
- Registro 639, `nouns/1-basic/continents.json#0`: título «The largest continent.» → «Asia»
- Registro 640, `nouns/1-basic/continents.json#1`: título «A continent west of Asia.» → «Europa»
- Registro 641, `nouns/1-basic/continents.json#2`: título «A continent south of Europe.» → «África»
- Registro 642, `nouns/1-basic/continents.json#3`: título «A continent in the Northern Hemisphere.» → «América del Norte»
- Registro 643, `nouns/1-basic/continents.json#4`: título «A continent in the Western Hemisphere.» → «América del Sur»
- Registro 644, `nouns/1-basic/continents.json#5`: título «A region and continent grouping in the Pacific.» → «Oceanía»
- Registro 645, `nouns/1-basic/continents.json#6`: título «The continent around the South Pole.» → «Antártida»
- Registro 646, `nouns/1-basic/continents_e_day_parts.json#0`: título «The largest continent.» → «Asia»
- Registro 648, `nouns/1-basic/continents_e_day_parts.json#2`: título «A continent west of Asia.» → «Europa»
- Registro 650, `nouns/1-basic/continents_e_day_parts.json#4`: título «A continent south of Europe.» → «África»
- Registro 652, `nouns/1-basic/continents_e_day_parts.json#6`: título «A continent in the Northern Hemisphere.» → «América del Norte»
- Registro 654, `nouns/1-basic/continents_e_day_parts.json#8`: título «A continent in the Western Hemisphere.» → «América del Sur»
- Registro 655, `nouns/1-basic/continents_e_day_parts.json#9`: título «Around the middle of the day.» → «Mediodía»
- Registro 656, `nouns/1-basic/continents_e_day_parts.json#10`: título «A region and continent grouping in the Pacific.» → «Oceanía»
- Registro 657, `nouns/1-basic/continents_e_day_parts.json#11`: título «Twelve o'clock in the daytime.» → «Mediodía»
- Registro 658, `nouns/1-basic/continents_e_day_parts.json#12`: título «The continent around the South Pole.» → «Antártida»
- Registro 659, `nouns/1-basic/continents_e_day_parts.json#13`: título «Twelve o'clock at night.» → «Medianoche»
- Registro 661, `nouns/1-basic/countries.json#1`: título «A major country in North America.» → «Estados Unidos»
- Registro 662, `nouns/1-basic/countries.json#2`: título «A large country north of the United States.» → «Canadá»
- Registro 663, `nouns/1-basic/countries.json#3`: título «A country south of the United States.» → «México»
- Registro 664, `nouns/1-basic/countries.json#4`: título «The largest country in South America.» → «Brasil»
- Registro 665, `nouns/1-basic/countries.json#5`: título «A major country in South America.» → «Argentina»
- Registro 666, `nouns/1-basic/countries.json#6`: título «A country in the northwest of South America.» → «Colombia»
- Registro 667, `nouns/1-basic/countries.json#7`: título «A country on the western side of South America.» → «Perú»
- Registro 668, `nouns/1-basic/countries.json#8`: título «A country in southwestern Europe.» → «España»
- Registro 669, `nouns/1-basic/countries.json#9`: título «A country in Western Europe.» → «Francia»
- Registro 670, `nouns/1-basic/countries.json#10`: título «A central European country.» → «Alemania»
- Registro 671, `nouns/1-basic/countries.json#11`: título «A country in southern Europe.» → «Italia»
- Registro 672, `nouns/1-basic/countries.json#12`: título «An island country in northwestern Europe.» → «Reino Unido»
- Registro 673, `nouns/1-basic/countries.json#13`: título «A large country in East Asia.» → «China»
- Registro 674, `nouns/1-basic/countries.json#14`: título «An island country in East Asia.» → «Japón»
- Registro 675, `nouns/1-basic/countries.json#15`: título «A very large country across Europe and Asia.» → «Rusia»
- Registro 676, `nouns/1-basic/countries.json#16`: título «A major country in South Asia.» → «India»
- Registro 677, `nouns/1-basic/countries.json#17`: título «A country in East Asia.» → «Corea del Sur»
- Registro 678, `nouns/1-basic/countries.json#18`: título «A large country in Oceania.» → «Australia»
- Registro 679, `nouns/1-basic/countries.json#19`: título «A country in North Africa.» → «Egipto»
- Registro 680, `nouns/1-basic/countries.json#20`: título «A large country in West Africa.» → «Nigeria»
- Registro 681, `nouns/1-basic/countries.json#21`: título «A country at the southern end of Africa.» → «Sudáfrica»
- Registro 686, `nouns/1-basic/day_parts.json#4`: título «Around the middle of the day.» → «Mediodía»
- Registro 687, `nouns/1-basic/day_parts.json#5`: título «Twelve o'clock in the daytime.» → «Mediodía»
- Registro 688, `nouns/1-basic/day_parts.json#6`: título «Twelve o'clock at night.» → «Medianoche»
- Registro 700, `nouns/1-basic/economy_e_health.json#5`: título «A substance used to treat illness.» → «Medicina / Medicamento»

## Bloque 08: registros 701–800

Revisados: 100. Definiciones normalizadas: 106. Correcciones específicas: 8.

- Registro 702, `nouns/1-basic/economy_e_health.json#7`: título «A person receiving medical care.» → «Paciente»
- Registro 704, `nouns/1-basic/economy_e_health.json#9`: título «A condition of being sick.» → «Enfermedad»
- Registro 779, `nouns/1-basic/health.json#2`: título «A substance used to treat illness.» → «Medicina / Medicamento»
- Registro 780, `nouns/1-basic/health.json#3`: título «A person receiving medical care.» → «Paciente»
- Registro 781, `nouns/1-basic/health.json#4`: título «A condition of being sick.» → «Enfermedad»
- Registro 792, `nouns/1-basic/home_rooms.json#10`: título «The main room in a home for sitting and relaxing.» → «Sala / Sala de estar»
- Registro 793, `nouns/1-basic/home_rooms.json#11`: título «A room where people eat meals.» → «Comedor»
- Registro 794, `nouns/1-basic/home_rooms.json#12`: título «A place where a car is kept.» → «Garaje»

## Bloque 09: registros 801–900

Revisados: 100. Definiciones normalizadas: 102. Correcciones específicas: 12.

- Registro 801, `nouns/1-basic/household_items.json#6`: acepciones 3 → 2; par de ejemplos corregido; significado inglés corregido
- Registro 824, `nouns/1-basic/household_items.json#29`: título «A metal container used for cooking food.» → «Sartén»
- Registro 825, `nouns/1-basic/household_items.json#30`: título «A deep container used for cooking.» → «Olla»
- Registro 866, `nouns/1-basic/location.json#20`: título «A place where you can enter.» → «Entrada»
- Registro 867, `nouns/1-basic/location.json#21`: título «A way out of a place.» → «Salida»
- Registro 868, `nouns/1-basic/location.json#22`: título «The way something points or moves.» → «Dirección»
- Registro 886, `nouns/1-basic/materials_substances.json#6`: título «A substance or matter used to make things.» → «Material»
- Registro 887, `nouns/1-basic/materials_substances.json#7`: título «A metal made mostly of copper and tin.» → «Bronce»
- Registro 888, `nouns/1-basic/materials_substances.json#8`: título «A common strong metal.» → «Hierro»
- Registro 889, `nouns/1-basic/materials_substances.json#9`: título «A very strong metal made from iron.» → «Acero»
- Registro 890, `nouns/1-basic/materials_substances.json#10`: título «A reddish-brown metal.» → «Cobre»
- Registro 891, `nouns/1-basic/materials_substances.json#11`: título «A heavy radioactive metal.» → «Plutonio»

## Bloque 10: registros 901–1000

Revisados: 100. Definiciones normalizadas: 101. Correcciones específicas: 18.

- Registro 963, `nouns/1-basic/numbers.json#21`: título «The number 0.» → «Cero»
- Registro 964, `nouns/1-basic/numbers.json#22`: título «The number 100.» → «Cien»
- Registro 967, `nouns/1-basic/oceans_seas.json#2`: título «The largest ocean on Earth.» → «Océano Pacífico»
- Registro 968, `nouns/1-basic/oceans_seas.json#3`: título «The ocean between the Americas and Europe/Africa.» → «Océano Atlántico»
- Registro 969, `nouns/1-basic/oceans_seas.json#4`: título «The ocean between Africa, Asia, and Australia.» → «Océano Índico»
- Registro 970, `nouns/1-basic/oceans_seas.json#5`: título «The ocean around the North Pole.» → «Océano Ártico»
- Registro 971, `nouns/1-basic/oceans_seas.json#6`: título «The ocean surrounding Antarctica.» → «Océano Austral»
- Registro 972, `nouns/1-basic/oceans_seas.json#7`: título «A sea between Europe, Africa, and Asia.» → «Mar Mediterráneo»
- Registro 973, `nouns/1-basic/oceans_seas.json#8`: título «A sea in the Caribbean region.» → «Mar Caribe»
- Registro 974, `nouns/1-basic/oceans_seas.json#9`: título «A sea between Africa and Asia.» → «Mar Rojo»
- Registro 975, `nouns/1-basic/oceans_seas.json#10`: título «A sea between Eastern Europe and Western Asia.» → «Mar Negro»
- Registro 976, `nouns/1-basic/oceans_seas.json#11`: título «A sea between Great Britain and northern Europe.» → «Mar del Norte»
- Registro 977, `nouns/1-basic/oceans_seas.json#12`: título «A sea in the northwest Indian Ocean.» → «Mar Arábigo»
- Registro 978, `nouns/1-basic/oceans_seas.json#13`: título «A sea in Northern Europe.» → «Mar Báltico»
- Registro 997, `nouns/1-basic/personal_items.json#7`: título «Lenses worn to help someone see.» → «Gafas / Lentes»
- Registro 998, `nouns/1-basic/personal_items.json#8`: título «A bag carried on the back.» → «Mochila»
- Registro 999, `nouns/1-basic/personal_items.json#9`: título «A device worn on the ears to listen to sound.» → «Audífonos / Auriculares»
- Registro 1000, `nouns/1-basic/personal_items.json#10`: título «An official document for international travel.» → «Pasaporte»

## Bloque 11: registros 1001–1100

Revisados: 100. Definiciones normalizadas: 115. Correcciones específicas: 7.

- Registro 1035, `nouns/1-basic/school.json#1`: acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 1052, `nouns/1-basic/school.json#18`: título «A book of blank pages for writing notes.» → «Cuaderno»
- Registro 1053, `nouns/1-basic/school.json#19`: título «An object used to remove pencil marks.» → «Borrador / Goma de borrar»
- Registro 1054, `nouns/1-basic/school.json#20`: título «A straight tool used for measuring or drawing lines.» → «Regla»
- Registro 1064, `nouns/1-basic/social_customs.json#3`: título «The yearly anniversary of a person's birth.» → «Cumpleaños»
- Registro 1065, `nouns/1-basic/social_customs.json#4`: título «A ceremony where two people get married.» → «Boda»
- Registro 1066, `nouns/1-basic/social_customs.json#5`: título «A special day of celebration or rest.» → «Día festivo / Festividad»

## Bloque 12: registros 1101–1200

Revisados: 100. Definiciones normalizadas: 107. Correcciones específicas: 1.

- Registro 1120, `nouns/1-basic/technology.json#10`: par de ejemplos corregido

## Bloque 13: registros 1201–1300

Revisados: 100. Definiciones normalizadas: 108. Correcciones específicas: 1.

- Registro 1270, `nouns/2-intermediate/goals_plans.json#4`: título «Arreglo / Plan» → «Plan / Acuerdo»; par de ejemplos corregido

## Bloque 14: registros 1301–1400

Revisados: 100. Definiciones normalizadas: 115. Correcciones específicas: 3.

- Registro 1308, `nouns/2-intermediate/location_e_logic_reasoning.json#3`: par de ejemplos corregido
- Registro 1316, `nouns/2-intermediate/logic_reasoning.json#1`: par de ejemplos corregido
- Registro 1398, `nouns/2-intermediate/process_change.json#6`: par de ejemplos corregido

## Bloque 15: registros 1401–1500

Revisados: 100. Definiciones normalizadas: 104. Correcciones específicas: 2.

- Registro 1426, `nouns/2-intermediate/process_change.json#34`: significado inglés corregido
- Registro 1449, `nouns/2-intermediate/science.json#7`: título «Bacteria (plural)» → «Bacterias (plural; singular: bacteria)»

## Bloque 16: registros 1501–1600

Revisados: 100. Definiciones normalizadas: 107. Correcciones específicas: 0.

Resultado: no fue necesario cambiar frases, títulos ni categorías en este bloque.

## Bloque 17: registros 1601–1700

Revisados: 100. Definiciones normalizadas: 115. Correcciones específicas: 0.

Resultado: no fue necesario cambiar frases, títulos ni categorías en este bloque.

## Bloque 18: registros 1701–1800

Revisados: 100. Definiciones normalizadas: 127. Correcciones específicas: 6.

- Registro 1710, `nouns/3-advanced/science_e_society.json#3`: título «Multa / Castigo / Penal» → «Sanción / Multa / Castigo»
- Registro 1731, `nouns/3-advanced/society.json#2`: título «Multa / Castigo / Penal» → «Sanción / Multa / Castigo»
- Registro 1766, `nouns/3-advanced/structure_components.json#2`: par de ejemplos corregido
- Registro 1772, `nouns/3-advanced/structure_components_e_work.json#4`: par de ejemplos corregido
- Registro 1788, `phrasal_verbs/1-basic/daily_life_home.json#4`: par de ejemplos corregido
- Registro 1794, `phrasal_verbs/1-basic/daily_life_home.json#10`: acepciones 3 → 2; par de ejemplos corregido; significado inglés corregido

## Bloque 19: registros 1801–1900

Revisados: 100. Definiciones normalizadas: 173. Correcciones específicas: 1.

- Registro 1887, `phrasal_verbs/2-intermediate/complex_actions_e_movement_transport.json#9`: par de ejemplos corregido

## Bloque 20: registros 1901–2000

Revisados: 100. Definiciones normalizadas: 135. Correcciones específicas: 8.

- Registro 1911, `phrasal_verbs/2-intermediate/movement_transport.json#4`: par de ejemplos corregido
- Registro 1913, `phrasal_verbs/2-intermediate/relationships_care.json#0`: par de ejemplos corregido
- Registro 1940, `phrasal_verbs/3-advanced/change_action.json#3`: par de ejemplos corregido
- Registro 1942, `phrasal_verbs/3-advanced/change_action.json#5`: par de ejemplos corregido
- Registro 1950, `phrasal_verbs/3-advanced/change_action_e_conflict_resistance.json#6`: par de ejemplos corregido
- Registro 1954, `phrasal_verbs/3-advanced/change_action_e_conflict_resistance.json#10`: par de ejemplos corregido
- Registro 1986, `phrasal_verbs/3-advanced/reasoning_meaning_e_social_outcomes.json#9`: par de ejemplos corregido
- Registro 1993, `phrasal_verbs/3-advanced/social_outcomes.json#4`: par de ejemplos corregido

## Bloque 21: registros 2001–2100

Revisados: 100. Definiciones normalizadas: 119. Correcciones específicas: 9.

- Registro 2001, `preposition/1-basic/direction_and_movement.json#6`: par de ejemplos corregido
- Registro 2080, `pronouns/1-basic/interrogative_pronouns.json#2`: título «¿Cuál / Cuáles?» → «Qué / Cuál / Que»; par de ejemplos corregido
- Registro 2085, `pronouns/1-basic/interrogative_pronouns_e_object_pronouns.json#4`: título «¿Cuál / Cuáles?» → «Qué / Cuál / Que»; par de ejemplos corregido
- Registro 2088, `pronouns/1-basic/interrogative_pronouns_e_object_pronouns.json#7`: título «Tú / Usted / Ustedes (Sujeto)» → «Te / Lo / La / Le / A ti / A usted(es)»; grupo «Subject» → «Objeto»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2089, `pronouns/1-basic/interrogative_pronouns_e_object_pronouns.json#8`: título «(Sujeto neutro) / Ello» → «Lo / La»; grupo «Subject» → «Objeto»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2090, `pronouns/1-basic/interrogative_pronouns_e_object_pronouns.json#9`: título «La / Le / A ella (Objeto)» → «La / Le / A ella»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2095, `pronouns/1-basic/object_pronouns.json#4`: título «Tú / Usted / Ustedes (Sujeto)» → «Te / Lo / La / Le / A ti / A usted(es)»; grupo «Subject» → «Objeto»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2096, `pronouns/1-basic/object_pronouns.json#5`: título «(Sujeto neutro) / Ello» → «Lo / La»; grupo «Subject» → «Objeto»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2097, `pronouns/1-basic/object_pronouns.json#6`: título «La / Le / A ella (Objeto)» → «La / Le / A ella»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido

## Bloque 22: registros 2101–2200

Revisados: 100. Definiciones normalizadas: 123. Correcciones específicas: 10.

- Registro 2103, `pronouns/1-basic/possessive_adjectives.json#5`: título «La / Le / A ella (Objeto)» → «Su / Sus (de ella)»; grupo «Objeto» → «Posesivo (Adjetivo)»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2104, `pronouns/1-basic/possessive_adjectives.json#6`: título «Su / Sus (de él) (Determinante)» → «Su / Sus (de él)»; grupo «Posesivo (Pronombre)» → «Posesivo (Adjetivo)»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2115, `pronouns/1-basic/possessive_adjectives_e_subject_pronouns.json#10`: título «La / Le / A ella (Objeto)» → «Su / Sus (de ella)»; grupo «Objeto» → «Posesivo (Adjetivo)»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2116, `pronouns/1-basic/possessive_adjectives_e_subject_pronouns.json#11`: título «Tú / Usted / Ustedes (Sujeto)» → «Tú / Usted / Ustedes»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2117, `pronouns/1-basic/possessive_adjectives_e_subject_pronouns.json#12`: título «Su / Sus (de él) (Determinante)» → «Su / Sus (de él)»; grupo «Posesivo (Pronombre)» → «Posesivo (Adjetivo)»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2118, `pronouns/1-basic/possessive_adjectives_e_subject_pronouns.json#13`: tarjeta de sujeto inglés “it” eliminada: el español omite ese pronombre impersonal
- Registro 2124, `pronouns/1-basic/subject_pronouns.json#5`: título «Tú / Usted / Ustedes (Sujeto)» → «Tú / Usted / Ustedes»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2125, `pronouns/1-basic/subject_pronouns.json#6`: tarjeta de sujeto inglés “it” eliminada: el español omite ese pronombre impersonal
- Registro 2139, `pronouns/2-intermediate/demonstrative_pronouns_e_possessive_pronouns_and_emphasis.json#9`: título «Su / Sus (de él) (Determinante)» → «Suyo / Suya / Suyos / Suyas (de él)»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido
- Registro 2146, `pronouns/2-intermediate/possessive_pronouns_and_emphasis.json#5`: título «Su / Sus (de él) (Determinante)» → «Suyo / Suya / Suyos / Suyas (de él)»; acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido

## Bloque 23: registros 2201–2300

Revisados: 100. Definiciones normalizadas: 194. Correcciones específicas: 3.

- Registro 2211, `verbs/1-basic/action.json#4`: par de ejemplos corregido
- Registro 2240, `verbs/1-basic/being_state.json#1`: título «Vivir (residir)» → «Vivir»
- Registro 2263, `verbs/1-basic/movement.json#0`: acepciones 2 → 1; par de ejemplos corregido; significado inglés corregido

## Bloque 24: registros 2301–2400

Revisados: 100. Definiciones normalizadas: 195. Correcciones específicas: 2.

- Registro 2357, `verbs/2-intermediate/feelings_e_possession_exchange.json#3`: par de ejemplos corregido
- Registro 2370, `verbs/2-intermediate/possession_exchange.json#1`: par de ejemplos corregido

## Bloque 25: registros 2401–2462

Revisados: 62. Definiciones normalizadas: 62. Correcciones específicas: 1.

- Registro 2402, `verbs/3-advanced/action.json#5`: par de ejemplos corregido
