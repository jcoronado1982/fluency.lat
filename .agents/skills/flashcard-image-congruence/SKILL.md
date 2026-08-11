---
name: flashcard-image-congruence
description: Verifica y repara que cada frase de flashcards (json/es_en, json/en_es, json/es_de) cargue la imagen que realmente le corresponde. Usar cuando el usuario reporte "la imagen no corresponde a la frase", "carga la imagen equivocada", "no carga imagen en un idioma pero sí en otro", al agregar una dirección de curso nueva, o antes/después de editar contenido de json/ que toque varias palabras de un mismo mazo.
---

# Congruencia imagen-frase en flashcards

Las imágenes se comparten entre `es_en`/`en_es`/`es_de` por **posición** (mismo
`category/deck/índice/def_index`), no por significado — ver `docs/modules/flashcards.md` §"Direcciones
de curso soportadas". Si un mazo en otra dirección tiene más o menos palabras que `es_en`, o las
palabras están en distinto orden, la imagen de una palabra le queda pegada a otra por accidente de
posición. Este skill es el flujo determinístico (test + reparación) para encontrar y corregir eso
**sin generar ninguna imagen nueva**, reutilizando lo que ya existe.

## Paso 1 — Correr el test (sin IA, tarda segundos)

```bash
python3 scripts/check_flashcard_images.py
```

Escribe `scripts/flashcard_image_report.json` y muestra un resumen por tipo de hallazgo:
- `IMAGE_MISSING` / `IMAGE_FILE_NOT_FOUND` / `IMAGE_MISMATCH_VS_BASELINE`: bugs corregibles
  reasignando la ruta correcta — el paso 2 los arregla solo.
- `WORD_COUNT_MISMATCH` / `WORD_MISALIGNED` / `DEF_COUNT_MISMATCH`: el mazo tiene distinta
  cantidad de palabras/sentidos que `es_en` — el paso 2 intenta resolverlos reutilizando imágenes
  existentes; lo que quede es contenido genuinamente nuevo sin imagen posible.
- `IMAGE_MISSING_NO_BASELINE`: mazos que solo existen en una dirección, sin par en `es_en`.

Es rápido (recorre JSON + `os.path.exists`, nada de red ni IA) — no hace falta lanzarlo en
background ni esperar confirmación del usuario para verlo terminar.

## Paso 2 — Reparar reutilizando imágenes existentes

```bash
python3 scripts/fix_flashcard_image_congruence.py --dry-run   # ver qué cambiaría, sin escribir
python3 scripts/fix_flashcard_image_congruence.py             # aplicar
```

Hace, en orden, y **solo estas tres acciones** (nunca llama a ningún generador de imágenes):
1. **Reparación por alineación**: si la palabra coincide en concepto con `es_en` en la misma
   posición pero el `imagePath` está vacío o apuntando mal, lo restaura al de `es_en`.
2. **Reutilización por significado**: si la posición no alinea (mazo con palabras de más/menos),
   busca si el mismo concepto ya tiene imagen generada en otro punto de `es_en` (mismo archivo
   primero, luego mismo `category/nivel` en todo el corpus) y la reutiliza.
3. **Vaciado de imagen robada**: si una palabra es contenido nuevo que no existe en ningún lado de
   `es_en`, y su `imagePath` actual resulta ser el de OTRO concepto vecino (heredado por accidente
   de posición), lo vacía (`""`) en vez de dejarla mostrando algo incorrecto.

Después de correrlo: `git diff -- json/` para confirmar que **solo se tocó el campo `imagePath`**
(si el diff toca `meaning`/`usage_context_en`/`usage_context_es`, algo salió mal — esos campos son
el ancla compartida entre direcciones y no se deben modificar); validar JSON con
`python3 -m json.tool <archivo>` sobre cada archivo tocado.

## Paso 3 — Lo que queda después de los pasos 1-2

Si `check_flashcard_images.py` sigue reportando cosas, ya no son bugs de sincronización — son
casos donde el concepto **genuinamente no existe** en ningún punto de `es_en` para reutilizar.
Ahí las únicas opciones reales son: (a) generar una imagen nueva
(`POST /api/generate-image` o `scripts/batch-images.sh`, ver `docs/modules/media-generation.md`),
o (b) quitar la palabra del mazo si no debería estar. **Ninguna de las dos se decide sola** — es
una decisión de contenido del usuario, preguntar antes de generar o de borrar una palabra de un
mazo (la regla de "no borrar sin autorización" de `CLAUDE.md` aplica igual a contenido `json/`).

## Contexto de la auditoría original (jul 2026)

Primera corrida completa: 149 archivos / ~1080 líneas de `imagePath` corregidas reutilizando
imágenes existentes, 33 casos de "imagen robada" vaciados, 0 imágenes nuevas generadas. Quedaron
~98 archivos (`es_de` y sobre todo `en_es`) con mazos de distinto tamaño que `es_en` — contenido
nunca completado o palabras insertadas sin imagen propia — pendientes de la decisión de (a) o (b)
de arriba. Detalle completo en `docs/modules/flashcards.md` §"Auditoría de congruencia imagen-frase".
