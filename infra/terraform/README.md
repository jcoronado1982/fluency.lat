# Terraform — Reconstrucción de GCP (producción real)

> Blueprint de Disaster Recovery: reproduce en código la infraestructura GCP
> que hoy sirve tráfico real de Fluency, para poder reconstruirla si el
> proyecto/VMs se pierden. **No corre automáticamente ni forma parte del
> pipeline** (`azure-pipelines.yml` no lo invoca) — es un `terraform apply`
> manual, deliberado, cuando haga falta.

## Alcance (decidido explícitamente, no asumido)

Cubre **solo** lo que hoy sirve tráfico real de producción en GCP, según
[`docs/infrastructure/server_inventory.md`](../../docs/infrastructure/server_inventory.md)
y [`AI_OPERATIONS_CONTEXT.md`](../../docs/infrastructure/AI_OPERATIONS_CONTEXT.md):

| Recurso | Archivo | Reproduce |
|---|---|---|
| `fluency-proxy-backend` | `proxy.tf` | VM e2-micro, IP estática, Caddy + backend Rust |
| `fluency-db-surreal` | `db.tf` | VM e2-small, sin IP pública, SurrealDB 3.2.3 |
| Red, firewall, Cloud NAT | `network.tf` | VPC dedicada 10.128.0.0/20, reglas SSH/HTTP/HTTPS/interno |
| Overflow Cloud Run | `cloud-run.tf` | Servicio en `launch-490115` (parte real del camino de tráfico, `api_with_overflow`) |

**Deliberadamente fuera de este Terraform** (por decisión del usuario al pedir esto):

- **Oracle** (`server-reverse-proxy`, `server-oci-1`): archivado como respaldo
  apagado — ver [`tools/oracle-legacy/README.md`](../../tools/oracle-legacy/README.md).
  Ningún script de este directorio debe tocarlo jamás.
- **AWS** (`alpine-aws-01`) y **Azure** (`worker-alpine-native-1`): son espejo
  y auxiliar, no producción real. Si más adelante se quieren cubrir, son
  módulos nuevos (`aws.tf`/`azure.tf` con sus propios providers), no algo que
  este código intente hoy.

## ⚠️ Limitación crítica: la imagen Alpine "diskless"

`fluency-proxy-backend` corre sobre una imagen **Alpine importada a mano vía
VHD** (ver [`docs/infrastructure/gcp_ssh_recovery_guide.md`](../../docs/infrastructure/gcp_ssh_recovery_guide.md)),
con un comportamiento particular horneado en la imagen misma: `/` es un
tmpfs (diskless) y el disco persistente real se monta aparte en `/mnt/sda`.
**Terraform no puede fabricar esa imagen desde cero** — solo puede arrancar
una VM a partir de una imagen que **ya exista** en el proyecto GCP
(`gcloud compute images list`) o un snapshot recuperable de un disco actual.

Antes de que este Terraform sea útil de verdad en una emergencia:

1. **Ahora, mientras la VM real existe**: crear un snapshot/imagen del disco
   de arranque actual (`gcloud compute disks snapshot` / `gcloud compute
   images create`) y anotar su nombre en `server_inventory.md` y en
   `proxy_image_self_link` (`terraform.tfvars`). Sin este paso, `terraform
   apply` falla al crear `google_compute_instance.proxy`/`.db` — la variable
   no tiene default a propósito.
2. Si esa imagen también se pierde, el único camino es repetir el proceso de
   importación VHD descrito para Azure en
   [`docs/infrastructure/azure_alpine_native_install.md`](../../docs/infrastructure/azure_alpine_native_install.md)
   (mismo patrón, distinto proveedor) — no está scripteado para GCP hoy.

Este Terraform sí resuelve, en cambio, todo lo que SÍ es reproducible por
código: red, firewall, tipo/tamaño de máquina, IP fija interna, y — vía los
scripts canónicos de `infra/proxy/` embebidos en el `startup-script` — el
tuning de SO, el Caddyfile, el contenedor de Caddy, el backend Rust y
SurrealDB.

## Verificación en vivo (5 ago 2026)

Los valores de `templates/proxy-startup.sh.tftpl` y `templates/db-startup.sh.tftpl`
no son solo lo que documentaban `server_inventory.md`/`AI_OPERATIONS_CONTEXT.md` —
se verificaron por SSH de solo lectura contra las dos VMs reales (autorizado
explícitamente por el usuario para ese turno) y varios detalles de la doc
resultaron desactualizados. Corregidos en el mismo cambio, en Terraform y en
ambas docs:

- `caddy-smart` monta `-v /tmp:/tmp` (lo leía la válvula `api_with_overflow` vía
  `/tmp/ORACLE_HEALTHY`) y **no** tiene límite de memoria — el `-v /tmp:/tmp` no
  estaba en ninguna versión anterior de este Terraform; sin él, el overflow a
  Cloud Run quedaría permanentemente activo.
