#!/usr/bin/env python3
import os
import sys
import argparse
from PIL import Image

def compress_image(file_path, target_kb=500, overwrite=True):
    """
    Reduce el tamaño de imagen (PNG, JPG, JPEG) para que no supere los target_kb (500KB por defecto).
    Mantiene la relación de aspecto y la mayor calidad visual posible.
    """
    target_bytes = target_kb * 1024
    orig_size = os.path.getsize(file_path)
    
    if orig_size <= target_bytes:
        print(f"⏩ Omitido '{os.path.basename(file_path)}' ({orig_size / 1024:.1f} KB - ya es <= {target_kb}KB)")
        return False

    ext = os.path.splitext(file_path)[1].lower()
    temp_path = file_path + ".tmp_compress"
    
    try:
        img = Image.open(file_path)
        
        # Orientación EXIF si existe
        try:
            from PIL import ImageOps
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        if ext in ['.jpg', '.jpeg']:
            # Asegurar modo RGB si la imagen está en RGBA/P
            if img.mode in ('RGBA', 'P', 'LA'):
                img = img.convert('RGB')
                
            quality = 92
            while quality >= 20:
                img.save(temp_path, 'JPEG', quality=quality, optimize=True)
                if os.path.getsize(temp_path) <= target_bytes:
                    break
                quality -= 5
            
            # Si bajando calidad aún supera target_bytes, redimensionar resolución
            if os.path.getsize(temp_path) > target_bytes:
                w, h = img.size
                while os.path.getsize(temp_path) > target_bytes and w > 100 and h > 100:
                    current_size = os.path.getsize(temp_path)
                    ratio = (target_bytes / current_size) ** 0.5
                    scale_factor = min(0.92, max(0.2, ratio * 0.95))
                    w, h = max(1, int(w * scale_factor)), max(1, int(h * scale_factor))
                    
                    resized = img.resize((w, h), Image.Resampling.LANCZOS)
                    resized.save(temp_path, 'JPEG', quality=75, optimize=True)

        elif ext == '.png':
            # Intentar optimización PNG inicial
            img.save(temp_path, 'PNG', optimize=True)
            
            w, h = img.size
            while os.path.getsize(temp_path) > target_bytes and w > 100 and h > 100:
                current_size = os.path.getsize(temp_path)
                ratio = (target_bytes / current_size) ** 0.5
                scale_factor = min(0.90, max(0.2, ratio * 0.95))
                w, h = max(1, int(w * scale_factor)), max(1, int(h * scale_factor))
                
                resized = img.resize((w, h), Image.Resampling.LANCZOS)
                resized.save(temp_path, 'PNG', optimize=True)
        else:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return False

        final_size = os.path.getsize(temp_path)
        
        if final_size <= orig_size and overwrite:
            os.replace(temp_path, file_path)
            reduction = ((orig_size - final_size) / orig_size) * 100
            print(f"✅ Comprimido '{os.path.basename(file_path)}': {orig_size / 1024:.1f} KB ➔ {final_size / 1024:.1f} KB (-{reduction:.1f}%)")
            return True
        else:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            print(f"⚠️ No se redujo el tamaño de '{os.path.basename(file_path)}'")
            return False

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        print(f"❌ Error al procesar '{os.path.basename(file_path)}': {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Comprime imágenes PNG y JPG a un peso máximo (500KB por defecto).")
    parser.add_argument("--dir", "-d", default=None, help="Directorio con imágenes (por defecto la carpeta del script)")
    parser.add_argument("--max-kb", "-k", type=int, default=500, help="Tamaño máximo en KB (defecto: 500)")
    parser.add_argument("--recursive", "-r", action="store_true", help="Procesar subcarpetas recursivamente")

    args = parser.parse_args()

    target_dir = args.dir
    if not target_dir:
        target_dir = os.path.dirname(os.path.abspath(__file__))

    if not os.path.exists(target_dir):
        print(f"❌ El directorio '{target_dir}' no existe.")
        sys.exit(1)

    print(f"🖼️ Buscando imágenes PNG/JPG en: '{target_dir}' (Máx: {args.max_kb} KB)")
    
    valid_exts = ('.png', '.jpg', '.jpeg')
    processed_count = 0
    skipped_count = 0
    
    if args.recursive:
        files_to_process = []
        for root, _, files in os.walk(target_dir):
            for f in files:
                if f.lower().endswith(valid_exts):
                    files_to_process.append(os.path.join(root, f))
    else:
        files_to_process = [
            os.path.join(target_dir, f) for f in os.listdir(target_dir)
            if os.path.isfile(os.path.join(target_dir, f)) and f.lower().endswith(valid_exts)
        ]

    if not files_to_process:
        print("ℹ️ No se encontraron imágenes PNG o JPG en la carpeta.")
        return

    for filepath in files_to_process:
        res = compress_image(filepath, target_kb=args.max_kb)
        if res:
            processed_count += 1
        else:
            skipped_count += 1

    print(f"\n🎉 Proceso completado: {processed_count} imágenes comprimidas, {skipped_count} no requerían compresión u omitidas.")

if __name__ == "__main__":
    main()
