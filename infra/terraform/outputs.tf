output "proxy_public_ip" {
  description = "IP pública nueva del proxy -- actualizar server_inventory.md y el DNS de Cloudflare con este valor."
  value       = google_compute_address.proxy.address
}

output "proxy_private_ip" {
  value = var.proxy_private_ip
}

output "db_private_ip" {
  description = "SurrealDB no tiene IP pública por diseño."
  value       = var.db_private_ip
}

output "network_name" {
  value = google_compute_network.fluency.name
}

output "cloud_run_overflow_url" {
  description = "URL del servicio Cloud Run de overflow -- actualizar la referencia hardcodeada en Caddyfile.gcp (bloque api_with_overflow) si cambia."
  value       = var.enable_cloud_run_overflow ? google_cloud_run_v2_service.backend_overflow[0].uri : null
}
