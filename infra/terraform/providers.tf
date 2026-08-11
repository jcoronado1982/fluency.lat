# Dos proyectos GCP distintos coexisten en la arquitectura real (ver
# docs/infrastructure/server_inventory.md):
#   - "fluency" (id real: var.fluency_project_id) -> VMs de proxy+backend y DB.
#   - "launch-490115" -> Artifact Registry (GCR) + Cloud Run overflow.
# Requieren credenciales/permisos que pueden no coincidir (la cuenta del
# pipeline solo ve Artifact Registry en launch-490115, no las VMs de
# "fluency"). `gcloud auth application-default login` con una cuenta que
# tenga acceso a AMBOS proyectos es el camino simple para un apply manual;
# si no, usar `var.fluency_credentials_file` / `var.overflow_credentials_file`.

provider "google" {
  alias       = "fluency"
  project     = var.fluency_project_id
  region      = var.region
  credentials = var.fluency_credentials_file != "" ? file(var.fluency_credentials_file) : null
}

provider "google" {
  alias       = "overflow"
  project     = var.overflow_project_id
  region      = var.overflow_region
  credentials = var.overflow_credentials_file != "" ? file(var.overflow_credentials_file) : null
}
