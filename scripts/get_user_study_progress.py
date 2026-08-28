#!/usr/bin/env python3
"""
Script: get_user_study_progress.py
Propósito: Consultar el progreso de estudio real de un usuario directamente desde
la base de datos (SurrealDB local / launch.lat o prod) y compararlo contra el catálogo para reportar:
- Cuántas palabras se sabe (learned: true)
- Cuántas palabras le faltan (pendientes)
- Porcentaje de avance por nivel (Básico, Intermedio, Avanzado) y por categoría (Verbos, Sustantivos, etc.)
"""

import sys
import os
import json
import glob
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
    "prepositions",
    "determinants",
    "pronouns"
]

def query_surreal_learned_cards(user_id, use_prod=False):
    """
    Ejecuta una consulta SQL en SurrealDB (Local o GCP Prod) para traer las tarjetas aprendidas.
    """
    sql = f"SELECT category, deck, card_index, learned FROM card_progress WHERE user_id = '{user_id}' AND learned = true;"
    
    if not use_prod:
        # Consulta directa al SurrealDB local (usado por launch.lat y dev local)
        try:
            req = urllib.request.Request(
                LOCAL_SURREAL_URL,
                data=sql.encode("utf-8"),
                headers={
                    "surreal-ns": "flashcard",
                    "surreal-db": "flashcard",
                    "Accept": "application/json",
                    "Authorization": "Basic cm9vdDpyb290" # root:root en base64
                }
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list) and len(data) > 0 and data[0].get("status") == "OK":
                    return data[0].get("result", [])
        except Exception:
            pass # Fallback a producción si local no está levantado
            
    # Si se pide prod explícitamente o falló local
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
    """
    Lee los archivos del catálogo local para obtener la estructura y conteo total de tarjetas.
    """
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

def generate_report(user_id=DEFAULT_USER, target_category="verbs", course_direction="es_en", use_prod=False):
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

    grand_total = 0
    grand_learned = 0
    
    origin = "GCP Prod (fluency.lat)" if use_prod else "SurrealDB Local (launch.lat / dev)"
    print(f"\n=======================================================================")
    print(f"📊 REPORTE DE PROGRESO DE ESTUDIO REAL (FLUENCY DB)")
    print(f"👤 Usuario: {user_id}")
    print(f"🌐 Entorno: {origin}")
    print(f"=======================================================================\n")
    
    for cat in categories_to_process:
        catalog = get_catalog_decks(cat, course_direction)
        if not catalog:
            continue
            
        print(f"📂 CATEGORÍA: {cat.upper()}")
        print("-" * 71)
        
        levels = ["1-basic", "2-intermediate", "3-advanced", "other"]
        cat_total = 0
        cat_learned = 0
        
        for lvl in levels:
            lvl_decks = {k: v for k, v in catalog.items() if v["level"] == lvl}
            if not lvl_decks:
                continue
                
            lvl_total = sum(d["total"] for d in lvl_decks.values())
            lvl_learned = 0
            
            lvl_name = "Básico" if "1-basic" in lvl else ("Intermedio" if "2-intermediate" in lvl else ("Avanzado" if "3-advanced" in lvl else "Otro"))
            
            print(f"\n  🎯 Nivel: {lvl_name} ({lvl})")
            print(f"  {'Submazo':<35} | {'Total':<6} | {'Me sé ✓':<8} | {'Me faltan':<10} | {'Avance'}")
            print(f"  {'-'*35}-+-{'-'*6}-+-{'-'*8}-+-{'-'*10}-+-{'-'*6}")
            
            for deck_key, d_info in sorted(lvl_decks.items()):
                total = d_info["total"]
                learned_indices = user_learned.get((cat, deck_key), set())
                learned_cnt = len([i for i in learned_indices if i < total])
                
                remaining = max(0, total - learned_cnt)
                pct = (learned_cnt / total * 100) if total > 0 else 0
                
                lvl_learned += learned_cnt
                
                status_icon = "✅" if remaining == 0 and total > 0 else ("⏳" if learned_cnt > 0 else "⬜")
                print(f"  {status_icon} {deck_key:<33} | {total:<6} | {learned_cnt:<8} | {remaining:<10} | {pct:>5.1f}%")
                
            lvl_remaining = max(0, lvl_total - lvl_learned)
            lvl_pct = (lvl_learned / lvl_total * 100) if lvl_total > 0 else 0
            cat_total += lvl_total
            cat_learned += lvl_learned
            
            print(f"  {'-'*71}")
            print(f"  📌 Subtotal {lvl_name}: {lvl_learned} aprendidas / {lvl_remaining} faltantes de {lvl_total} ({lvl_pct:.1f}%)\n")
            
        cat_remaining = max(0, cat_total - cat_learned)
        cat_pct = (cat_learned / cat_total * 100) if cat_total > 0 else 0
        grand_total += cat_total
        grand_learned += cat_learned
        
        print(f"🏆 TOTAL {cat.upper()}: {cat_learned} me sé ✓ | {cat_remaining} me faltan ❌ (de {cat_total} tarjetas) [{cat_pct:.1f}%]")
        print("=" * 71 + "\n")

    if target_category == "all":
        grand_remaining = max(0, grand_total - grand_learned)
        grand_pct = (grand_learned / grand_total * 100) if grand_total > 0 else 0
        print(f"🌟 RESUMEN GLOBAL DE TODAS LAS CATEGORÍAS:")
        print(f"   • Total tarjetas en catálogo: {grand_total}")
        print(f"   • Tarjetas que te sabes (✓): {grand_learned}")
        print(f"   • Tarjetas pendientes (❌): {grand_remaining}")
        print(f"   • Porcentaje total de avance: {grand_pct:.2f}%\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Consulta el progreso real de estudio del usuario.")
    parser.add_argument("--user", default=DEFAULT_USER, help="Email del usuario (default: email.coronado@gmail.com)")
    parser.add_argument("--category", default="verbs", help="Categoría a consultar (verbs, nouns, adjectives, etc., o 'all')")
    parser.add_argument("--direction", default="es_en", help="Dirección del curso (default: es_en)")
    parser.add_argument("--prod", action="store_true", help="Consultar la base de datos de producción GCP en lugar de local")
    
    args = parser.parse_args()
    generate_report(args.user, args.category, args.direction, use_prod=args.prod)
