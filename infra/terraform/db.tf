# fluency-db-surreal: SOLO SurrealDB 3.2.3, sin IP pública (por diseño --
# ver AI_OPERATIONS_CONTEXT.md "Errores que no se deben repetir": nunca mover
# SurrealDB al proxy ni exponerla con IP pública).

resource "google_compute_instance" "db" {
  provider     = google.fluency
  name         = "fluency-db-surreal"
  machine_type = var.db_machine_type
  zone         = var.zone
  tags         = ["fluency-db"]

  boot_disk {
    initialize_params {
      image = var.db_image_self_link != "" ? var.db_image_self_link : var.proxy_image_self_link
      size  = var.db_boot_disk_size_gb
      type  = "pd-balanced"
    }
  }

  # Sin access_config -> sin IP pública. Egress vía Cloud NAT (network.tf)
  # para `docker pull surrealdb/surrealdb:v3.2.3`.
  network_interface {
    subnetwork = google_compute_subnetwork.fluency.id
    network_ip = var.db_private_ip
  }

  metadata_startup_script = file("${path.module}/templates/db-startup.sh.tftpl")

  allow_stopping_for_update = true

  depends_on = [
    google_compute_firewall.allow_ssh,
    google_compute_firewall.allow_internal,
    google_compute_router_nat.fluency,
  ]
}
