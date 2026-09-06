#!/usr/bin/env python3
"""Companion fixer for check_flashcard_images.py -- reassigns imagePath to an
ALREADY-EXISTING es_en image whenever possible. Never calls any image-generation
provider and never invents a path; only three actions:

  1. Position-aligned repair: if the word/definition lines up with es_en at the
     same index (same concept, verified by meaning/headword equality) but the
     stored imagePath is empty or points elsewhere, restore es_en's path.
  2. Meaning-based reuse: if position doesn't align (deck has extra/missing
     words vs es_en) but the exact same concept has an image somewhere else in
     es_en (same deck file first, then same category/level scoped globally),
     reuse that path.
  3. Stolen-image clearing: if a word has NO counterpart anywhere in es_en (a
     genuinely new/inserted concept) and its current imagePath actually belongs
     to a *different* es_en concept (inherited by raw array-position accident),
     clear it to "" rather than keep showing the wrong picture. Never guesses.

Anything left over after this (empty imagePath with no existing es_en match at
all) genuinely needs either new image generation or a content decision -- this
script will not touch those; re-run check_flashcard_images.py to see them.

Usage: python3 scripts/fix_flashcard_image_congruence.py [--dry-run]
"""
import argparse
import json
from pathlib import Path
from collections import defaultdict

