# fluency-proxy-backend: Caddy + backend Rust de producción.
# Specs y comportamiento documentados en docs/infrastructure/server_inventory.md
# y docs/infrastructure/AI_OPERATIONS_CONTEXT.md -- no inventar nada que no
# esté ahí confirmado.

locals {
  bootstrap_gcp_sh         = file("${path.module}/../proxy/bootstrap-gcp.sh")
  caddyfile_gcp            = file("${path.module}/../proxy/Caddyfile.gcp")
  oracle_ram_monitor_sh    = file("${path.module}/../proxy/oracle-ram-monitor.sh")
  docker_gcr_auth_sh       = file("${path.module}/../proxy/docker-gcr-auth.sh")
  deploy_oracle_backend_sh = file("${path.module}/../proxy/deploy-oracle-backend.sh")

  proxy_startup_script = templatefile("${path.module}/templates/proxy-startup.sh.tftpl", {
    bootstrap_gcp_sh         = local.bootstrap_gcp_sh
    caddyfile_gcp            = local.caddyfile_gcp
    oracle_ram_monitor_sh    = local.oracle_ram_monitor_sh
    docker_gcr_auth_sh       = local.docker_gcr_auth_sh
    deploy_oracle_backend_sh = local.deploy_oracle_backend_sh
  })
}

# IP externa estática. NOTA: será una IP NUEVA (no 35.188.162.50) salvo que
# se reserve explícitamente la misma vía `gcloud compute addresses create
# --addresses` con la IP original ANTES de que GCP la libere al borrar la VM
# actual. Al aplicar, actualizar en el mismo cambio: server_inventory.md, el
# registro DNS A/proxy de Cloudflare, y cualquier IP hardcodeada en Caddyfile
# real (Caddyfile.gcp usa hostnames, no IPs, así que no debería requerir
# edición ahí).
resource "google_compute_address" "proxy" {
  provider = google.fluency
  name     = "fluency-proxy-ip"
  region   = var.region
}

resource "google_compute_instance" "proxy" {
  provider     = google.fluency
  name         = "fluency-proxy-backend"
  machine_type = var.proxy_machine_type
  zone         = var.zone
  tags         = ["fluency-proxy"]

  boot_disk {
    initialize_params {
      image = var.proxy_image_self_link
      size  = var.proxy_boot_disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.fluency.id
    network_ip = var.proxy_private_ip

    access_config {
      nat_ip = google_compute_address.proxy.address
    }
  }

  # Secretos pasados como metadata individual (no como bloque JSON único) para
  # que el startup-script los lea uno a uno vía el metadata server -- ver
  # templates/proxy-startup.sh.tftpl. Terraform los guarda en el state en
  # texto plano: usar un backend remoto cifrado con IAM restringido para uso
  # sostenido (ver versions.tf).
  metadata = {
    database-url                  = var.database_url
    gemini-api-key                = var.gemini_api_key
    gemini-tts-api-key            = var.gemini_tts_api_key
    gcp-api-key                   = var.gcp_api_key
    google-client-id              = var.google_client_id
    jwt-secret                    = var.jwt_secret
    super-admin-email             = var.super_admin_email
    google-credentials-json-b64   = var.google_credentials_json_b64
    lemon-squeezy-api-key         = var.lemon_squeezy_api_key
    lemon-squeezy-store-id        = var.lemon_squeezy_store_id
    lemon-squeezy-variant-monthly = var.lemon_squeezy_variant_monthly
    lemon-squeezy-variant-annual  = var.lemon_squeezy_variant_annual
    lemon-squeezy-webhook-secret  = var.lemon_squeezy_webhook_secret
    media-delivery-mode           = var.media_delivery_mode
    surreal-url                   = "${var.db_private_ip}:8080"
    backend-image                 = var.backend_image
  }

  metadata_startup_script = local.proxy_startup_script

  allow_stopping_for_update = true

  depends_on = [
    google_compute_firewall.allow_ssh,
    google_compute_firewall.allow_http_https,
    google_compute_firewall.allow_internal,
  ]
}
