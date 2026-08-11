# 🖼️ Skill: Congruencia imagen-frase en flashcards

> **Ubicación Canónica:** [`.agents/skills/flashcard-image-congruence/SKILL.md`](../.agents/skills/flashcard-image-congruence/SKILL.md)

Verifica y repara que cada frase de `json/es_en`/`json/en_es`/`json/es_de` cargue la imagen que
realmente le corresponde (las imágenes se comparten por posición entre direcciones de curso, no
por significado — un mazo con más o menos palabras que `es_en` hace que la imagen de una palabra
quede pegada a otra por accidente).

## Comando rápido

```bash
python3 scripts/check_flashcard_images.py                     # test determinístico, sin IA
python3 scripts/fix_flashcard_image_congruence.py --dry-run   # ver qué repararía
python3 scripts/fix_flashcard_image_congruence.py             # aplicar (reutiliza imágenes existentes, nunca genera)
```

Detalle completo del método (qué hace cada paso, cuándo se considera "genuinamente sin imagen
posible" y qué hacer ahí) en el SKILL canónico de arriba y en
[`docs/modules/flashcards.md`](../docs/modules/flashcards.md) §"Auditoría de congruencia imagen-frase".
