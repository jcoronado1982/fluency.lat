# 🛠️ Skill: Operaciones de Infraestructura y Despliegue

Este manual define los procedimientos estándar para la gestión del proyecto Flashcard AI. **Cualquier IA operando en este repo DEBE seguir estas rutas de decisión.**

---

## 1. 🗄️ Gestión de Base de Datos (SurrealDB)

### Datos de Destino (DB activa del producto)
- **Motor:** SurrealDB 3.2.3 (RocksDB) — namespace `flashcard` (prod) / `qa_flashcard` (QA).
- **Host:** `fluency-db-surreal` (GCP, VPC privada `10.128.0.5:8080`, sin IP pública; antes
  `server-oci-1` en Oracle — `10.0.1.138:8080` / `129.158.214.227` — ver `tools/oracle-legacy/`).
- **Acceso:** desde el proxy real (`fluency-proxy-backend`, punto de entrada SSH); credenciales en `SECRETS_MAP.md`.
- **Quirks 3.2.3:** funciones string en snake_case (`string::starts_with`), `type::record`,
  `UPSERT` para crear-si-no-existe (`UPDATE` ya no crea), tablas nunca escritas dan error `NotFound`
  en vez de vacío, sin compatibilidad cruzada de versión mayor entre cliente y servidor — backend y
  DB se despliegan juntos. Transacciones multi-statement en una sola query siguen igual. Detalle:
  `docs/infrastructure/ARQUITECTURA_ORACLE_DB.md` §7 y §15.

> ⚠️ **PostgreSQL NO es la DB del producto**: existe solo en `docker-compose.yml` local, sin uso en
> producción. Los pagos SÍ están activos (LemonSqueezy + tabla `subscription` en SurrealDB — ver
> `docs/modules/pricing.md`). Veredicto completo: `docs/infrastructure/server_inventory.md`
> §Postgres. Cualquier procedimiento que apunte a `flashcard_db:5432` en Azure como DB operativa
> es legado.

### Reglas de Seguridad
- **Doc-first:** IPs/specs SIEMPRE de `docs/infrastructure/server_inventory.md`, no de SSH.
- **Esquema:** antes de `DEFINE`/cambios, leer `database_schema_diagram.md`.
- **RAM:** OCI-1 tiene 1 GB (límite Docker 800m). Antes de operaciones masivas, leer
  `docs/infrastructure/AI_OPERATIONS_CONTEXT.md`; si la RAM libre es crítica, ABORTAR.

---

## 2. 🚀 Estrategia de Despliegue (CI/CD)

### Método de Despliegue
- **Frontend (Oracle, sin cambios):** Automatizado vía Azure Pipelines (Copia vía SSH a la VM) —
  Oracle sigue recibiendo el SPA por este stage aunque ya no sea el backend real de producción.
- **Backend (GCP Cloud Run):** Automatizado vía Azure Pipelines (Docker Build & Push a GCR).

### Lógica de Operación
1. **Despliegue Estándar:** Realizar `git push` a la rama `main`. El pipeline decidirá el despliegue según los filtros de ruta.
2. **Despliegue Manual / Emergencia:** 
   - Usar `az pipelines build queue --definition-id 2` para forzar una build.
   - NO usar `gcloud run deploy` manualmente a menos que el pipeline esté caído y sea una emergencia crítica.

---

## 3. ☁️ Gestión Multi-Cloud

### Azure
- **Uso:** Gestión de Pipelines y Azure DevOps.
- **Herramienta:** `az_cli`.

### GCP (Google Cloud)
- **Uso:** Hosting de Backend (Cloud Run) y Assets (GCS).
- **Herramienta:** `run_gcloud_command`.

### Oracle Cloud (OCI) — archivado como respaldo (4 ago 2026, ver `tools/oracle-legacy/`)
- **Uso histórico:** Backend genérico para múltiples aplicaciones y procesamiento secundario.
- **Herramienta:** `oci_cli`.

### Amazon Web Services (AWS)
- **Uso:** Procesamiento redundante y Worker secundario.
- **Herramienta:** `aws_cli` (vía MCP o terminal).
- **Verificación:** `aws sts get-caller-identity`.

---

## 🔐 Manejo de Fallos
- Si un despliegue falla: Usar `az pipelines build list --definition-ids 2 --top 1` para identificar la build fallida y luego investigar logs.
- Si el Sentinel bloquea el tráfico: No forzar el desbloqueo sin antes optimizar la base de datos o escalar la instancia vía `oci_cli`.
