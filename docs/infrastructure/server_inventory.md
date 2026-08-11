# 📊 Inventario de Infraestructura (Multi-Cloud)

> **PRIMERA fuente para IPs, RAM, CPU, disco, proveedor, usuarios SSH y contenedores.**
> Prohibido conectarse por SSH a consultar el SO para datos que este documento ya cubre.
> SSH solo si este doc falla o contradice el runtime — y entonces **se actualiza aquí en el
> mismo cambio**. Reglas de decisión y presupuesto de RAM: [`AI_OPERATIONS_CONTEXT.md`](AI_OPERATIONS_CONTEXT.md).

Este documento detalla las capacidades y roles de todos los servidores activos en el ecosistema Flashcard AI (marca: Fluency).

## ☁️ Microsoft Azure
### **Worker Native (Alpine)**
- **Nombre**: `worker-alpine-native-1`
- **Resource Group**: `environment-azure`
- **Ubicación**: `southcentralus`
- **IP Pública**: `172.202.197.64` (Estática ✅)
- **IP Privada**: `10.0.0.6`
- **Rol**: Infraestructura auxiliar histórica; cualquier referencia a Postgres en este inventario debe entenderse como soporte previsto para pagos/transacciones futuras, no como base activa del producto hoy.
- **Capacidades**:
  - **CPU**: 2 vCPUs (ARM64 Ampere Altra @ 3.0 GHz).
  - **RAM**: 1 GB (Uso base: ~72MB | Libre: ~760MB).
  - **Disco**: 32 GB Standard SSD (Verificado ✅).
  - **SO**: Alpine Linux 3.19 (Nativo).
- **Acceso**: 
  - **SSH Directo**: `ssh root@172.202.197.64`
  - **Password**: `[PROTECTED]`
  - **Disponibilidad**: **24/7** (Capa gratuita de 750h/mes, cubriendo el mes completo).

---

## ☁️ Oracle Cloud (OCI) — ARCHIVADO (respaldo apagado, 4 ago 2026)

> Oracle dejó de ser el servidor real de Fluency. Las dos máquinas (`server-reverse-proxy`
> y `server-oci-1`) pueden seguir encendidas como respaldo frío, pero **ningún pipeline
> ni código activo las toca**. Inventario completo, specs, accesos y guía de reactivación
> congelados en [`tools/oracle-legacy/README.md`](../../tools/oracle-legacy/README.md) —
> no se borró nada, solo se archivó. El servidor real hoy es GCP (sección siguiente).

---

## ☁️ Google Cloud (GCP) — Proxy + Backend + SurrealDB (servidor real, desde 4 ago 2026)

> Reemplaza a Oracle como infraestructura de producción. Mismo patrón que Oracle: Caddy
> + backend Rust en una VM, SurrealDB dedicada en otra, comunicación por IP privada de
> la VPC (nunca por IP pública) — ver `docs/infrastructure/AI_OPERATIONS_CONTEXT.md`.
> Proyecto GCP: **`fluency`** (`project-c73b1fb9-17ae-4d1b-8f4`), zona `us-central1-a`.
> Cuenta con acceso de consola/`gcloud` a este proyecto: `alberto.testing01@gmail.com`
> (la cuenta del pipeline, `azure-pipelines-deployer@launch-490115...`, NO ve este
> proyecto — solo tiene permisos de Artifact Registry sobre `gcr.io/launch-490115`,
> que es donde vive la imagen Docker del backend).
>
> ⚠️ **Pendiente de decisión (4 ago 2026): la zona no es geográficamente óptima.**
> `us-central1-a` es Iowa (interior de EE.UU.); Oracle estaba en Ashburn, Virginia
> (costa este, mejor conectada a Latinoamérica vía cables submarinos — la mayoría de
> los usuarios reales son de Colombia/LATAM, ver datos de `user_activity_stats`).
> Medido en vivo: backend↔SurrealDB (misma VPC) es ~0.5 ms (no es el cuello de
> botella); cliente→`fluency.lat` ronda 350-475 ms, dominado por la distancia
> geográfica, no por el backend/protocolo (WS ya es la opción más rápida que ofrece
> el SDK de SurrealDB — no existe alternativa gRPC para el cliente remoto). Mover
> proxy+DB a una zona este de EE.UU. (`us-east4` = Virginia, la misma región que
> Oracle, o `us-east1`) recuperaría la latencia que había con Oracle — no se hizo
> este cambio todavía, queda a decisión del usuario por el costo/riesgo de migrar
> las VMs otra vez.

