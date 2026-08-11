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


def build_global_index(en_root):
    """meaning -> [(imagePath, rel_file), ...] across all of es_en, skipping
    files where es_en's own `meaning` field looks corrupted (English sentences
    instead of a short Spanish concept -- a pre-existing es_en data bug seen in
    a few decks, unrelated to translation congruence)."""
    idx = defaultdict(list)
    clean_files = set()
    for p in en_root.rglob("*.json"):
        rel = str(p.relative_to(en_root))
        suspicious = False
        entries = []
        for w in load(p):
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
    baseline_files = {str(p.relative_to(en_root)) for p in en_root.rglob("*.json")}
    global_index, clean_baseline_files = build_global_index(en_root)

    stats = defaultdict(int)
    log = []

    for direction in DIRECTIONS:
        dir_root = JSON_ROOT / direction
        dir_files = {str(p.relative_to(dir_root)) for p in dir_root.rglob("*.json")}

        # --- Pass 1: position-aligned repair, only for files with a same-name baseline ---
        for rel in sorted(baseline_files & dir_files):
            base = load(en_root / rel)
            cur = load(dir_root / rel)
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
                save(dir_root / rel, cur, args.dry_run)

        # --- Pass 2: meaning-based reuse + stolen-image clearing, across ALL files ---
        for rel in sorted(dir_files):
            p = dir_root / rel
            baseline_path = en_root / rel
            local_index = defaultdict(list)
            base_meanings = set()
            file_is_clean_baseline = baseline_path.is_file() and rel in clean_baseline_files
            if file_is_clean_baseline:
                for w in load(baseline_path):
                    for d in w.get("definitions", []):
                        m, ip = d.get("meaning"), d.get("imagePath")
                        if m and ip:
                            local_index[m].append(ip)
                            base_meanings.add(m)

            data = load(p)
            changed = False
            for wi, w in enumerate(data):
                for di, d in enumerate(w.get("definitions", [])):
                    key = concept_key(direction, w, d)
                    current = d.get("imagePath")
                    if not key:
                        continue

                    if current and file_exists_for_path(current):
                        # Already points to a real file. Only worth revisiting if this
                        # concept has NO counterpart anywhere in es_en (an inserted
                        # word) -- then check whether the path was actually stolen
                        # from a different concept via array-position accident.
                        if file_is_clean_baseline and key not in base_meanings:
                            owner = None
                            for w2 in load(baseline_path):
                                for d2 in w2.get("definitions", []):
                                    if d2.get("imagePath") == current:
                                        owner = d2.get("meaning")
                                        break
                                if owner:
                                    break
                            if owner is not None and owner != key:
                                d["imagePath"] = ""
                                changed = True
                                stats["stolen_image_cleared"] += 1
                                log.append(f"[{direction}] {rel} [{wi}][{di}] {w.get('name')}: cleared stolen image (was showing '{owner}')")
                        continue

                    # current is empty/broken -- try to find an existing es_en image by meaning
                    local_candidates = list(dict.fromkeys(local_index.get(key, [])))
                    chosen = local_candidates[0] if len(local_candidates) == 1 else None
                    if chosen is None:
                        level_dir = Path(rel).parent
                        scoped = [c for c in global_index.get(key, []) if Path(c[1]).parent == level_dir]
                        scoped = list(dict.fromkeys(scoped))
                        if len(scoped) == 1:
                            chosen = scoped[0][0]
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
