# Mandatory Operational Context for AI and Maintenance

> Entry source of truth for any session modifying infrastructure, performance, caching, media, Caddy, or pipeline.

## Reading Order and Precedence

1. This document: current topology, resource budget, decision rules.
2. [`server_inventory.md`](server_inventory.md): IPs, RAM, CPU, provider per machine — **primary source; never SSH for data already covered**.
3. [`media-delivery-cache.md`](media-delivery-cache.md): versioning, Cloudflare, Caddy, browser, images/audio, prefetching.
4. [`pipeline-and-deploy.md`](pipeline-and-deploy.md): compilation, staging, and deployment.
5. Executable code: `azure-pipelines.yml`, `infra/proxy/Caddyfile`, and `infra/proxy/*.sh`.

> **Oracle is archived** (powered-off backup since Aug 4, 2026 — see [`tools/oracle-legacy/README.md`](../../tools/oracle-legacy/README.md)).

If documentation contradicts executable code, **do not silently choose one**: verify runtime, update documentation in the same change, and record date.

## Real Architecture: Proxy + DB in GCP (1-2 GB each)

| Node | Current Role & Resources | Must NOT Receive |
|---|---|---|
| GCP Proxy `fluency-proxy-backend` — `35.188.162.50` / `10.128.0.4` | ~1 GB RAM (e2-micro), 2 vCPUs, Alpine (`/` is tmpfs diskless ~485 MB, persistent disk at `/mnt/sda`). Caddy, prod Rust backend, media/JSON disk. | Rust/Vite compilation, SurrealDB, binary media caching in backend, asset-per-process generation. |
| GCP DB `fluency-db-surreal` — private `10.128.0.5` | ~2 GB RAM (e2-small), 2 vCPUs, Alpine. **SurrealDB 3.2.3 only** at `:8080`. | Caddy, Rust backend, image/audio generation, compilation. |

`LocalBuild` PC (~30 GB RAM) compiles frontend and backend. GCP Proxy only receives artifacts, runs `docker pull`/`docker run`, syncs files, and serves traffic.

⚠️ **SurrealDB Connection Invariant**: backend uses `Surreal::new::<Ws>(endpoint)`, expecting `endpoint` **without** scheme (`host:port` stripped, NOT `ws://host:port`). Passing scheme hangs connection until timeout and degrades backend to `NullDbRepository`.

## Traffic Routing

```text
Production
User → Cloudflare → Caddy on GCP Proxy (fluency-proxy-backend)
                    ├─ SPA/HTML/JS/CSS → disk
                    ├─ /card_images & /card_audio → local disk, file_server
                    ├─ /json → local disk, file_server browse + compression
                    └─ /api → local Rust backend if /tmp/ORACLE_HEALTHY exists
                              └─ GCP Cloud Run if RAM pressure monitor triggers

Persistence
Rust Backend → SurrealDB 10.128.0.5:8080 via private VPC → GCP DB (fluency-db-surreal)
```

## RAM and CPU Budget

| Process/Container | Current Ceiling | Notes |
|---|---:|---|
| Prod Rust backend, GCP Proxy | `512m` (memory-swap `512m`) | Protects Caddy from global OOM. |
| Caddy, GCP Proxy | **unlimited** (`Memory: 0`) | Mounts `-v /tmp:/tmp`. |
| QA Backend, GCP Proxy | `128m`, `cpu-shares=128` | Yields CPU to production under contention. |
| SurrealDB, GCP DB | `1200m`, memory-swap `2200m` | Dedicated VM `e2-small` (2 GB). |

Mandatory rules for this budget:
- Do not compile or run `docker buildx` on GCP Proxy.
- Do not store raw image/audio bytes in backend maps or JavaScript `Blob` objects.
- Do not create a full process, SSH/SCP, or content hash per download.
- Prefetch only next existing image and audio.
- Do not generate media during prefetching. `404` stops anticipation.

## Cache Layers & Responsibilities

| Layer | What it Stores | Policy |
|---|---|---|
| Rust Backend | Small/bounded metadata only; **no media bytes** | Resolves `?v=` metadata. |
| Caddy | No app cache configured | `file_server` reads disk volume, sends ETag/Last-Modified. |
| Kernel Linux | Normal page cache | Uses free RAM to accelerate disk. |
| Cloudflare edge | Production versioned media | Cache Rule `Versioned Media` (1 year TTL via `Cloudflare-CDN-Cache-Control`). |
| Browser | HTTP Cache | Identity changes via `?v=`. |

## Versioning Invariant for Images and Audio

Physical filenames may remain identical. Backend returns:

```text
/card_images/.../card.avif?v=<mtime-nanoseconds>-<size>
/card_audio/.../card.ogg?v=<mtime-nanoseconds>-<size>
```

When overwriting a file, metadata changes and updates the URL parameter. Rest of catalog is NOT regenerated.

## Verification Checklist After Changes

1. `curl https://fluency.lat/api/health`: 200, `server: cloudflare`, expected `X-Backend`.
2. `curl https://qa.fluency.lat/api/health`: 200 direct Caddy when QA deployed.
3. Versioned URL request: `CF-Cache-Status` moves from `MISS` to `HIT`.
4. Overwrite test file: resolving again produces new `?v=` parameter.
5. Check RAM/swap on both GCP VMs.

## Errors Never to Repeat

- Treating the two GCP VMs as a single pool of RAM.
- Moving SurrealDB to proxy VM or using `127.0.0.1:8001` in production.
- Passing a scheme URL (`ws://...`) to `Surreal::new::<Ws>()`.
- Adding binary byte caching in Rust/JS to accelerate UI.
- Prefetching multiple cards or invoking AI generation during prefetch.
- Caching HTML, API, or JSON with media cache rules.