### **Proxy + Backend — `fluency-proxy-backend`**
- **IP Pública**: `35.188.162.50`
- **IP Privada VCN**: `10.128.0.4`
- **Rol**: Punto de entrada (Caddy), SSL, backend Rust prod, assets estáticos (mismo rol
  que tenía `server-reverse-proxy` en Oracle).
- **Capacidades**:
  - **Tipo**: `e2-micro` — 2 vCPUs, **1024 MB RAM**.
  - **Disco**: 20 GB `pd-balanced`.
  - **SO**: Alpine Linux (modo diskless: `/` es un **tmpfs de ~485 MB**, se llena fácil —
    no escribir archivos grandes ahí; el disco persistente real está en `/mnt/sda`,
    donde también vive `/var/lib/docker` y el repositorio de assets
    `/mnt/sda/repository/flashcard/`).
  - **Tuning de SO (4 ago 2026, replicado de Oracle — ver `infra/proxy/bootstrap-oracle.sh`)**:
    - **Swap**: 4 GB, `/mnt/sda/swapfile` (NO en `/`, que es tmpfs — un swapfile ahí viviría en
      RAM y sería contraproducente), prioridad `-2`, persistente en `/etc/fstab`.
    - **TCP BBR**: `net.ipv4.tcp_congestion_control=bbr` + `net.core.default_qdisc=fq`, en
      `/etc/sysctl.d/99-bbr.conf` (persiste: el servicio OpenRC `sysctl` — runlevel `boot`, ya
      habilitado — lee `/etc/sysctl.d/*.conf` con `sysctl -p` en cada arranque).
    - **File descriptors**: `65535` soft/hard para `*` y `root` en `/etc/security/limits.conf`.
