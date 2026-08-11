# ============================================================================
# Variables generales / proyectos
# ============================================================================

variable "fluency_project_id" {
  description = <<-EOT
    Project ID real del proyecto GCP "fluency" (donde viven fluency-proxy-backend
    y fluency-db-surreal). NO es el nombre para humanos "fluency" -- ver
    docs/infrastructure/server_inventory.md: "project-c73b1fb9-17ae-4d1b-8f4".
    Verificar con `gcloud projects list` antes de aplicar contra un proyecto
    nuevo: si vas a reconstruir en un proyecto GCP distinto, cambia este valor.
  EOT
  type        = string
  default     = "project-c73b1fb9-17ae-4d1b-8f4"
}

variable "fluency_credentials_file" {
  description = "Ruta a un JSON de service account con permisos sobre fluency_project_id. Vacío = usar Application Default Credentials (gcloud auth application-default login)."
  type        = string
  default     = ""
}

variable "overflow_project_id" {
  description = "Project ID del overflow Cloud Run (Artifact Registry gcr.io/launch-490115/...). Ver azure-pipelines.yml (`gcpProject`)."
  type        = string
  default     = "launch-490115"
}

variable "overflow_credentials_file" {
  description = "Ruta a un JSON de service account con permisos sobre overflow_project_id. Vacío = Application Default Credentials."
  type        = string
  default     = ""
}

variable "region" {
  description = "Región GCP de las VMs de proxy+DB."
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "Zona GCP de las VMs de proxy+DB."
  type        = string
  default     = "us-central1-a"
}

variable "overflow_region" {
  description = "Región del servicio Cloud Run de overflow (ver azure-pipelines.yml `gcpRegion`)."
  type        = string
  default     = "us-east1"
}

# ============================================================================
# Red
# ============================================================================

variable "network_name" {
  description = "Nombre de la VPC dedicada creada por este Terraform (self-contained: no depende de que exista la red 'default' del proyecto)."
  type        = string
  default     = "fluency-vpc"
}

variable "subnet_cidr" {
  description = "CIDR de la subred donde viven proxy (.4) y DB (.5). 10.128.0.0/20 replica el rango observado hoy en producción."
  type        = string
  default     = "10.128.0.0/20"
}

variable "proxy_private_ip" {
  description = "IP privada fija del proxy dentro de la subred (documentada: 10.128.0.4)."
  type        = string
  default     = "10.128.0.4"
}

variable "db_private_ip" {
  description = "IP privada fija de la DB dentro de la subred (documentada: 10.128.0.5)."
  type        = string
  default     = "10.128.0.5"
}

