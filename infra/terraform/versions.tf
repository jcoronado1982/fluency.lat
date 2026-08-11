terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Backend local por defecto (state en infra/terraform/terraform.tfstate).
  # Este archivo CONTIENE los secretos en texto plano (ver variables.tf) --
  # no lo subas al repo (ver .gitignore de este directorio) y no lo trates
  # como reemplazo de SECRETS_MAP.md.
  #
  # Para un uso real y sostenido (no solo DR ocasional), migrar a backend
  # remoto cifrado, p.ej.:
  #
  # backend "gcs" {
  #   bucket = "fluency-terraform-state"
  #   prefix = "gcp-prod"
  # }
}
