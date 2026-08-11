# Overflow serverless: recibe /api cuando fluency-proxy-backend está bajo
# presión de RAM (válvula api_with_overflow del Caddyfile.gcp, ver
# oracle-ram-monitor.sh). Vive en el proyecto launch-490115, DISTINTO del
# proyecto "fluency" de las VMs -- ver azure-pipelines.yml, stage Deploy_GCP,
# que es la fuente de verdad replicada aquí (mismos env vars, misma imagen).
#
# ⚠️ Replicado tal cual el pipeline hoy, con dos gaps ya presentes ahí (no
# corregidos silenciosamente por este Terraform):
#   1. No pasa DATABASE_URL ni GOOGLE_CREDENTIALS_JSON -- si el backend los
#      necesita para autenticación/DB en el camino de overflow, verificarlo
#      contra el código antes de asumir que el overflow funciona igual que
#      el backend local.
#   2. ORACLE_REMOTE_PATH sigue apuntando a la ruta pre-migración
#      (/root/smart-proxy/repository/flashcard) en vez de la ruta real de
#      GCP (/mnt/sda/repository/flashcard) -- posible bug ya existente en
#      azure-pipelines.yml, no de este Terraform.

locals {
  effective_oracle_host = var.oracle_host != "" ? var.oracle_host : google_compute_address.proxy.address
}

resource "google_cloud_run_v2_service" "backend_overflow" {
  count    = var.enable_cloud_run_overflow ? 1 : 0
  provider = google.overflow
  name     = "flashcard-backend"
  location = var.overflow_region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = var.backend_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "SURREAL_URL"
        value = "wss://fluency.lat/db/rpc"
      }
      env {
        name  = "GEMINI_API_KEY"
        value = var.gemini_api_key
      }
      env {
        name  = "GCP_API_KEY"
        value = var.gcp_api_key
      }
      env {
        name  = "RUST_LOG"
        value = "info"
      }
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }
      env {
        name  = "JWT_SECRET"
        value = var.jwt_secret
      }
      env {
        name  = "SUPER_ADMIN_EMAIL"
        value = var.super_admin_email
      }
      env {
        name  = "SYNC_TO_ORACLE"
        value = "true"
      }
      env {
        name  = "ORACLE_HOST"
        value = local.effective_oracle_host
      }
      env {
        name  = "ORACLE_SSH_PASSWORD"
        value = var.oracle_ssh_password
      }
      env {
        name  = "ORACLE_REMOTE_PATH"
        value = "/root/smart-proxy/repository/flashcard"
      }
      env {
        name  = "LOCAL_STORAGE_PATH"
        value = "/tmp"
      }
      env {
        name  = "GCS_JSON_PREFIX"
        value = "json"
      }
      env {
        name  = "GCS_IMAGES_PREFIX"
        value = "card_images"
      }
      env {
        name  = "GCS_AUDIO_PREFIX"
        value = "card_audio"
      }
      env {
        name  = "MEDIA_DELIVERY_MODE"
        value = var.media_delivery_mode
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image, # el pipeline redeploya `:latest` fuera de Terraform
    ]
  }

  depends_on = [google_project_service.run]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count    = var.enable_cloud_run_overflow ? 1 : 0
  provider = google.overflow
  name     = google_cloud_run_v2_service.backend_overflow[0].name
  location = var.overflow_region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