REPO = Path(__file__).resolve().parent.parent
JSON_ROOT = REPO / "json"
BASELINE = "es_en"
DIRECTIONS = ["en_es", "es_de"]


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def cards_of(data):
    """La lista de palabras del mazo, venga como array plano o envuelta en {"flashcards": [...]}
    (ese envoltorio es el que lleva `intro_card`, ej. determinant/1-basic/quantifiers_scale.json).
    Devuelve la lista REAL, no una copia: mutar sus dicts muta el objeto original, así que `save()`
    sigue escribiendo el envoltorio intacto. Asumir el array plano hacía reventar el script con
    `'str' object has no attribute 'get'` al leer esos mazos como baseline."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("flashcards") or []
    return []


def is_personal_deck(rel_path):
    """Mazos personales por usuario (json/es_en/personal-*/): solo existen en es_en y son de una
    sola persona. No deben aportar imágenes al corpus compartido ni compararse entre direcciones
    — `check_flashcard_images.py` ya los excluye; este script no lo hacía."""
    return any(part.startswith("personal-") for part in Path(rel_path).parts)


def detect_indent(p):
    with open(p, encoding="utf-8") as f:
        f.readline()
        second = f.readline()
    stripped = second.lstrip(" ")
    return len(second) - len(stripped) or 2


def save(p, data, dry_run):
    if dry_run:
        return
    indent = detect_indent(p)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)
        f.write("\n")


def file_exists_for_path(image_path):
    if not image_path:
        return False
    return (REPO / image_path.lstrip("/")).is_file()


def headword_of(direction, word_obj):
    if direction == "en_es":
        return word_obj.get("name")
    defs = word_obj.get("definitions") or [{}]
    return defs[0].get("meaning")


def concept_key(direction, word_obj, defn):
    if direction == "en_es":
        return defn.get("target_meaning_es") or word_obj.get("name")
    return defn.get("meaning")


def resolve_image_for(key, local_index, global_index, rel):
    """La imagen que le corresponde a este concepto: primero en el mismo mazo de es_en, si no en el
    mismo category/nivel del corpus. Solo acepta candidato ÚNICO — con dos imágenes distintas para
    el mismo concepto no hay forma determinista de elegir, y adivinar es lo que causó el problema."""
    local_candidates = list(dict.fromkeys(local_index.get(key, [])))
    if len(local_candidates) == 1:
        return local_candidates[0]
    level_dir = Path(rel).parent
    scoped = list(dict.fromkeys(
        c for c in global_index.get(key, []) if Path(c[1]).parent == level_dir
    ))
    if len(scoped) == 1:
        return scoped[0][0]
    return None


def build_owner_index(en_root):
    """imagePath -> concepto de es_en que REALMENTE lo posee.

    Sin esto no se puede distinguir "esta tarjeta tiene imagen" de "esta tarjeta tiene LA imagen
    de su vecina". El script solo miraba al dueño cuando la palabra no existía en es_en, así que
    una palabra que sí existe pero heredó la imagen de al lado por corrimiento de posición se
    quedaba mostrando la equivocada para siempre."""
    owner = {}
    for p in en_root.rglob("*.json"):
        rel = str(p.relative_to(en_root))
        if is_personal_deck(rel):
            continue
        for w in cards_of(load(p)):
            for d in w.get("definitions", []):
                ip, m = d.get("imagePath"), d.get("meaning")
                if ip and m:
                    owner.setdefault(ip, m)
    return owner


def build_global_index(en_root):
    """meaning -> [(imagePath, rel_file), ...] across all of es_en, skipping
    files where es_en's own `meaning` field looks corrupted (English sentences
    instead of a short Spanish concept -- a pre-existing es_en data bug seen in
    a few decks, unrelated to translation congruence)."""
    idx = defaultdict(list)
    clean_files = set()
    for p in en_root.rglob("*.json"):
        rel = str(p.relative_to(en_root))
        if is_personal_deck(rel):
            continue
        suspicious = False
        entries = []
        for w in cards_of(load(p)):
            for d in w.get("definitions", []):
                m, ip = d.get("meaning"), d.get("imagePath")
                if m and (len(m) > 60 or m.endswith(".")):
                    suspicious = True
                if m and ip:
                    entries.append((m, ip))
        if suspicious:
            continue
        clean_files.add(rel)
        for m, ip in entries:
            idx[m].append((ip, rel))
    return idx, clean_files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Report what would change without writing files")
    args = ap.parse_args()

    en_root = JSON_ROOT / BASELINE
    baseline_files = {
        str(p.relative_to(en_root))
        for p in en_root.rglob("*.json")
        if not is_personal_deck(p.relative_to(en_root))
    }
    global_index, clean_baseline_files = build_global_index(en_root)
    owner_index = build_owner_index(en_root)

    stats = defaultdict(int)
    log = []

    for direction in DIRECTIONS:
        dir_root = JSON_ROOT / direction
        dir_files = {
            str(p.relative_to(dir_root))
            for p in dir_root.rglob("*.json")
            if not is_personal_deck(p.relative_to(dir_root))
        }

        # --- Pass 1: position-aligned repair, only for files with a same-name baseline ---
        for rel in sorted(baseline_files & dir_files):
            base = cards_of(load(en_root / rel))
            cur_data = load(dir_root / rel)
            cur = cards_of(cur_data)
            changed = False
            n = min(len(base), len(cur))
            for i in range(n):
                if headword_of(BASELINE, base[i]) != headword_of(direction, cur[i]):
                    continue
                bdefs, cdefs = base[i].get("definitions", []), cur[i].get("definitions", [])
                if len(bdefs) != len(cdefs):
                    continue
                for j in range(min(len(bdefs), len(cdefs))):
                    expected = bdefs[j].get("imagePath")
                    actual = cdefs[j].get("imagePath")
                    if expected and actual != expected:
                        cdefs[j]["imagePath"] = expected
                        changed = True
                        stats["position_aligned_fix"] += 1
                        log.append(f"[{direction}] {rel} [{i}][{j}] {cur[i].get('name')}: position-aligned -> {expected}")
            if changed:
                save(dir_root / rel, cur_data, args.dry_run)

        # --- Pass 2: meaning-based reuse + stolen-image clearing, across ALL files ---
        for rel in sorted(dir_files):
            p = dir_root / rel
            baseline_path = en_root / rel
            local_index = defaultdict(list)
            base_meanings = set()
            file_is_clean_baseline = baseline_path.is_file() and rel in clean_baseline_files
            if file_is_clean_baseline:
                for w in cards_of(load(baseline_path)):
                    for d in w.get("definitions", []):
                        m, ip = d.get("meaning"), d.get("imagePath")
                        if m and ip:
                            local_index[m].append(ip)
                            base_meanings.add(m)

            data = load(p)
            changed = False
            for wi, w in enumerate(cards_of(data)):
                for di, d in enumerate(w.get("definitions", [])):
                    key = concept_key(direction, w, d)
                    current = d.get("imagePath")
                    if not key:
                        continue

                    if current and file_exists_for_path(current):
                        # Apunta a un archivo real, pero "real" no es lo mismo que "suyo": por el
                        # corrimiento de posiciones una tarjeta puede estar mostrando la imagen de
                        # su vecina. Antes esto solo se revisaba cuando la palabra NO existía en
                        # es_en, así que las 180 tarjetas de en_es cuyo concepto sí existe pero en
                        # otra posición se quedaban con la imagen equivocada.
                        owner = owner_index.get(current)
                        if owner is not None and owner != key:
                            correct = resolve_image_for(key, local_index, global_index, rel)
                            if correct and correct != current:
                                d["imagePath"] = correct
                                changed = True
                                stats["stolen_image_reassigned"] += 1
                                log.append(f"[{direction}] {rel} [{wi}][{di}] {w.get('name')}: robada a '{owner}' -> reasignada a la suya {correct}")
                            elif not correct:
                                # Su concepto no tiene imagen en ningún punto de es_en: mejor sin
                                # imagen que con la de otra palabra.
                                d["imagePath"] = ""
                                changed = True
                                stats["stolen_image_cleared"] += 1
                                log.append(f"[{direction}] {rel} [{wi}][{di}] {w.get('name')}: cleared stolen image (was showing '{owner}')")
                        continue

                    # current vacío o roto: buscar una imagen ya existente en es_en por significado
                    chosen = resolve_image_for(key, local_index, global_index, rel)
                    if chosen:
                        d["imagePath"] = chosen
                        changed = True
                        stats["meaning_based_reuse"] += 1
                        log.append(f"[{direction}] {rel} [{wi}][{di}] {w.get('name')}: reused existing image by meaning -> {chosen}")
                    else:
                        stats["unresolved_no_existing_image"] += 1
            if changed:
                save(p, data, args.dry_run)

    mode = "DRY RUN -- no files written" if args.dry_run else "APPLIED"
    print(f"=== fix_flashcard_image_congruence.py ({mode}) ===")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")
    print()
    print("Nunca se llamó a ningún generador de imágenes. Todo lo reasignado ya existía en es_en.")
    print("Corré scripts/check_flashcard_images.py para ver el estado final / lo que sigue pendiente.")


if __name__ == "__main__":
    main()