variable "ssh_source_ranges" {
  description = <<-EOT
    Rangos IP permitidos para SSH (puerto 22) a proxy y DB. El default
    0.0.0.0/0 replica el acceso actual (SSH directo documentado en
    server_inventory.md) pero es más permisivo de lo recomendable -- restringir
    a tu(s) IP(s) real(es) en un terraform.tfvars antes de aplicar en serio.
  EOT
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# ============================================================================
# Imágenes de arranque (Alpine importado vía VHD -- ver limitación en README)
# ============================================================================

variable "proxy_image_self_link" {
  description = <<-EOT
    Self-link o nombre de la imagen de disco de arranque para el proxy
    (Alpine Linux, mismo patrón "diskless" que describe server_inventory.md:
    "/" es tmpfs, el disco persistente vive en /mnt/sda -- ese comportamiento
    está horneado en la imagen, NO lo reproduce este Terraform). Terraform NO
    puede fabricar esta imagen desde cero: debe existir ya en el proyecto
    (`gcloud compute images list --project <proyecto>`) o como snapshot
    recuperable. Ver README.md de este directorio, sección "Limitación crítica".
  EOT
  type        = string
}

variable "db_image_self_link" {
  description = "Igual que proxy_image_self_link pero para la VM de SurrealDB. Por defecto se asume la misma imagen base Alpine (sin la variante diskless, que no aplica aquí)."
  type        = string
  default     = ""
}

variable "proxy_boot_disk_size_gb" {
  description = "Tamaño del disco de arranque del proxy (documentado: 20 GB pd-balanced)."
  type        = number
  default     = 20
}

variable "db_boot_disk_size_gb" {
  description = "Tamaño del disco de arranque de la DB (documentado: 10 GB pd-balanced)."
  type        = number
  default     = 10
}

variable "proxy_machine_type" {
  description = "Tipo de máquina del proxy (documentado: e2-micro, 1024 MB RAM)."
  type        = string
  default     = "e2-micro"
}

variable "db_machine_type" {
  description = "Tipo de máquina de la DB (documentado: e2-small, 2048 MB RAM)."
  type        = string
  default     = "e2-small"
}

# ============================================================================
# Backend / imagen Docker
# ============================================================================

variable "backend_image" {
  description = "Imagen del backend Rust (misma que usa el pipeline, gcr.io/launch-490115/flashcard-backend)."
  type        = string
  default     = "gcr.io/launch-490115/flashcard-backend:latest"
}

variable "media_delivery_mode" {
  description = "MEDIA_DELIVERY_MODE del backend. Producción vigente: cloudflare."
  type        = string
  default     = "cloudflare"
}

# ============================================================================
# Secretos -- NUNCA poner valores reales por defecto. Pasar por
# TF_VAR_<nombre>, un terraform.tfvars no versionado, o -var-file.
# Fuente de verdad de los valores reales: SECRETS_MAP.md (LOCAL ONLY) o el
# variable group `Flashcard-Secrets` de Azure DevOps.
# ============================================================================

variable "database_url" {
  description = "DATABASE_URL del backend."
  type        = string
  sensitive   = true
}

variable "gemini_api_key" {
  type      = string
  sensitive = true
}

variable "gemini_tts_api_key" {
  description = "Opcional -- solo si se usa TTS de Gemini en este despliegue."
  type        = string
  sensitive   = true
  default     = ""
}

variable "gcp_api_key" {
  type      = string
  sensitive = true
}

variable "google_client_id" {
  description = "Google OAuth 2.0 Client ID."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "super_admin_email" {
  type      = string
  sensitive = true
}

variable "google_credentials_json_b64" {
  description = "Service account JSON (GOOGLE_CREDENTIALS_JSON) codificado en base64 -- mismo formato que GCP_CREDS_B64 en azure-pipelines.yml."
  type        = string
  sensitive   = true
}

variable "lemon_squeezy_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "lemon_squeezy_store_id" {
  type      = string
  sensitive = true
  default   = ""
}

variable "lemon_squeezy_variant_monthly" {
  type      = string
  sensitive = true
  default   = ""
}

variable "lemon_squeezy_variant_annual" {
  type      = string
  sensitive = true
  default   = ""
}

variable "lemon_squeezy_webhook_secret" {
  type      = string
  sensitive = true
  default   = ""
}

# ---- Overflow Cloud Run: réplica remota vía SSH (ver Mirror_AWS/Deploy_GCP en
# azure-pipelines.yml). El nombre "oracle" es legado; hoy apunta al proxy real.
variable "oracle_host" {
  description = "ORACLE_HOST (nombre legado) para el espejo remoto desde Cloud Run. Vacío = usar la IP pública del proxy recién creado por este Terraform."
  type        = string
  default     = ""
}

variable "oracle_ssh_password" {
  description = "Password SSH del proxy (ORACLE_SSH_PASSWORD, nombre legado) que usa Cloud Run para el espejo remoto de assets. Vacío desactiva ese SCP (SYNC_TO_ORACLE=false)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "enable_cloud_run_overflow" {
  description = "Si false, no crea el servicio Cloud Run de overflow (solo VMs+red en fluency_project_id)."
  type        = bool
  default     = true
}
