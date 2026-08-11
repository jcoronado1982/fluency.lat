#!/usr/bin/env python3
"""
Poda gradual de imagenes AVIF legacy en resolucion exacta 512x512.

Corre en el SERVIDOR ORACLE (donde vive card_images), no localmente:
la resolucion real se lee del box ISOBMFF `ispe` dentro del archivo,
no de la extension ni del nombre.

Uso:
    python3 prune-legacy-512-avif.py                    # dry-run, 10% por defecto
    python3 prune-legacy-512-avif.py --execute           # borra de verdad
    python3 prune-legacy-512-avif.py --percent 5 --execute
    python3 prune-legacy-512-avif.py --root /otra/ruta --execute

Solo selecciona archivos .avif cuya resolucion real sea EXACTAMENTE 512x512.
Cualquier otra resolucion (768x512, la nueva resolucion del pipeline, etc.)
se ignora siempre, sin importar el porcentaje pedido.

Flujo diario sugerido:
    1. python3 prune-legacy-512-avif.py --execute
       (borra ~10% del pool de 512x512 que quede ese dia)
    2. scripts/batch-images.sh -> modo G (--batch-gen-images) para regenerar
       las imagenes faltantes en la nueva resolucion.
    3. Repetir al dia siguiente. El pool de candidatos 512x512 se reduce solo:
       los archivos regenerados ya no miden 512x512, asi que este script
       nunca vuelve a seleccionarlos ni hace falta llevar un registro de
       "ya migrados" a mano.

Cada corrida con --execute deja un log en <root>/../prune_512_log/<timestamp>.txt
con la ruta relativa de cada archivo borrado, para cruzar despues contra los
JSON de deck y saber que cartas quedaron pendientes de regenerar.
"""
import argparse
import os
import random
import struct
import sys
import time

DEFAULT_ROOT = "/root/smart-proxy/repository/flashcard/card_images"
TARGET_RESOLUTION = (512, 512)  # legacy a podar
NEW_RESOLUTION = (768, 512)  # resolucion nueva del pipeline: NUNCA se borra

assert TARGET_RESOLUTION != NEW_RESOLUTION, "TARGET_RESOLUTION no puede ser igual a NEW_RESOLUTION"


def read_box_header(f):
    start = f.tell()
    hdr = f.read(8)
    if len(hdr) < 8:
        return None
    size, box_type = struct.unpack(">I4s", hdr)
    box_type = box_type.decode("latin1")
    header_len = 8
    if size == 1:
        largesize = f.read(8)
        if len(largesize) < 8:
            return None
        size = struct.unpack(">Q", largesize)[0]
        header_len = 16
    elif size == 0:
        cur = f.tell()
        f.seek(0, os.SEEK_END)
        end = f.tell()
        size = end - start
        f.seek(cur)
    return {"type": box_type, "size": size, "start": start, "header_len": header_len}


def find_ispe(f, end):
    while f.tell() < end:
        box = read_box_header(f)
        if box is None:
            break
        box_end = box["start"] + box["size"]
        if box["type"] == "meta":
            f.seek(box["start"] + box["header_len"] + 4)  # version+flags
            result = find_ispe(f, box_end)
            if result:
                return result
        elif box["type"] in ("iprp", "ipco"):
            f.seek(box["start"] + box["header_len"])
            result = find_ispe(f, box_end)
            if result:
                return result
        elif box["type"] == "ispe":
            f.seek(box["start"] + box["header_len"] + 4)  # version+flags
            wh = f.read(8)
            if len(wh) == 8:
                return struct.unpack(">II", wh)
        f.seek(box_end)
    return None


def get_resolution(path):
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(0)
            return find_ispe(f, size)
    except OSError:
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=DEFAULT_ROOT, help="carpeta card_images (default: %(default)s)")
    parser.add_argument("--percent", type=float, default=10.0, help="porcentaje del pool 512x512 a borrar (default: 10)")
    parser.add_argument("--execute", action="store_true", help="borra de verdad; sin esto es dry-run")
    parser.add_argument("--seed", type=int, default=None, help="semilla random, para pruebas reproducibles")
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    candidates = []
    total_avif = 0
    protected = 0
    for dirpath, _dirnames, filenames in os.walk(args.root):
        for fn in filenames:
            if not fn.lower().endswith(".avif"):
                continue
            total_avif += 1
            full = os.path.join(dirpath, fn)
            res = get_resolution(full)
            if res == NEW_RESOLUTION:
                protected += 1
                continue
            if res == TARGET_RESOLUTION:
                candidates.append(full)

    pool = len(candidates)
    n_to_delete = int(round(pool * args.percent / 100.0))

    print(f"AVIF totales escaneados: {total_avif}")
    print(f"Protegidas ({NEW_RESOLUTION[0]}x{NEW_RESOLUTION[1]}, resolucion nueva, nunca se tocan): {protected}")
    print(f"Pool actual en {TARGET_RESOLUTION[0]}x{TARGET_RESOLUTION[1]}: {pool}")
    print(f"Porcentaje pedido: {args.percent}%  ->  a borrar: {n_to_delete}")

    if n_to_delete == 0:
        print("Nada que borrar (pool vacio o porcentaje redondea a 0).")
        return

    selection = random.sample(candidates, n_to_delete)

    if not args.execute:
        print("\n[DRY RUN] no se borro nada. Ejemplo de seleccion (primeros 10):")
        for p in selection[:10]:
            print(f"  {os.path.relpath(p, args.root)}")
        print("\nCorre de nuevo con --execute para borrar de verdad.")
        return

    log_dir = os.path.join(os.path.dirname(os.path.normpath(args.root)), "prune_512_log")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, time.strftime("%Y-%m-%d_%H%M%S.txt"))

    deleted = 0
    with open(log_path, "w") as log:
        for p in selection:
            rel = os.path.relpath(p, args.root)
            try:
                os.remove(p)
                deleted += 1
                log.write(rel + "\n")
            except OSError as e:
                print(f"  ERROR borrando {rel}: {e}", file=sys.stderr)

    print(f"\nBorrados: {deleted}/{n_to_delete}")
    print(f"Pool 512x512 restante: {pool - deleted}")
    print(f"Log: {log_path}")


if __name__ == "__main__":
    main()
