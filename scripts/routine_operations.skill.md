# 🛠️ Skill: Comandos de Rutina y Gestión de Entornos

Este manual contiene los comandos exactos para las tareas repetitivas y el cambio de contexto entre Desarrollo y Producción.

---

## 🧹 1. Limpieza de Logs y Traces
Para dejar el entorno limpio después de una sesión intensiva:

```bash
# Limpiar binarios de Rust (Libera varios GB)
cd infra/mcp-server && cargo clean
cd ../../backend && cargo clean

# Limpiar archivos temporales de prueba
rm -rf scratch/*

# Eliminar logs residuales
find . -name "*.log" -type f -delete
```

---

## 🗄️ 2. Limpieza y Reset de Base de Datos
- **Reset de Progreso:** Usar el endpoint `/api/reset-all` (POST) enviando `{ "confirm": true }`.
- **Reset Estructural:** Ejecutar el contenido de `schema.sql` seguido de `data.sql` para volver al estado inicial de fábrica.

---

## 🌐 3. Cambio de Entorno (Pointers)

### Frontend (Vite)
Los "apuntadores" de la API se gestionan mediante archivos de entorno en la carpeta `client/`:
- **Desarrollo:** `.env.development` -> `VITE_API_URL=http://localhost:8081`
- **Producción:** `.env.production` -> `VITE_API_URL=https://flashcard-backend-977952175712.us-east1.run.app`

*Nota: El comando `bun run build` siempre usará los apuntadores de producción.*

### Backend (Rust)
Se gestiona en `backend/.env`:
- **Variable Clave:** `PROJECT_ID`.
- **Producción:** `launch-490115` (o el proyecto activo en Cloud Run).
- **Desarrollo:** `xrubi-fd22e` (o local).

---

## 🚀 4. Despliegue Manual (Si falla el Pipeline)
Si el pipeline de Azure DevOps no se activa, se puede forzar desde la CLI:
```bash
az pipelines build queue --definition-id 2
```

---

## 🛡️ 5. Protocolo "Golden Copy" (Protección de Pipeline)
Para evitar roturas en el sistema de despliegue automático:
- **Archivo Maestro:** `azure-pipelines.yml.gold` (Versión verificada que funciona).
- **Procedimiento de Edición:**
  1. Hacer backup: `cp azure-pipelines.yml azure-pipelines.yml.bak`.
  2. Aplicar cambio mínimo.
  3. Verificar build en Azure DevOps.
  4. Si falla, restaurar: `cp azure-pipelines.yml.gold azure-pipelines.yml`.

---

## 🧹 6. Limpieza Automática de Artefactos (GCP)
Para mantener solo la versión actual y un respaldo (ahorro de costos):

```bash
# Comando para borrar todas las imágenes excepto las últimas 2
gcloud container images list-tags gcr.io/$(gcpProject)/flashcard-backend \
    --format="get(digest)" --sort-by="~timestamp" | \
    tail -n +3 | \
    xargs -I {} gcloud container images delete gcr.io/$(gcpProject)/flashcard-backend@{} --quiet --force-delete-tags
```
*Nota: Este comando se puede incluir al final del pipeline de Azure DevOps.*
