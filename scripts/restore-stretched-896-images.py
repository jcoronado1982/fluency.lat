#!/usr/bin/env python3
"""
Corrige por lote imágenes AVIF que fueron estiradas de 768x512 a 896x512.

La operación recupera la proporción visual 3:2, pero no puede reconstruir los
bytes originales ni deshacer la pérdida causada por una compresión AVIF previa.
Solo selecciona archivos cuya resolución real sea exactamente 896x512.

Por seguridad, el modo predeterminado es dry-run. Con --execute escribe copias
en una carpeta paralela, conserva la estructura relativa y nunca sobrescribe
archivos existentes ni modifica el árbol de origen.

Uso:
    python3 scripts/restore-stretched-896-images.py --root card_images
    python3 scripts/restore-stretched-896-images.py --root card_images --execute
    python3 scripts/restore-stretched-896-images.py \
        --root card_images --output /ruta/card_images_768x512 --execute

Ejecutar en LocalBuild, no en los servidores de 1 GB de RAM.
"""

import argparse
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile


SOURCE_RESOLUTION = (896, 512)
TARGET_RESOLUTION = (768, 512)
DEFAULT_QUALITY = 80


def read_box_header(file):
    start = file.tell()
    header = file.read(8)
    if len(header) < 8:
        return None
    size, box_type = struct.unpack(">I4s", header)
    header_len = 8
    if size == 1:
        large_size = file.read(8)
        if len(large_size) < 8:
            return None
        size = struct.unpack(">Q", large_size)[0]
        header_len = 16
    elif size == 0:
        current = file.tell()
        file.seek(0, os.SEEK_END)
        size = file.tell() - start
        file.seek(current)
    return {
        "type": box_type.decode("latin1"),
        "size": size,
        "start": start,
        "header_len": header_len,
    }


def find_ispe(file, end):
    while file.tell() < end:
        box = read_box_header(file)
        if box is None or box["size"] < box["header_len"]:
            return None
        box_end = box["start"] + box["size"]
        if box_end > end:
            return None
        if box["type"] == "meta":
            file.seek(box["start"] + box["header_len"] + 4)
            dimensions = find_ispe(file, box_end)
            if dimensions:
                return dimensions
        elif box["type"] in ("iprp", "ipco"):
            file.seek(box["start"] + box["header_len"])
            dimensions = find_ispe(file, box_end)
            if dimensions:
                return dimensions
        elif box["type"] == "ispe":
            file.seek(box["start"] + box["header_len"] + 4)
            dimensions = file.read(8)
            if len(dimensions) == 8:
                return struct.unpack(">II", dimensions)
        file.seek(box_end)
    return None


def get_resolution(path):
    try:
        with path.open("rb") as file:
            file.seek(0, os.SEEK_END)
            size = file.tell()
            file.seek(0)
            return find_ispe(file, size)
    except OSError:
        return None


def default_output(root):
    return root.parent / f"{root.name}_restored_768x512"


def validate_paths(root, output):
    root = root.resolve()
    output = output.resolve()
    if not root.is_dir():
        raise ValueError(f"La carpeta de origen no existe: {root}")
    if output == root or root in output.parents:
        raise ValueError("La salida debe ser una carpeta paralela, no el origen ni una subcarpeta.")
    return root, output


def find_candidates(root, excluded_top_levels):
    candidates = []
    total = 0
    dimensions_unreadable = 0
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() != ".avif":
            continue
        relative = path.relative_to(root)
        if relative.parts and relative.parts[0] in excluded_top_levels:
            continue
        total += 1
        resolution = get_resolution(path)
        if resolution is None:
            dimensions_unreadable += 1
        elif resolution == SOURCE_RESOLUTION:
            candidates.append(path)
    return candidates, total, dimensions_unreadable


def convert_one(command, source, destination, quality):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return "exists", None

    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=f".{destination.stem}.", suffix=".avif", dir=destination.parent, delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)

        result = subprocess.run(
            [
                command,
                str(source),
                "-resize",
                f"{TARGET_RESOLUTION[0]}x{TARGET_RESOLUTION[1]}!",
                "-quality",
                str(quality),
                str(temporary_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            return "error", result.stderr.strip() or "ImageMagick terminó con error"
        if get_resolution(temporary_path) != TARGET_RESOLUTION:
            return "error", "la copia generada no tiene resolución 768x512"

        temporary_path.replace(destination)
        temporary_path = None
        return "converted", None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--root", type=Path, default=Path("card_images"), help="árbol AVIF de origen")
    parser.add_argument("--output", type=Path, help="árbol paralelo de salida")
    parser.add_argument("--quality", type=int, default=DEFAULT_QUALITY, help="calidad AVIF, 1-100")
    parser.add_argument("--limit", type=int, help="procesa como máximo esta cantidad")
    parser.add_argument(
        "--exclude-top-level",
        action="append",
        default=[],
        metavar="CARPETA",
        help="excluye una carpeta situada directamente bajo --root; se puede repetir",
    )
    parser.add_argument("--execute", action="store_true", help="genera las copias corregidas")
    args = parser.parse_args()

    if not 1 <= args.quality <= 100:
        parser.error("--quality debe estar entre 1 y 100")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit debe ser mayor que cero")

    output = args.output or default_output(args.root)
    try:
        root, output = validate_paths(args.root, output)
    except ValueError as error:
        parser.error(str(error))

    excluded_top_levels = set(args.exclude_top_level)
    candidates, total, unreadable = find_candidates(root, excluded_top_levels)
    candidates.sort()
    if args.limit is not None:
        candidates = candidates[: args.limit]

    print(f"AVIF escaneados: {total}")
    print(f"Candidatos 896x512: {len(candidates)}")
    print(f"Resolución ilegible: {unreadable}")
    if excluded_top_levels:
        print(f"Carpetas excluidas: {', '.join(sorted(excluded_top_levels))}")
    print(f"Salida paralela: {output}")

    if not args.execute:
        print("\n[DRY RUN] No se escribió ni modificó ninguna imagen.")
        for path in candidates[:10]:
            print(f"  {path.relative_to(root)}")
        print("\nUsa --execute para crear las copias 768x512.")
        return 0

    command = shutil.which("magick") or shutil.which("convert")
    if command is None:
        print("ERROR: ImageMagick no está instalado (magick/convert).", file=sys.stderr)
        return 2

    converted = 0
    skipped = 0
    errors = 0
    for source in candidates:
        destination = output / source.relative_to(root)
        status, error = convert_one(command, source, destination, args.quality)
        if status == "converted":
            converted += 1
        elif status == "exists":
            skipped += 1
        else:
            errors += 1
            print(f"ERROR {source.relative_to(root)}: {error}", file=sys.stderr)

    print(f"\nConvertidas: {converted}")
    print(f"Omitidas porque ya existían: {skipped}")
    print(f"Errores: {errors}")
    print(f"Origen intacto: {root}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
