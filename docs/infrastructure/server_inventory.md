# 📊 Infrastructure Inventory (Multi-Cloud)

> **PRIMARY source for IPs, RAM, CPU, disk, provider, SSH users, and containers.**
> Prohibited to connect via SSH to query OS data that this document already covers.
> SSH only if this doc fails or contradicts runtime — and then **updated here in the same change**. Decision rules and RAM budget: [`AI_OPERATIONS_CONTEXT.md`](AI_OPERATIONS_CONTEXT.md).

This document details the capabilities and roles of all active servers in the Fluency ecosystem.

## ☁️ Microsoft Azure
### **Worker Native (Alpine)**
- **Name**: `worker-alpine-native-1`
- **Resource Group**: `environment-azure`
- **Location**: `southcentralus`
- **Public IP**: `172.202.197.64` (Static ✅)
- **Private IP**: `10.0.0.6`
- **Role**: Historical auxiliary infrastructure.
- **Capabilities**:
  - **CPU**: 2 vCPUs (ARM64 Ampere Altra @ 3.0 GHz).
  - **RAM**: 1 GB.
  - **Disk**: 32 GB Standard SSD.
  - **OS**: Alpine Linux 3.19 (Native).

---

## ☁️ Oracle Cloud (OCI) — ARCHIVED (Power-off Backup, Aug 4, 2026)

> Oracle is no longer Fluency's live production server. The machines (`server-reverse-proxy` and `server-oci-1`) remain as cold backup, but **no pipeline or active code touches them**. Full inventory, specs, access, and reactivation guide are frozen in [`tools/oracle-legacy/README.md`](../../tools/oracle-legacy/README.md). The live production server today is GCP (section below).

---

## ☁️ Google Cloud (GCP) — Proxy + Backend + SurrealDB (Live Production Server)

> Replaces Oracle as production infrastructure. Same pattern as Oracle: Caddy + Rust backend on one VM, dedicated SurrealDB on another, communication via VPC private IP (never public IP) — see `docs/infrastructure/AI_OPERATIONS_CONTEXT.md`.
> GCP Project: **`fluency`** (`project-c73b1fb9-17ae-4d1b-8f4`), zone `us-central1-a`.

### **Proxy + Backend — `fluency-proxy-backend`**
- **Public IP**: `35.188.162.50`
- **VCN Private IP**: `10.128.0.4`
- **Role**: Entry point (Caddy), SSL, prod Rust backend, static assets.
- **Capabilities**:
  - **Type**: `e2-micro` — 2 vCPUs, **1024 MB RAM**.
  - **Disk**: 20 GB `pd-balanced`.
  - **OS**: Alpine Linux (diskless mode: `/` is tmpfs ~485 MB — do not write large files there; persistent disk is at `/mnt/sda/repository/flashcard/`).
  - **Swap**: 4 GB swapfile at `/mnt/sda/swapfile`.
  - **TCP BBR**: Enabled (`net.ipv4.tcp_congestion_control=bbr`).

- **Active Docker Containers**:
  - `caddy-smart` (Ports 80/443, `--network host`, `caddy:alpine`). Mounts `/mnt/sda/Caddyfile`, `/mnt/sda/repository/flashcard`.
  - `flashcard-backend-node` (Port 8080, `SURREAL_URL=ws://10.128.0.5:8080`, `SURREAL_NS=flashcard`, `SURREAL_DB=flashcard`, limit `512m`).
  - `qa-flashcard-backend-node` (Port 8081, `SURREAL_NS=qa_flashcard`, `SURREAL_DB=qa_flashcard`, limit `128m`).

### **DB Node — `fluency-db-surreal`**
- **Public IP**: None (not exposed).
- **VCN Private IP**: `10.128.0.5`
- **Role**: **SurrealDB 3.2.3 only** (flashcards progress, users, auth).
- **Capabilities**:
  - **Type**: `e2-small` — 2 vCPUs, **2048 MB RAM**.
  - **Disk**: 10 GB `pd-balanced`.
  - **OS**: Alpine Linux.
  - **Swap**: 4 GB swapfile at `/mnt/sda/swapfile`.

- **Active Docker Container**:
  - `surrealdb` (`surrealdb/surrealdb:v3.2.3`, `--network host`, `--memory 1200m --memory-swap 2200m`). Persistent data at `/mnt/sda/surreal_data:/data`.

---

## 🖥️ Build & Generation Station (LocalBuild — Dev PC)

- **Name**: Azure DevOps agent `LocalBuild` pool (Development PC, Linux).
- **Role**: ALL compilation (Vite frontend + dual-arch `docker buildx` of Rust backend) and ALL batch media generation. 1 GB cloud servers NEVER compile or generate media.
- **Capabilities**:
  - **RAM**: ~30 GB.
  - **GPU 0**: NVIDIA RTX 5060 Ti 16 GB → **ComfyUI/Flux 2** (image generation), port `127.0.0.1:8188`.
  - **GPU 1**: NVIDIA GTX 1660 Ti 6 GB → **Ollama/Qwen** (prompt refinement), port `127.0.0.1:11434`.

---

## ☁️ Amazon Web Services (AWS)
### **Worker Native (Alpine)**
- **Name**: `alpine-aws-01`
- **Region**: `us-east-1` (Virginia)
- **Public IP**: `34.229.229.255`
- **Role**: Backend Processing (Rust Worker) / Backup.
- **Capabilities**: 2 vCPUs (t3.micro), 1 GB RAM, 28 GB NVMe EBS.

---

## 🤖 Machine-Readable Summary
- **capabilities**: [infrastructure_inventory, multi_cloud_tracking, resource_allocation]
- **limitations**: [static_document, manual_updates_required_on_ip_change]
- **dependencies**: [cloud_providers: aws, azure, gcp]
- **active_vms**:
    - **Azure**: worker-alpine-native-1 (172.202.197.64) | auxiliary infra | 1GB RAM
    - **AWS**: alpine-aws-01 (34.229.229.255) | mirror/worker | 1GB RAM
    - **GCP (Proxy+Backend)**: fluency-proxy-backend (35.188.162.50 / 10.128.0.4) | Caddy + Rust | 1GB RAM
    - **GCP (DB)**: fluency-db-surreal (10.128.0.5) | SurrealDB 3.2.3 :8080 | 2GB RAM
    - **LocalBuild (non-cloud)**: Dev PC | Compilation + ComfyUI/Flux 2 (GPU0 16GB) + Ollama/Qwen (GPU1 6GB) | 30GB RAM
