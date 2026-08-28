#!/usr/bin/env python3
"""
Script: export_ai_study_prompt.py
Propósito: Extraer las palabras aprendidas (✓) y pendientes (❌) de la base de datos de Fluency
y armar un Prompt maestro listo para copiar y pegar en cualquier IA (ChatGPT, Claude, Gemini, etc.)
para evaluar, hacer quizzes, historias de práctica y diagnósticos de vocabulario.
"""

import sys
import os
import json
import argparse
import subprocess
import urllib.request
from collections import defaultdict

DEFAULT_USER = "email.coronado@gmail.com"
LOCAL_SURREAL_URL = "http://127.0.0.1:8001/sql"
GCP_PROXY_IP = "35.188.162.50"
SURREAL_PORT = "8080"
SURREAL_INTERNAL_IP = "10.128.0.5"

ALL_CATEGORIES = [
    "verbs",
    "nouns",
    "adjectives",
    "adverbs",
    "phrasal_verbs",
    "connectors",
    "preposition",
    "determinant",
    "pronouns"
]

def query_surreal_learned_cards(user_id, use_prod=False):
    sql = f"SELECT category, deck, card_index, learned FROM card_progress WHERE user_id = '{user_id}' AND learned = true;"
    if not use_prod:
        try:
            req = urllib.request.Request(
                LOCAL_SURREAL_URL,
                data=sql.encode("utf-8"),
                headers={
                    "surreal-ns": "flashcard",
                    "surreal-db": "flashcard",
                    "Accept": "application/json",
                    "Authorization": "Basic cm9vdDpyb290"
                }
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list) and len(data) > 0 and data[0].get("status") == "OK":
                    return data[0].get("result", [])
        except Exception:
            pass
            
    cmd = [
        "sshpass", "-p", "Privado01*",
        "ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5",
        f"root@{GCP_PROXY_IP}",
        f'curl -s -u root:root -H "surreal-ns: flashcard" -H "surreal-db: flashcard" -H "Accept: application/json" http://{SURREAL_INTERNAL_IP}:{SURREAL_PORT}/sql -d "{sql}"'
    ]
    try:
        raw = subprocess.check_output(cmd).decode("utf-8")
        parsed = json.loads(raw)
        if isinstance(parsed, list) and len(parsed) > 0 and parsed[0].get("status") == "OK":
            return parsed[0].get("result", [])
    except Exception as e:
        print(f"⚠️ Error al conectar con SurrealDB: {e}", file=sys.stderr)
        return []
    return []

def get_catalog_decks(category, course_direction="es_en"):
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    paths = [
        os.path.join(repo_root, "json", course_direction, category),
        os.path.join(repo_root, "json", category)
    ]
    
    decks = {}
    target_dir = None
    for p in paths:
        if os.path.isdir(p):
            target_dir = p
            break
            
    if not target_dir:
        return decks
        
    for root, _, files in os.walk(target_dir):
        for f in sorted(files):
            if not f.endswith(".json") or "manifest" in f:
                continue
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, target_dir)
            deck_key = rel_path.replace(".json", "")
            
            try:
                with open(full_path, "r", encoding="utf-8") as fp:
                    data = json.load(fp)
                    cards = data if isinstance(data, list) else data.get("flashcards", data.get("cards", []))
                    
                    level = "other"
                    for lvl in ["1-basic", "2-intermediate", "3-advanced"]:
                        if lvl in deck_key:
                            level = lvl
                            break
                            
                    decks[deck_key] = {
                        "level": level,
                        "file": f,
                        "total": len(cards),
                        "cards": cards
                    }
            except Exception:
                pass
                
    return decks

def get_card_translation(card):
    if card.get("translation") and str(card.get("translation")).strip():
        return str(card.get("translation")).strip()
    defs = card.get("definitions")
    if isinstance(defs, list) and len(defs) > 0:
        d0 = defs[0]
        if isinstance(d0, dict):
            if d0.get("meaning"):
                return str(d0.get("meaning")).strip()
            if d0.get("usage_example_es"):
                return str(d0.get("usage_example_es")).strip()
    return ""

def get_card_example(card):
    if card.get("example") and str(card.get("example")).strip():
        return str(card.get("example")).strip()
    if card.get("phrase") and str(card.get("phrase")).strip():
        return str(card.get("phrase")).strip()
    defs = card.get("definitions")
    if isinstance(defs, list) and len(defs) > 0:
        d0 = defs[0]
        if isinstance(d0, dict) and d0.get("usage_example"):
            return str(d0.get("usage_example")).strip()
    return ""

