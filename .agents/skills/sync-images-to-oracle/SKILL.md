---
name: sync-images-to-oracle
description: Sincroniza imágenes nuevas y modificadas (card_images/) desde el entorno local directamente al servidor real de producción (GCP, 35.188.162.50 — antes Oracle, ver tools/oracle-legacy/) usando rsync y sshpass de forma inmediata.
---

# 🖼️ Skill: Sincronización de Imágenes al servidor real de producción (nombre legado: Oracle)

Este skill permite a cualquier agente de IA sincronizar inmediatamente las imágenes del catálogo (`card_images/`) creadas o modificadas en la máquina local hacia el servidor real de producción (GCP, `35.188.162.50` — antes Oracle, ver `tools/oracle-legacy/README.md`).

---

## 🎯 Cuándo utilizar este skill
* El usuario pide "subir imágenes a Oracle" (nombre legado, hoy es GCP), "actualizar imágenes en producción", "sincronizar imágenes recién creadas" o similar.
* Se generaron imágenes locales con ComfyUI / scripts y deben estar disponibles de inmediato en `https://fluency.lat/card_images/...`.

---

## ⚙️ Parámetros del Servidor
* **IP del Servidor Proxy GCP:** `35.188.162.50`
* **Usuario:** `root`
* **Contraseña SSH:** `Privado01*`
* **Ruta de Destino en GCP:** `/mnt/sda/repository/flashcard/card_images/`

---

## 🚀 Comando de Ejecución Directa

Ejecutar en la raíz del repositorio (`/home/jcoronado/Desktop/dev/flashcard`):

```bash
rsync -avz --update -e "sshpass -p 'Privado01*' ssh -o StrictHostKeyChecking=no" card_images/ root@35.188.162.50:/mnt/sda/repository/flashcard/card_images/
```

### Explicación del comando:
- `--update`: Solo sube archivos nuevos o más recientes que los existentes en el servidor.
- `-avz`: Archivo en modo archivo (preserva permisos, fechas), detallado y comprimido en tránsito.
- `sshpass -p 'Privado01*'`: Autenticación SSH automática sin interacción del usuario.

---

## 🧪 Verificación Post-Ejecución
Probar una URL de imagen con `curl`:
```bash
curl -sI https://fluency.lat/card_images/nouns/1-basic/transport/1-basic_transport_card_12_def0.avif
```
Debe retornar `HTTP/2 200 OK`.