- `fluency-db-surreal` también es diskless (`/` tmpfs, disco real en `/mnt/sda`) y
  también tiene swap de 4 GB — ninguno de los dos estaba documentado antes.
- La DB **no** tiene TCP BBR ni fd-limits (a diferencia del proxy) — confirmado,
  no agregado por paridad especulativa.
- El directorio de datos real de SurrealDB es `/mnt/sda/surreal_data`, no
  `/root/surreal_data` (que habría vivido en el tmpfs efímero y se perdería en
  cada reboot — corregido antes de que este blueprint se usara en un DR real).
- Memoria real del contenedor SurrealDB: `--memory 1200m --memory-swap 2200m`
  (no los `800m` que documentaba `server_inventory.md`).

Si vuelves a verificar en vivo más adelante y algo cambió, corrige aquí y en las
docs de origen en el mismo cambio — no dejes que este README se quede desactualizado
como pasó con los valores anteriores.

## Qué SÍ reutiliza (no reinventa)

Los `startup-script` de `proxy.tf`/`db.tf` **no reimplementan** la lógica de
despliegue: leen con `file()` los scripts canónicos que ya existen y se usan
en producción real —

- `infra/proxy/bootstrap-gcp.sh` (swap, TCP BBR, fd limits, Caddyfile, monitor)
- `infra/proxy/Caddyfile.gcp`
- `infra/proxy/oracle-ram-monitor.sh`
- `infra/proxy/docker-gcr-auth.sh`
- `infra/proxy/deploy-oracle-backend.sh`

Si cambias el comportamiento de despliegue, edítalo ahí — nunca dupliques la
lógica en los `.tftpl` de este directorio (regla del repo: "un canónico por
tema").

`db.tf` es la única excepción documentada: no usa `infra/proxy/deploy-surrealdb.sh`
tal cual porque ese script no reproduce el puerto/memoria observados en la
VM real (`--bind 0.0.0.0:8080`, `--memory 800m`) — ver el comentario al
inicio de `templates/db-startup.sh.tftpl`.

## Uso

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # rellenar (nunca commitear)
terraform init
terraform plan   # revisar TODO antes de aplicar -- crea recursos reales, facturables
terraform apply
```

Requisitos:

- Credenciales con acceso a **ambos** proyectos GCP (`fluency_project_id` y
  `overflow_project_id` son proyectos distintos, ver `providers.tf`).
  Lo más simple: `gcloud auth application-default login` con una cuenta
  (p.ej. `alberto.testing01@gmail.com`) que vea ambos. Si no, usar
  `fluency_credentials_file`/`overflow_credentials_file`.
- `proxy_image_self_link` apuntando a una imagen existente (ver limitación
  arriba) — variable obligatoria, sin default.
- Todos los secretos (`database_url`, `jwt_secret`, etc.) vía
  `terraform.tfvars` no versionado o `TF_VAR_*` en el entorno.

## Después de aplicar (cierre obligatorio, regla del repo)

1. La IP pública del proxy **cambiará** (`35.188.162.50` no se reserva sola).
   Actualizar en el mismo cambio: `server_inventory.md`, el registro DNS de
   Cloudflare (`fluency.lat`/`www`/`qa.fluency.lat`), y verificar que
   `Caddyfile.gcp` no tenga esa IP hardcodeada (hoy usa hostnames, no debería
   requerir edición).
2. Repoblar `/mnt/sda/repository/flashcard/{card_images,card_audio,json}` —
   Terraform solo crea los directorios vacíos; el contenido son datos, no
   código, y se restauran desde el backup/sync real (`scripts/sync_*_to_oracle.skill.md`,
   nombre legado, apunta a GCP).
3. Correr la verificación mínima de `AI_OPERATIONS_CONTEXT.md` (`curl
   .../api/health`, `CF-Cache-Status`, RAM/swap de ambas VMs).
4. Si algo de este Terraform no coincidió con la realidad al aplicarlo,
   corregir aquí y en la doc de origen en el mismo cambio — no dejarlo
   como una discrepancia silenciosa para la próxima vez.

## Seguridad del state

El `.tfstate` local contiene **todos los secretos en texto plano** (es cómo
funciona Terraform). Este directorio ya lo excluye de git
(`infra/terraform/.gitignore`). Para un uso sostenido más allá de un DR
ocasional, migrar a un backend remoto cifrado con IAM restringido (ver
comentario en `versions.tf`) — no está configurado por defecto porque este
Terraform nace como blueprint de emergencia, no como fuente de verdad
operada a diario (esa sigue siendo `docs/infrastructure/`).
