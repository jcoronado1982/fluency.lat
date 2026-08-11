# VPC dedicada y auto-contenida: no depende de que exista la red "default"
# del proyecto (útil si este Terraform corre contra un proyecto GCP recién
# creado). El CIDR replica el rango observado hoy en producción
# (10.128.0.0/20, donde caen 10.128.0.4 y 10.128.0.5 -- ver
# docs/infrastructure/server_inventory.md).
#
# Si en cambio se quiere reutilizar la red "default" real ya existente (para
# no dejar huérfanos otros recursos que ya vivan ahí), reemplazar este
# archivo por data "google_compute_network"/"google_compute_subnetwork" --
# decisión explícita, no asumida aquí.

resource "google_compute_network" "fluency" {
  provider                = google.fluency
  name                    = var.network_name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.compute]
}

resource "google_compute_subnetwork" "fluency" {
  provider      = google.fluency
  name          = "${var.network_name}-${var.region}"
  network       = google_compute_network.fluency.id
  region        = var.region
  ip_cidr_range = var.subnet_cidr
  # Habilita logs de flujo VPC: útil para diagnosticar sin SSH, alineado con
  # "SSH solo si la doc falla" (docs/infrastructure/AI_OPERATIONS_CONTEXT.md).
  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# --- Firewall ---------------------------------------------------------------

resource "google_compute_firewall" "allow_ssh" {
  provider      = google.fluency
  name          = "${var.network_name}-allow-ssh"
  network       = google_compute_network.fluency.id
  direction     = "INGRESS"
  source_ranges = var.ssh_source_ranges
  target_tags   = ["fluency-proxy", "fluency-db"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "allow_http_https" {
  provider      = google.fluency
  name          = "${var.network_name}-allow-http-https"
  network       = google_compute_network.fluency.id
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["fluency-proxy"]

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

# Tráfico interno proxy<->DB (SurrealDB :8080, y cualquier otro puerto interno
# futuro) por IP privada de VPC -- nunca por IP pública, ver
# AI_OPERATIONS_CONTEXT.md "Errores que no se deben repetir".
resource "google_compute_firewall" "allow_internal" {
  provider      = google.fluency
  name          = "${var.network_name}-allow-internal"
  network       = google_compute_network.fluency.id
  direction     = "INGRESS"
  source_ranges = [var.subnet_cidr]
  target_tags   = ["fluency-proxy", "fluency-db"]

  allow {
    protocol = "tcp"
  }
  allow {
    protocol = "udp"
  }
  allow {
    protocol = "icmp"
  }
}

# --- Cloud NAT ---------------------------------------------------------------
# fluency-db-surreal no tiene IP pública (por diseño) pero necesita salida a
# internet para `docker pull surrealdb/surrealdb:v3.2.3`. Cloud Router + NAT
# le da egress sin exponerla con una IP pública propia.

resource "google_compute_router" "fluency" {
  provider = google.fluency
  name     = "${var.network_name}-router"
  network  = google_compute_network.fluency.id
  region   = var.region
}

resource "google_compute_router_nat" "fluency" {
  provider                           = google.fluency
  name                               = "${var.network_name}-nat"
  router                             = google_compute_router.fluency.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}
