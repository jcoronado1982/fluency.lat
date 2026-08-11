# 🛠️ Skill: Conexión Multi-Cloud (Azure, GCP & AWS)

Este documento centraliza los métodos de conexión para gestionar la infraestructura.

---

## ☁️ Microsoft Azure

### Opción 1: Vía MCP (Recomendado para IA)
Usa el servidor oficial de Microsoft para interactuar mediante herramientas estructuradas.

**Comando:**
```bash
npx -y @azure/mcp@latest server start
```
*Requiere las variables `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` cargadas.*

### Opción 2: Vía CLI / SDK
Uso directo de comandos `az`.

**Login con Service Principal:**
```bash
az login --service-principal \
  -u "$AZURE_CLIENT_ID" \
  -p "$AZURE_CLIENT_SECRET" \
  --tenant "$AZURE_TENANT_ID"
```

**Comando de verificación:**
```bash
az account show --output table
```

### Opción 3: Vía Custom MCP (100% Control)
Usa tu servidor local en Rust para ejecutar comandos `az` sin restricciones.

**Ejecución:**
```bash
cargo run --bin mcp-server
```
*(Ubicado en `infra/mcp-server`)*

**Herramienta:** `az_cli`
**Argumentos:** `{ "command": "..." }`

---

## ☁️ Google Cloud Platform (GCP)

### Opción 1: Vía MCP (Recomendado para IA)
Usa la herramienta universal de Google para ejecutar cualquier comando `gcloud` como una herramienta.

**Comando:**
```bash
npx -y @google-cloud/gcloud-mcp
```

**Uso de la herramienta:**
Llamar a `run_gcloud_command` con los argumentos necesarios.

### Opción 2: Vía CLI / SDK
Uso directo de comandos `gcloud`.

**Selección de Proyecto (Flashcards):**
```bash
gcloud config set project YOUR_GCP_PROJECT_ID
```

**Comando de verificación:**
```bash
gcloud projects describe YOUR_GCP_PROJECT_ID
```

---

## ☁️ Oracle Cloud Infrastructure (OCI) — infraestructura archivada

> Oracle dejó de ser el servidor real de Fluency el 4 ago 2026 (ver `tools/oracle-legacy/README.md`).
> Esta sección sigue siendo válida si hace falta conectarse a las máquinas archivadas (respaldo) o
> reactivarlas — el servidor real hoy es GCP, ver la sección `gcloud` arriba.

### Opción 1: Vía Custom MCP (100% Control)
Usa tu servidor local en Rust para ejecutar comandos `oci`.

**Herramienta:** `oci_cli`
**Argumentos:** `{ "command": "..." }`

### Opción 2: Vía CLI / SDK
Uso directo de comandos `oci`.

**Instalación (si no existe):**
```bash
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
```

**Configuración inicial:**
```bash
oci setup config
```

---

## ☁️ Amazon Web Services (AWS)

### Opción 1: Vía CLI / SDK
Uso directo de comandos `aws`.

**Configuración manual (una sola vez):**
```bash
aws configure
```

**Variables de entorno (Recomendado para Scripts/IA):**
```bash
# Consultar valores reales en SECRETS_MAP.md
export AWS_ACCESS_KEY_ID="YOUR_AWS_ID"
export AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET"
export AWS_DEFAULT_REGION="us-east-1"
```

**Comando de verificación:**
```bash
aws sts get-caller-identity --output table
```

### Opción 2: Autenticación por Archivo de Credenciales
Si prefieres no usar variables de entorno, el CLI lee automáticamente de `~/.aws/credentials`.

**Estructura del archivo:**
```ini
[default]
aws_access_key_id = YOUR_AWS_ID
aws_secret_access_key = YOUR_AWS_SECRET
```

**Verificación de cuenta:**
```bash
# Debería retornar Account: 549914804507
aws sts get-caller-identity --query "Account" --output text
```



---

## 🔐 Variables de Entorno (Resumen)
Para que ambos métodos funcionen, asegúrate de que estas variables estén disponibles (consultar `SECRETS_MAP.md` para valores reales):

| Variable | Descripción |
| :--- | :--- |
| `AZURE_CLIENT_ID` | App ID del Service Principal |
| `AZURE_CLIENT_SECRET` | Password del Service Principal |
| `AZURE_TENANT_ID` | ID del Directorio de Azure |
| `AZURE_SUBSCRIPTION_ID` | ID de la suscripción (b2ff...e611) |
| `GOOGLE_CLOUD_PROJECT` | ID del proyecto GCP (YOUR_GCP_PROJECT) |
| `AWS_ACCESS_KEY_ID` | Access Key de AWS |
| `AWS_SECRET_ACCESS_KEY` | Secret Key de AWS |

