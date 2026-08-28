#!/usr/bin/env python3
"""
Script: find_duplicate_words.py
Propósito: Detectar y auditar palabras duplicadas DENTRO DE LA MISMA CATEGORÍA
usando el algoritmo de Tabla Hash con Índice Invertido (O(N)).

Regla de Negocio:
- Una palabra NO puede repetirse dentro de la misma categoría (ej. dos veces en 'nouns' o dos veces en 'verbs').
- Una palabra SÍ puede existir en categorías distintas (ej. 'work' en 'verbs' y 'work' en 'nouns' es VÁLIDO).
"""

import sys
import os
import json
import argparse
from collections import defaultdict

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def scan_category(category_name, course_direction="es_en"):
    """
    Indexa todas las tarjetas de una categoría específica y detecta colisiones internas.
    """
    cat_dir = os.path.join(REPO_ROOT, "json", course_direction, category_name)
    if not os.path.isdir(cat_dir):
        # Fallback a json/<category_name>
        cat_dir = os.path.join(REPO_ROOT, "json", category_name)
        if not os.path.isdir(cat_dir):
            return None

    # Índice invertido: palabra normalizada -> lista de ocurrencias
    inverted_index = defaultdict(list)
    total_cards = 0

    for root, _, files in os.walk(cat_dir):
        for f in sorted(files):
            if not f.endswith(".json") or "manifest" in f:
                continue
            filepath = os.path.join(root, f)
            rel_path = os.path.relpath(filepath, REPO_ROOT)
            is_bridge = "_e_" in f
            deck_name = os.path.splitext(os.path.relpath(filepath, cat_dir))[0]

            try:
                with open(filepath, "r", encoding="utf-8") as fp:
                    data = json.load(fp)
                    cards = data if isinstance(data, list) else data.get("flashcards", data.get("cards", []))
                    total_cards += len(cards)

                    for idx, card in enumerate(cards):
                        raw_name = card.get("name", "")
                        clean_name = raw_name.strip().lower()
                        if not clean_name:
                            continue

                        # Extraer significado del primer definition
                        defs = card.get("definitions", [])
                        meaning = defs[0].get("meaning", "") if defs else card.get("translation", "")
                        example = defs[0].get("usage_example", "") if defs else card.get("example", "")

                        inverted_index[clean_name].append({
                            "name": raw_name,
                            "file": rel_path,
                            "deck": deck_name,
                            "index": idx,
                            "is_bridge": is_bridge,
                            "meaning": meaning,
                            "example": example
                        })
            except Exception as e:
                print(f"⚠️ Error leyendo {filepath}: {e}", file=sys.stderr)

    # Filtrar únicamente las colisiones (palabras con > 1 aparición)
    duplicates = {word: occs for word, occs in inverted_index.items() if len(occs) > 1}

    return {
        "category": category_name,
        "total_cards": total_cards,
        "unique_words": len(inverted_index),
        "duplicate_count": len(duplicates),
        "duplicates": duplicates
    }

def print_category_report(cat_data, show_details=True):
    cat = cat_data["category"]
    total = cat_data["total_cards"]
    unique = cat_data["unique_words"]
    dups = cat_data["duplicate_count"]

    status_icon = "✅" if dups == 0 else "⚠️"
    print(f"\n{status_icon} CATEGORÍA: {cat.upper()}")
    print("=" * 75)
    print(f"   • Total de tarjetas:   {total}")
    print(f"   • Palabras únicas:     {unique}")
    print(f"   • Palabras repetidas:  {dups} (aparecen 2 o más veces en {cat})")
    print("-" * 75)

    if dups == 0:
        print("   🎉 ¡Cero repeticiones! Todas las palabras de esta categoría son únicas.\n")
        return

    # Separar en colisiones de mazos regulares vs causadas por mazos puente (_e_)
    reg_collisions = {}
    bridge_collisions = {}

    for word, occs in cat_data["duplicates"].items():
        reg_occs = [o for o in occs if not o["is_bridge"]]
        if len(reg_occs) > 1:
            reg_collisions[word] = occs
        else:
            bridge_collisions[word] = occs

    if reg_collisions:
        print(f"\n   🚨 COLISIONES ENTRE MAZOS REGULARES ({len(reg_collisions)} palabras):")
        for word, occs in sorted(reg_collisions.items()):
            print(f"      • \"{word}\" ({len(occs)} veces):")
            for o in occs:
                tag = "[PUENTE _e_]" if o["is_bridge"] else "[REGULAR]"
                print(f"          - {tag:<12} {o['deck']} (tarjeta #{o['index']}) -> \"{o['meaning']}\"")

    if bridge_collisions and show_details:
        print(f"\n   🌉 COLISIONES PROVOCADAS POR MAZOS PUENTE _e_ ({len(bridge_collisions)} palabras):")
        # Mostrar resumen o lista
        for word, occs in sorted(bridge_collisions.items())[:15]:
            regular_deck = next((o["deck"] for o in occs if not o["is_bridge"]), "N/A")
            bridge_decks = [o["deck"] for o in occs if o["is_bridge"]]
            print(f"      • \"{word}\" -> Original en: [{regular_deck}] | Repetida en puente: {bridge_decks}")
        
        if len(bridge_collisions) > 15:
            print(f"      ... y {len(bridge_collisions) - 15} palabras más repetidas en mazos puente.")
    print()

def main():
    parser = argparse.ArgumentParser(description="Auditoría de palabras duplicadas intra-categoría.")
    parser.add_argument("--category", default="all", help="Categoría a auditar (ej: verbs, nouns, all)")
    parser.add_argument("--direction", default="es_en", help="Dirección del catálogo (default: es_en)")
    parser.add_argument("--json", action="store_true", help="Salida en formato JSON crudo")
    args = parser.parse_args()

    catalog_dir = os.path.join(REPO_ROOT, "json", args.direction)
    if not os.path.isdir(catalog_dir):
        print(f"❌ No se encontró el catálogo en {catalog_dir}", file=sys.stderr)
        sys.exit(1)

    available_categories = sorted([d for d in os.listdir(catalog_dir) if os.path.isdir(os.path.join(catalog_dir, d))])
    
    if args.category != "all":
        categories_to_check = [args.category]
    else:
        # Filtrar categorías personales de prueba
        categories_to_check = [c for c in available_categories if not c.startswith("personal-")]

    results = []
    total_global_cards = 0
    total_global_unique = 0
    total_global_dups = 0

    print("\n===========================================================================")
    print("🔍 AUDITORÍA INTRA-CATEGORÍA: DETECCIÓN DE REPETICIONES POR CATEGORÍA")
    print("   Regla: 0 repeticiones dentro de la misma categoría.")
    print("          (La misma palabra en categorías distintas es VÁLIDA y permitida)")
    print("===========================================================================")

    for cat in categories_to_check:
        res = scan_category(cat, args.direction)
        if res:
            results.append(res)
            total_global_cards += res["total_cards"]
            total_global_unique += res["unique_words"]
            total_global_dups += res["duplicate_count"]
            if not args.json:
                print_category_report(res)

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
        return

    print("===========================================================================")
    print("📊 RESUMEN GLOBAL DE LA AUDITORÍA:")
    print(f"   • Total de tarjetas analizadas:   {total_global_cards}")
    print(f"   • Total de palabras únicas:       {total_global_unique}")
    print(f"   • Total de palabras duplicadas:   {total_global_dups}")
    print("===========================================================================\n")

if __name__ == "__main__":
    main()
