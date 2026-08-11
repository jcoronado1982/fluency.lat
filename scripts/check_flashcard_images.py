#!/usr/bin/env python3
"""Deterministic (no AI) check: for every flashcard definition in json/{es_en,en_es,es_de},
verify the image actually loads (imagePath set AND file exists on disk at card_images/...).
For en_es/es_de, also verify the imagePath matches es_en's at the same aligned word position
(alignment = es_en definitions[0].meaning equals the other direction's headword: `name` for
en_es, `meaning` for es_de -- both fields hold the Spanish concept name).

No AI judgment here: this is pure structural/filesystem verification. Run it, then read the
JSON report it writes to find exactly which entries need a human/AI decision.

Usage: python3 scripts/check_flashcard_images.py [--out report.json]
"""
import argparse
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
JSON_ROOT = REPO / "json"

DIRECTIONS = ["es_en", "en_es", "es_de"]
BASELINE = "es_en"


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def file_exists_for_path(image_path):
    if not image_path:
        return False
    # imagePath is like "/card_images/nouns/1-basic/food_drink/....avif"
    rel = image_path.lstrip("/")
    return (REPO / rel).is_file()


def headword_of(direction, word_obj):
    """The Spanish concept name for this word, used to check alignment across directions."""
    if direction == "en_es":
        return word_obj.get("name")
    # es_en / es_de: the Spanish concept lives in definitions[0].meaning
    defs = word_obj.get("definitions") or [{}]
    return defs[0].get("meaning")


def check_direction_against_baseline(direction, baseline_files):
    dir_root = JSON_ROOT / direction
    findings = []
    dir_files = {str(p.relative_to(dir_root)) for p in dir_root.rglob("*.json")}
    common = sorted(baseline_files & dir_files)
    only_here = sorted(dir_files - baseline_files)

    for rel in common:
        base = load(JSON_ROOT / BASELINE / rel)
        cur = load(dir_root / rel)
        n = min(len(base), len(cur))
        if len(base) != len(cur):
            findings.append({
                "direction": direction, "file": rel, "type": "WORD_COUNT_MISMATCH",
                "baseline_count": len(base), "direction_count": len(cur),
            })
        for i in range(n):
            aligned = headword_of(BASELINE, base[i]) == headword_of(direction, cur[i])
            base_defs = base[i].get("definitions", [])
            cur_defs = cur[i].get("definitions", [])
            if aligned and len(base_defs) != len(cur_defs):
                findings.append({
                    "direction": direction, "file": rel, "type": "DEF_COUNT_MISMATCH",
                    "word_index": i, "name": cur[i].get("name"),
                    "baseline_def_count": len(base_defs), "direction_def_count": len(cur_defs),
                })
                aligned = False
            if not aligned:
                findings.append({
                    "direction": direction, "file": rel, "type": "WORD_MISALIGNED",
                    "word_index": i, "baseline_headword": headword_of(BASELINE, base[i]),
                    "direction_headword": headword_of(direction, cur[i]),
                })
                continue
            m = min(len(base_defs), len(cur_defs))
            for j in range(m):
                expected = base_defs[j].get("imagePath")
                actual = cur_defs[j].get("imagePath")
                name = cur[i].get("name")
                if not actual:
                    findings.append({
                        "direction": direction, "file": rel, "type": "IMAGE_MISSING",
                        "word_index": i, "def_index": j, "name": name, "expected_imagePath": expected,
                    })
                elif not file_exists_for_path(actual):
                    findings.append({
                        "direction": direction, "file": rel, "type": "IMAGE_FILE_NOT_FOUND",
                        "word_index": i, "def_index": j, "name": name, "imagePath": actual,
                    })
                elif actual != expected:
                    findings.append({
                        "direction": direction, "file": rel, "type": "IMAGE_MISMATCH_VS_BASELINE",
                        "word_index": i, "def_index": j, "name": name,
                        "actual_imagePath": actual, "expected_imagePath": expected,
                    })

    # Files that only exist in this direction (no positional baseline to compare against)
    for rel in only_here:
        cur = load(dir_root / rel)
        for i, w in enumerate(cur):
            for j, d in enumerate(w.get("definitions", [])):
                actual = d.get("imagePath")
                name = w.get("name")
                if not actual:
                    findings.append({
                        "direction": direction, "file": rel, "type": "IMAGE_MISSING_NO_BASELINE",
                        "word_index": i, "def_index": j, "name": name,
                    })
                elif not file_exists_for_path(actual):
                    findings.append({
                        "direction": direction, "file": rel, "type": "IMAGE_FILE_NOT_FOUND_NO_BASELINE",
                        "word_index": i, "def_index": j, "name": name, "imagePath": actual,
                    })
    return findings


def check_baseline_itself():
    """es_en is the source of truth for imagePath, but its own images can still be missing/broken."""
    dir_root = JSON_ROOT / BASELINE
    findings = []
    for p in sorted(dir_root.rglob("*.json")):
        rel = str(p.relative_to(dir_root))
        data = load(p)
        for i, w in enumerate(data):
            for j, d in enumerate(w.get("definitions", [])):
                actual = d.get("imagePath")
                name = w.get("name")
                if not actual:
                    findings.append({"direction": BASELINE, "file": rel, "type": "IMAGE_MISSING", "word_index": i, "def_index": j, "name": name})
                elif not file_exists_for_path(actual):
                    findings.append({"direction": BASELINE, "file": rel, "type": "IMAGE_FILE_NOT_FOUND", "word_index": i, "def_index": j, "name": name, "imagePath": actual})
    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPO / "scripts" / "flashcard_image_report.json"))
    args = ap.parse_args()

    baseline_root = JSON_ROOT / BASELINE
    baseline_files = {str(p.relative_to(baseline_root)) for p in baseline_root.rglob("*.json")}

    all_findings = []
    all_findings.extend(check_baseline_itself())
    for direction in DIRECTIONS:
        if direction == BASELINE:
            continue
        all_findings.extend(check_direction_against_baseline(direction, baseline_files))

    by_type = {}
    for f in all_findings:
        by_type.setdefault(f["type"], []).append(f)

    summary = {t: len(v) for t, v in sorted(by_type.items())}
    report = {"summary": summary, "total_findings": len(all_findings), "findings": all_findings}

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("=== Resumen (test determinístico, sin IA) ===")
    for t, c in summary.items():
        print(f"  {t}: {c}")
    print(f"\nTotal hallazgos: {len(all_findings)}")
    print(f"Reporte completo: {args.out}")


if __name__ == "__main__":
    main()
