# Habilitación explícita de APIs -- sin esto, un `apply` contra un proyecto
# recién creado (el escenario real de "el proyecto se perdió, hay que
# reconstruir todo") falla en el primer recurso con
# "API not enabled" en vez de fallar rápido y claro en este paso.

resource "google_project_service" "compute" {
  provider           = google.fluency
  project            = var.fluency_project_id
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "run" {
  provider           = google.overflow
  project            = var.overflow_project_id
  service            = "run.googleapis.com"
  disable_on_destroy = false
}