def generate_prompt(user_id=DEFAULT_USER, target_category="verbs", course_direction="es_en", use_prod=False, mode="quiz"):
    categories_to_process = ALL_CATEGORIES if target_category == "all" else [target_category]
    raw_progress = query_surreal_learned_cards(user_id, use_prod=use_prod)
    
    user_learned = defaultdict(set)
    for row in raw_progress:
        cat_raw = row.get("category", "")
        deck_raw = row.get("deck", "")
        idx = row.get("card_index", -1)
        
        cat_clean = cat_raw.split("::")[-1] if "::" in cat_raw else cat_raw
        deck_clean = deck_raw.split("::")[-1] if "::" in deck_raw else deck_raw
        deck_clean = deck_clean.replace(".json", "")
        
        user_learned[(cat_clean, deck_clean)].add(idx)
        
    learned_words = []
    pending_words = []
    
    for cat in categories_to_process:
        catalog = get_catalog_decks(cat, course_direction)
        if not catalog:
            continue
            
        for deck_key, d_info in sorted(catalog.items()):
            cards = d_info["cards"]
            level = d_info["level"]
            learned_indices = user_learned.get((cat, deck_key), set())
            
            for idx, card in enumerate(cards):
                name = str(card.get("name") or card.get("word") or "").strip()
                if not name:
                    continue
                    
                trans = get_card_translation(card)
                example = get_card_example(card)
                
                item = {
                    "word": name,
                    "translation": trans,
                    "category": cat,
                    "level": level,
                    "deck": deck_key,
                    "example": example
                }
                
                if idx in learned_indices:
                    learned_words.append(item)
                else:
                    pending_words.append(item)
                    
    learned_sample = [f"{w['word']}" + (f" ({w['translation']})" if w['translation'] else "") for w in learned_words]
    pending_sample = [f"{w['word']}" + (f" ({w['translation']})" if w['translation'] else "") for w in pending_words]
    
    prompt = f"""# 🧠 PROMPT DE EVALUACIÓN Y PRÁCTICA DE VOCABULARIO (FLUENCY)

Actúa como un Tutor Experto de Inglés para el estudiante `{user_id}`.

## 📊 Estado Actual del Estudiante:
- **Palabras Dominadas / Aprendidas (✓):** {len(learned_words)}
- **Palabras Pendientes por Aprender (❌):** {len(pending_words)}
- **Categoría(s):** {target_category.upper()}

---

## 🟢 Vocabulario que YA DOMINO (Palabras Aprendidas ✓):
{', '.join(learned_sample) if learned_sample else '(Ninguna aún)'}

---

## 🔴 Vocabulario que AÚN ME FALTA (Palabras Pendientes ❌):
{', '.join(pending_sample) if pending_sample else '(¡Ninguna pendiente! Todo completado)'}

---

## 🎯 Instrucciones para ti:
"""
    if mode == "eval":
        prompt += """1. **Evaluación de Nivel:** Estima mi nivel real de inglés según el vocabulario que domino frente al que me falta.
2. **Análisis de Brechas:** Explica qué conceptos clave o situaciones del día a día/trabajo aún se me dificultan debido a las palabras pendientes.
3. **Plan de Acción Priorizado:** Selecciona las 10-15 palabras pendientes más urgentes/útiles y enséñame trucos de memorización para cada una."""
    elif mode == "quiz":
        prompt += """1. **Examen / Quiz Interactivo:** Genera un cuestionario de 10 preguntas desafiantes para evaluar mis palabras PENDIENTES.
2. **Formato:** Usa oraciones contextuales con espacios en blanco (Fill in the blank) o selección múltiple. Las oraciones deben estar construidas con vocabulario que ya domino, y la respuesta correcta debe ser una palabra pendiente.
3. **Dinámica:** No muestres las respuestas ahora. Hazme las preguntas primero y dime 'Responde del 1 al 10' para evaluarme."""
    elif mode == "story":
        prompt += """1. **Historia Inmersiva de Lectura:** Escribe un relato corto (200-300 palabras) interesante en inglés.
2. **Integración:** Utiliza un 80% de mis palabras APRENDIDAS para que pueda entender la mayoría del texto con fluidez, e introduce un 20% de palabras PENDIENTES resaltadas en **negrita**.
3. **Glosario:** Al final incluye una tabla con las palabras en negrita usadas, su traducción y 3 preguntas de comprensión."""
    else: # tutor interactivo
        prompt += """1. Hazme preguntas de conversación una por una en inglés, obligándome a usar alguna de mis palabras PENDIENTES.
2. Espera mi respuesta, corrígeme gramática/vocabulario y hazme la siguiente pregunta."""

    return prompt

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Exporta el progreso de estudio en un prompt para IA.")
    parser.add_argument("--user", default=DEFAULT_USER, help="Email del usuario")
    parser.add_argument("--category", default="verbs", help="Categoría (verbs, nouns, all, etc.)")
    parser.add_argument("--direction", default="es_en", help="Dirección del curso")
    parser.add_argument("--prod", action="store_true", help="Consultar base de datos de producción GCP")
    parser.add_argument("--mode", default="quiz", choices=["quiz", "eval", "story", "tutor"], help="Modo del prompt: quiz, eval, story, tutor")
    parser.add_argument("--output", default=None, help="Guardar el prompt en un archivo de texto")
    
    args = parser.parse_args()
    prompt_text = generate_prompt(args.user, args.category, args.direction, use_prod=args.prod, mode=args.mode)
    
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(prompt_text)
        print(f"✅ Prompt guardado en: {args.output}")
    else:
        print(prompt_text)