- **Docker activo (ago 2026)**:
  - `caddy-smart` (Ports 80/443, `--network host`, imagen `caddy:alpine`). Monta
    `/mnt/sda/Caddyfile` → `/etc/caddy/Caddyfile`, `/mnt/sda/repository/flashcard` →
    `/data_repo`, `/mnt/sda/flashcard` → `/flashcard` (prod) y, desde el 4 ago 2026,
    también `/mnt/sda/repository/qa_flashcard` → `/qa_data_repo` y `/mnt/sda/qa_flashcard`
    → `/qa_flashcard` (QA). El estado TLS de Caddy (certificados Let's Encrypt) se
    persiste en `/mnt/sda/caddy_data` → `/data` y `/mnt/sda/caddy_config` → `/config`
    — **sin estos dos mounts, recrear el contenedor reemite certificados** (riesgo de
    rate limit de Let's Encrypt). También monta `/tmp` → `/tmp` del host — **obligatorio**:
    la válvula `api_with_overflow` lee `/tmp/ORACLE_HEALTHY` (lo escribe
    `oracle-ram-monitor.sh` en el host); sin este bind Caddy nunca ve ese archivo y el
    tráfico cae siempre a Cloud Run aunque la VM tenga RAM libre (hallazgo de la
    verificación en vivo del 5 ago 2026, no estaba documentado antes). **Sin límite de
    memoria** (`docker inspect` → `Memory: 0`, verificado 5 ago 2026) — corrige un
    "384m" documentado antes que ya no refleja la realidad. Este Caddyfile real (`/mnt/sda/Caddyfile`, copia fiel
    en `infra/proxy/Caddyfile.gcp`) es una versión mínima manual, distinta del
    `infra/proxy/Caddyfile` "completo" del repo — **sin** el centinela `db_protection`
    (no hay archivos de estado `PROXY_CLOSED`/`GATE_FILE` gestionados en esta VM; si
    SurrealDB se cae, el backend degrada solo a `NullDbRepository`, Caddy no corta
    tráfico). **Sí tiene, desde el 4 ago 2026**, la válvula de overflow a Cloud Run
    (`api_with_overflow`) y el paso `/db/*` hacia SurrealDB (necesario para que Cloud
    Run/AWS puedan conectar vía `wss://fluency.lat/db/rpc` — **el sufijo `/rpc` es
    obligatorio**, el cliente de SurrealDB no lo agrega solo; sin él el login se rompe
    en cuanto el tráfico cae al overflow, ver `scripts/troubleshooting_library.skill.md`
    entrada 9. Con `/rpc` puesto, **también hace falta que `connect()` use el motor
    `Wss` (con TLS), no `Ws`** — el código pela el esquema de `SURREAL_URL` antes de
    conectar, y si no distingue `wss://` de `ws://` al elegir el tipo, conecta siempre
    sin TLS: Cloudflare responde `308 Permanent Redirect` a esa conexión y el backend
    degrada a `NullDbRepository` igual que sin el `/rpc` (mismo síntoma, causa distinta
    — entrada 11) — requiere
    `oracle-ram-monitor.sh` corriendo en background (`nohup`, log en
    `/var/log/oracle-ram-monitor.log`; **no persiste un reboot de la VM**, hay que
    relanzarlo a mano o agregarlo a un init script si hace falta esa garantía) para
    gestionar `/tmp/ORACLE_HEALTHY` (>250 MB libres ⇒ atiende localmente; si no,
    `X-Backend: CloudRun-Overflow`). Verificado en vivo: con la VM bajo presión de RAM
    real (~170 MB disponibles tras las pruebas de este día), el tráfico se desvió solo
    a Cloud Run y siguió sirviendo datos reales sin caerse. Mantener Caddyfile real y
    `infra/proxy/Caddyfile.gcp` sincronizados en estructura es tarea manual. Desde el
    4 ago 2026 SÍ tiene también `asset_cache_policy`/`spa_cache_policy` (`Cache-Control`
    largo para media
    versionada `?v=`/`?t=` y bundles `/assets/`) — sin esto, cada carga repetida de
    una imagen/audio ya vista revalidaba por red en vez de servirse del caché del
    navegador, sumándose a la latencia geográfica real (ver más abajo). ⚠️ Al editar
    este Caddyfile en la VM, sobrescribir el contenido del mismo archivo (`cat >`),
    **nunca `mv`** — un bind mount de archivo único de Docker sigue el inodo, no la
    ruta, y un `mv` lo desconecta silenciosamente (el contenedor sirve el Caddyfile
    de fábrica sin ningún error en `validate`/`reload`); si pasa, `docker restart`
    (no `recreate`) lo resuelve sin perder los certificados TLS. Detalle en
    `scripts/troubleshooting_library.skill.md` entrada 8.
  - `flashcard-backend-node` (Port 8080, `SURREAL_URL=ws://10.128.0.5:8080` —
    el código pela el esquema antes de conectar: ver
    `backend/api_main/src/infrastructure/storage/surreal/connection.rs`, incidente
    del 4 ago 2026 donde pasar la URL con esquema `ws://` directo a
    `Surreal::new::<Ws>()` colgaba la conexión indefinidamente en vez de dar error.
    `connect()` además decide `Ws` vs `Wss` según ese esquema antes de pelarlo —
    para esta conexión interna sin TLS da igual, pero es el mismo código que usan
    Cloud Run/AWS con `wss://`, donde sí importa, entrada 11 de
    `scripts/troubleshooting_library.skill.md`). `SURREAL_NS=flashcard`,
    `SURREAL_DB=flashcard`, monta `/mnt/sda/repository/flashcard` → `/data`, límite
    `512m`.
  - `qa-flashcard-backend-node` (Port 8081, desde el 4 ago 2026 — migración de QA a
    GCP). Mismo binario/imagen que producción (`gcr.io/launch-490115/flashcard-backend`),
    diferenciado solo por env vars: `SURREAL_NS=qa_flashcard`, `SURREAL_DB=qa_flashcard`,
    `PORT=8081`, monta `/mnt/sda/repository/qa_flashcard` → `/data`, límite `128m` /
    `--cpu-shares 128` (cede CPU a producción bajo contención — ver
    `AI_OPERATIONS_CONTEXT.md`). ⚠️ Requiere el backend con el fix del 4 ago 2026 que
    lee `SURREAL_NS`/`SURREAL_DB` de entorno — antes de ese fix estos valores estaban
    hardcodeados a `"flashcard","flashcard"` en `main.rs` y un contenedor QA con estas
    variables igual escribía en el namespace de producción (ver `connect_surreal_with_retry`
    en `api_main/src/main.rs`).
- **Repositorio de assets QA**: `/mnt/sda/repository/qa_flashcard/{card_images,card_audio,json}`,
  poblado desde `/mnt/sda/repository/flashcard` (mismo contenido que prod como punto de
  partida — ver `infra/proxy/sync-qa-repository.sh`, adaptado a rutas GCP).
- **Frontend QA**: `/mnt/sda/qa_flashcard`, mismo build Vite que producción (perfil
  `production.profile` es compartido entre `main` y `qa`, sin flags distintas).
- **NO corre aquí**: SurrealDB (vive en `fluency-db-surreal`).
- **Acceso**: `root` / contraseña en `.agents/skills/sync-images-to-oracle/SKILL.md`
  (nombre del skill es legado, la IP/contraseña ya son las de GCP).

### **DB Node — `fluency-db-surreal`**
- **IP Pública**: ninguna (no expuesta — por diseño, igual que OCI-1 en Oracle).
- **IP Privada VCN**: `10.128.0.5`
- **Rol**: **Solo SurrealDB 3.2.3** (progreso flashcards, usuarios, auth).
- **Capacidades**:
  - **Tipo**: `e2-small` — 2 vCPUs, **2048 MB RAM** (el doble que Oracle OCI-1).
  - **Disco**: 10 GB `pd-balanced` (`/dev/sda`, verificado ~9.7G).
  - **SO**: Alpine Linux. **Verificado en vivo (5 ago 2026)**: mismo patrón "diskless"
    que el proxy — `/` es tmpfs, el disco persistente real vive en `/mnt/sda` (también
    bind-montado en `/var/lib/docker`, igual que en el proxy). No estaba documentado
    hasta esta verificación.
  - **Tuning de SO (verificado en vivo, 5 ago 2026)**: swapfile de **4 GB** en
    `/mnt/sda/swapfile` (pri `-2`, persistente en `/etc/fstab`), igual que el proxy.
    A diferencia del proxy, **NO tiene TCP BBR ni fd-limits** (`sysctl
    net.ipv4.tcp_congestion_control` = `cubic`, `default_qdisc` = `pfifo_fast` — sin
    tocar; `/etc/security/limits.conf` sin entradas `nofile` agregadas). Consistente
    con que BBR ataja la latencia hacia clientes externos, que solo terminan en el
    proxy — ver `AI_OPERATIONS_CONTEXT.md`.
- **Docker activo (verificado `docker inspect`, 5 ago 2026)**:
  - `surrealdb` (imagen `surrealdb/surrealdb:v3.2.3`, `--network host`, sin IP pública).
  - Datos en **`/mnt/sda/surreal_data:/data`** (persistente — no confundir con
    `/root/surreal_data`, que viviría en el tmpfs efímero de `/` y se perdería en
    cada reboot).
  - Cmd real: `start --user root --pass root --bind 0.0.0.0:8080 rocksdb:/data/surreal.db`.
  - **Memoria: `--memory 1200m --memory-swap 2200m`** (bytes exactos en `docker inspect`:
    `1258291200`/`2306867200`) — corrige un valor anterior de `800m` que ya no refleja
    la realidad (dato desactualizado, no se sabe desde cuándo).
  - **Sin `HEALTHCHECK` configurado** (`docker inspect --format '{{json .State.Health}}'`
    devuelve `null`) — corrige la nota anterior sobre un healthcheck a
    `localhost:8000/health` marcando el contenedor `unhealthy`; eso ya no aplica al
    estado real verificado.
- **NO corre aquí**: Rust, Caddy.
- **Acceso**: sin SSH directo por IP pública (timeout) — se entra haciendo *hop* desde
  `fluency-proxy-backend` (`ssh` a `10.128.0.5` con la misma contraseña, una vez dentro
  del proxy).
- **Documentación detallada de la Oracle equivalente (OCI-1)**, útil como referencia de
  arquitectura: [`tools/oracle-legacy/ARQUITECTURA_ORACLE_DB.md`](../../tools/oracle-legacy/ARQUITECTURA_ORACLE_DB.md).

### Overflow / Cloud Run + Worker Alpine (proyecto `launch-490115` — DISTINTO del proyecto `fluency` de arriba)

> ⚠️ Este es un proyecto GCP diferente al de `fluency-proxy-backend`/`fluency-db-surreal`.
> `launch-490115` es donde vive el Artifact Registry (`gcr.io/launch-490115/...`) y el
> overflow de Cloud Run; `project-c73b1fb9-17ae-4d1b-8f4` ("fluency") es donde viven las
> VMs de proxy/backend/DB reales. No confundir credenciales/proyectos entre ambos.

### **Backend (Cloud Run)**
- **URL**: `https://flashcard-backend-977952175712.us-east1.run.app`
- **Rol**: API Server escalable (Serverless).
- **Capacidades**: 
  - Escalado automático de 0 a 10 instancias.
  - Memoria: 512MB - 1GB por instancia.
- **Proyecto**: `launch-490115` (launch-490115).

### **Worker Alpine (GCP)**
- **Nombre**: `alpine-server-01`
- **Zona**: `us-east1-c`
- **IP Pública**: `35.229.65.204` (Dinámica ⚠️)
- **Rol**: Procesamiento de Backend secundario.
- **Capacidades**:
  - **CPU**: 2 vCPUs (e2-micro).
  - **RAM**: 1 GB (Uso base: ~96MB | Disponible: ~760MB).
  - **Disco**: 30 GB (PD-Standard).
- **Acceso**: `root` / `[PROTECTED]`

---

## 🖥️ Estación de compilación y generación (LocalBuild — PC dev)

- **Nombre**: agente Azure DevOps del pool `LocalBuild` (PC de desarrollo, Linux).
- **Rol**: TODA la compilación (frontend Vite/bun + `docker buildx` dual-arch del backend) y
  TODA la generación de media por lotes. Los servidores cloud de 1 GB jamás compilan ni generan.
- **Capacidades**:
  - **RAM**: ~30 GB.
  - **GPU 0**: NVIDIA RTX 5060 Ti 16 GB → **ComfyUI/Flux 2** (generación de imágenes), servicio
    systemd `comfyui.service` con `CUDA_VISIBLE_DEVICES=0`, puerto `127.0.0.1:8188`, flag
    `--cache-none`, instalado en `/home/jcoronado/Desktop/dev/ComfyUI`.
  - **GPU 1**: NVIDIA GTX 1660 Ti 6 GB → **Ollama/Qwen** (refinado de prompts), override systemd
    `/etc/systemd/system/ollama.service.d/override.conf` con `CUDA_VISIBLE_DEVICES=1`, puerto `127.0.0.1:11434`.
  - ⚠️ La separación por GPU resolvió OOMs de torch (jul 2026): no volver a juntar ambos en la GPU 0.
- **Servicios dev**: backend Rust :8081, Vite :5173, SurrealDB local :8001, Postgres :5432 (ver `start.sh`).
- **Cachés de build**: Bun + Docker buildx (`gcr.io/launch-490115/flashcard-backend:buildcache`).

---

## 🔒 Red privada WireGuard (AWS ↔ Oracle)

> ⚠️ **Archivado junto con Oracle (4 ago 2026)**: este túnel tenía como destino
> `server-reverse-proxy`, que ya no es el servidor real. El pipeline (`Mirror_AWS`)
> sigue seteando `SYNC_TO_ORACLE=true`/`ORACLE_HOST` en el contenedor de AWS, pero
> apunta a la config vigente de `ORACLE_HOST` (hoy la IP del proxy GCP por default de
> `config.rs`) — no se verificó en este archivado si el túnel WireGuard en sí sigue
> activo hacia la IP vieja de Oracle. Antes de asumir que este mecanismo mueve assets
> a algún lado, confirmar en vivo. Doc completa (congelada):
> [`tools/oracle-legacy/wireguard-aws-oracle.md`](../../tools/oracle-legacy/wireguard-aws-oracle.md).

Túnel cifrado para el SCP de assets sin internet pública (~120 ms → ~25 ms).

| Nodo | IP pública | IP túnel |
|---|---|---|
| AWS `alpine-aws-01` | `34.229.229.255` | `10.10.0.1/30` |
| Oracle `server-reverse-proxy` (archivado) | `157.151.199.170` | `10.10.0.2/30` |

Puerto UDP `51820`, interfaz `wg0`, keepalive 25 s. Setup: `infra/wireguard/setup-tunnel.sh`.

---

## 🐘 Postgres: estado real (veredicto — no reabrir sin evidencia)

- **NO es la base de datos del producto.** La DB activa es SurrealDB 3.2.3 en GCP
  (`fluency-db-surreal`, ver sección GCP arriba; antes vivía en OCI-1/Oracle, archivado).
- Postgres existe en 2 sitios: `docker-compose.yml` local (Postgres 15, contenedor
  `flashcard-db:5432`, lo levanta `start.sh` en dev) y como capacidad prevista en la VM de Azure.
  Sin uso en producción; la dependencia `sqlx` se eliminó del backend en jul 2026.
- **Los pagos del producto SÍ están desarrollados y activos** — corren sobre SurrealDB vía
  LemonSqueezy, no sobre Postgres. Ver [`../modules/pricing.md`](../modules/pricing.md).
- Cualquier doc/skill que trate a Postgres como DB operativa del producto está desactualizada.

---

## ☁️ Amazon Web Services (AWS)
### **Worker Native (Alpine)**
- **Nombre**: `alpine-aws-01`
- **ID de Instancia**: `i-04c534d13578093c2`
- **Región**: `us-east-1` (Virginia)
- **IP Pública**: `34.229.229.255` (Dinámica ⚠️)
- **Rol**: Procesamiento de Backend (Rust Worker) / Backup.
- **Capacidades**:
  - **CPU**: 2 vCPUs (t3.micro).
  - **RAM**: 1 GB (Uso base: ~82MB | Disponible: ~732MB).
  - **Disco**: 28 GB (NVMe EBS).
  - **SO**: Alpine Linux (Nativo via OS Takeover).
- **Acceso**: 
  - **SSH**: `ssh -i keys/flashcard-aws-key.pem alpine@34.229.229.255`
  - **Nota**: El usuario es `alpine` o `root` dependiendo del estado del takeover.

---

## 🔐 Resumen de Recursos Totales
- **Cores Totales**: ~7-8 vCPUs Multi-Cloud.
- **RAM Total**: ~5.5 GB distribuidos; **no es memoria compartida** entre procesos.
- **Estrategia vigente**: el proxy de GCP (`fluency-proxy-backend`) es el punto de entrada,
  backend principal y disco de assets; la DB dedicada de GCP (`fluency-db-surreal`) corre
  SurrealDB. El PC LocalBuild compila. GCP Cloud Run (proyecto `launch-490115`, distinto del
  proyecto `fluency`) es overflow y AWS es espejo. Azure es infraestructura auxiliar sin uso
  activo hoy; no es la base de datos activa de flashcards (los pagos reales corren vía
  LemonSqueezy + SurrealDB, ver §Postgres). **Oracle queda archivado como respaldo apagado** —
  ver [`tools/oracle-legacy/README.md`](../../tools/oracle-legacy/README.md).
- **Lectura obligatoria antes de optimizar**:
  [`AI_OPERATIONS_CONTEXT.md`](AI_OPERATIONS_CONTEXT.md).
- **Blueprint de reconstrucción (Disaster Recovery)**: [`infra/terraform/README.md`](../../infra/terraform/README.md)
  reproduce en Terraform la infraestructura real de GCP de esta sección (proxy, DB, red,
  overflow Cloud Run) para poder recrearla si el proyecto/VMs se pierden. No corre solo ni
  forma parte del pipeline; requiere una imagen Alpine existente (ver limitación en ese README)
  y `terraform apply` manual. AWS/Azure y Oracle quedan fuera a propósito (espejo/auxiliar/archivado).

---

## 🤖 Para la IA (Machine-Readable)
- **capabilities**: [infrastructure_inventory, multi_cloud_tracking, resource_allocation]
- **limitations**: [static_document, manual_updates_required_on_ip_change]
- **dependencies**: [cloud_providers: aws, azure, gcp]
- **active_vms**:
    - **Azure**: worker-alpine-native-1 (172.202.197.64) | infraestructura auxiliar/futura | 1GB RAM
    - **AWS**: alpine-aws-01 (34.229.229.255, túnel wg 10.10.0.1) | espejo/worker | 1GB RAM
    - **GCP (Proxy+Backend)**: fluency-proxy-backend (35.188.162.50 / 10.128.0.4, proyecto `fluency`) | Caddy + Rust | 1GB RAM (e2-micro)
    - **GCP (DB)**: fluency-db-surreal (sin IP pública / 10.128.0.5, proyecto `fluency`) | SurrealDB :8080 | 2GB RAM (e2-small)
    - **LocalBuild (no cloud)**: PC dev | compilación + ComfyUI/Flux 2 (GPU0 RTX 5060 Ti 16GB) + Ollama/Qwen (GPU1 GTX 1660 Ti 6GB) | 30GB RAM
- **archived_vms**: [Oracle server-reverse-proxy (157.151.199.170), Oracle server-oci-1 (129.158.214.227) — ver tools/oracle-legacy/]
- **architecture_doc**: tools/oracle-legacy/ARQUITECTURA_ORACLE_DB.md (histórico, arquitectura equivalente en Oracle)

- **update_protocol**: Must be updated whenever an IP changes, a new VM is provisioned, or a VM is destroyed.
