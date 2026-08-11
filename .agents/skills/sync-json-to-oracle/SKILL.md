---
name: sync-json-to-oracle
description: Sincroniza los archivos JSON del catálogo y manifiestos (json/) nuevos y modificados desde el entorno local al servidor real de producción (GCP, 35.188.162.50 — antes Oracle, ver tools/oracle-legacy/) usando rsync y sshpass de forma inmediata.
---

# 📄 Skill: Sincronización de JSON al servidor real de producción (nombre legado: Oracle)

Este skill permite a cualquier agente de IA sincronizar inmediatamente la estructura de datos y mazos en formato JSON (`json/` y `catalog-manifest.json`) modificados o creados en la máquina local hacia el servidor real de producción (GCP, `35.188.162.50` — antes Oracle, ver `tools/oracle-legacy/README.md`).

---

## 🎯 Cuándo utilizar este skill
* El usuario pide "subir JSON a Oracle" (nombre legado, hoy es GCP), "actualizar catálogo en producción", "sincronizar los JSON modificados" o similar.
* Se hicieron cambios en la estructura de las tarjetas, categorías o manifiestos en local y deben actualizarse de inmediato en producción.

---

## ⚙️ Parámetros del Servidor
* **IP del Servidor Proxy GCP:** `35.188.162.50`
* **Usuario:** `root`
* **Contraseña SSH:** `Privado01*`
* **Ruta de Destino en GCP:** `/mnt/sda/repository/flashcard/json/`

---

## 🚀 Comando de Ejecución Directa

Ejecutar en la raíz del repositorio (`/home/jcoronado/Desktop/dev/flashcard`):

```bash
rsync -avz --update -e "sshpass -p 'Privado01*' ssh -o StrictHostKeyChecking=no" json/ root@35.188.162.50:/mnt/sda/repository/flashcard/json/
```

### Explicación del comando:
- `--update`: Solo sube archivos nuevos o más recientes que los existentes en el servidor.
- `-avz`: Archivo en modo archivo (preserva permisos, fechas), detallado y comprimido en tránsito.
- `sshpass -p 'Privado01*'`: Autenticación SSH automática sin interacción del usuario.

---

## 🧪 Verificación Post-Ejecución
Probar el manifiesto público con `curl`:
```bash
curl -sI https://fluency.lat/json/catalog-manifest.json
```
Debe retornar `HTTP/2 200 OK`.
