---
name: user-study-progress
description: Consulta el progreso real de estudio del usuario (palabras aprendidas con check ✓ vs palabras pendientes ❌) directamente desde la Base de Datos SurrealDB en producción para cualquier categoría (verbs, nouns, adjectives, etc.) y nivel (Básico, Intermedio, Avanzado).
---

# 📊 Skill: Consulta de Progreso Real de Estudio (Fluency)

Este skill permite a cualquier agente de IA consultar **con exactitud matemática** el progreso de aprendizaje de un usuario en Fluency, reportando cuántas palabras se sabe (con check ✓), cuántas le faltan por aprender y el porcentaje de avance por nivel y categoría.

---

## ⚠️ Regla de Oro
* **PROHIBIDO** contar `"learned": true` en los archivos `.json` de Git para saber el progreso del usuario (esos archivos son plantillas estáticas y darán datos erróneos).
* **OBLIGATORIO** ejecutar el script `scripts/get_user_study_progress.py` que consulta la base de datos real de producción (SurrealDB en GCP).

---

## 🎯 Cuándo utilizar este skill
* El usuario pregunta: *"¿Cuántas me sé?", "¿Cuántos verbos me sé?", "¿Cuántos sustantivos llevo?", "¿Cuánto me falta en básico/intermedio/avanzado?", "¿Qué avance tengo?"*.
* El usuario pide: *"Evalúame", "Hazme un examen de las que me faltan", "Tómame una prueba", "Ponme ejercicios de las palabras pendientes"*.
  - **En este caso:** La IA debe ejecutar `scripts/export_ai_study_prompt.py` internamente para consultar la BD, obtener las palabras aprendidas y pendientes del usuario, y **generar el examen / evaluación directamente en el chat** sin pedirle al usuario que copie o busque nada.
* Se necesita una auditoría exacta de las tarjetas marcadas con check (`learned: true`) versus las tarjetas totales del catálogo.

---

## 🚀 Comandos de Ejecución

### 1. Consultar Verbos (por defecto):
```bash
python3 /home/jcoronado/Desktop/dev/flashcard/scripts/get_user_study_progress.py --category verbs
```

### 2. Consultar Sustantivos (`nouns`):
```bash
python3 /home/jcoronado/Desktop/dev/flashcard/scripts/get_user_study_progress.py --category nouns
```

### 3. Consultar Cualquier Otra Categoría (`adjectives`, `adverbs`, `phrasal_verbs`, etc.):
```bash
python3 /home/jcoronado/Desktop/dev/flashcard/scripts/get_user_study_progress.py --category adjectives
```

### 4. Consultar el Resumen Global de TODO el catálogo:
```bash
python3 /home/jcoronado/Desktop/dev/flashcard/scripts/get_user_study_progress.py --category all
```

### 5. Consultar para otro usuario específico:
```bash
python3 /home/jcoronado/Desktop/dev/flashcard/scripts/get_user_study_progress.py --user otro_usuario@gmail.com --category verbs
```

---

## 🤖 Exportación de Prompts para Evaluar / Estudiar con Otras IAs

Para generar un **Prompt Maestro** que evalúe las palabras aprendidas vs pendientes en ChatGPT, Claude o Gemini:

```bash
# 1. Generar un Quiz de 10 preguntas con las palabras pendientes:
python3 /home/jcoronado/Desktop/dev/flashcard/scripts/export_ai_study_prompt.py --category verbs --mode quiz

# 2. Diagnóstico de nivel y brechas de vocabulario:
python3 /home/jcoronado/Desktop/dev/flashcard/scripts/export_ai_study_prompt.py --category all --mode eval

# 3. Historia inmersiva (80% aprendidas + 20% pendientes en negrita):
python3 /home/jcoronado/Desktop/dev/flashcard/scripts/export_ai_study_prompt.py --category nouns --mode story

# 4. Guardar el prompt en un archivo .txt para copiar y pegar:
python3 /home/jcoronado/Desktop/dev/flashcard/scripts/export_ai_study_prompt.py --category verbs --mode quiz --output /home/jcoronado/Desktop/mi_prompt_estudio.txt
```

---

## 📋 Estructura de Salida del Script
El script genera:
1. **Desglose por nivel:** Básico (`1-basic`), Intermedio (`2-intermediate`), Avanzado (`3-advanced`).
2. **Desglose por submazo:** Conteo de `Total`, `Me sé ✓`, `Me faltan ❌` y `% Avance`.
3. **Subtotales y Total de la Categoría:** Conteo consolidado exacto.
