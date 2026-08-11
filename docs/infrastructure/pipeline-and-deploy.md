# Pipeline y Deploy — Guía canónica (Jul 2026)

> **Documento fuente de verdad** para IAs y operadores sobre CI/CD, compilación y despliegue.
> Si otro archivo contradice esto, **este documento manda** (salvo `SECRETS_MAP.md` para credenciales).

**Última validación:** migración Fluency — repo `fluency.lat`, pipeline `jcoronado1982.fluency` (Ago 2026).


**Repositorio y Azure:** [`../DEPLOY_Y_REPOSITORIO.md`](../DEPLOY_Y_REPOSITORIO.md)

> ⚠️ **Actualización parcial (4 ago 2026):** producción se migró de Oracle a GCP y los jobs
> `Mirror_Oracle`/`Mirror_OCI1` del stage 5 quedaron deshabilitados (`condition: false`). Este
> documento describe todavía el flujo tal como era en Oracle porque sigue siendo la referencia más
> completa del *patrón* de deploy (secretos, `SSH@0 inline`, scripts canónicos) — los puntos que ya
> no aplican están marcados explícitamente abajo. Ver `tools/oracle-legacy/README.md` para qué se
> desconectó exactamente y `docs/infrastructure/server_inventory.md` para la topología vigente.

**Documentos relacionados (no duplicar lógica aquí):**
- Restricciones de los servidores de GCP (antes Oracle) y protocolo para IA:
  [`AI_OPERATIONS_CONTEXT.md`](AI_OPERATIONS_CONTEXT.md)
- Runtime Oracle / audio / Caddy (archivado): [`../../tools/oracle-legacy/oracle-local-backend-deploy.md`](../../tools/oracle-legacy/oracle-local-backend-deploy.md)
- Inventario servidores: [`server_inventory.md`](server_inventory.md)
- Scripts de deploy: `infra/proxy/*.sh`

---

## Resumen en una frase

**Tu PC compila (front + backend multi-arch); el agente `Default` solo despliega (copia archivos, `docker pull`, `docker run`) — hoy solo a Oracle (frontend) y AWS, ver nota arriba; los secretos vienen de Azure DevOps y nunca se guardan en disco en el servidor destino.**

---

## Dos pools de agentes

| Pool | Máquina | Qué hace | Qué NO hace |
|------|---------|----------|-------------|
| **`LocalBuild`** | PC del desarrollador (`~/azp-agent-localbuild`) | Compila frontend (bun/vite), cross-compile Rust amd64+arm64, push GCR | No toca servidores de producción |
| **`Default`** | Agente self-hosted ARM (`jcoronado-ubuntu-22`, históricamente hospedado en Oracle) | SSH/SCP a servidores, `docker pull`, `gcloud`, scripts `infra/proxy/` | **Nunca compila** Rust ni frontend |

**Requisito:** el agente `LocalBuild` debe estar **online** cuando corre el pipeline. Si el PC está apagado, fallan stages 1 y 2.

Instalación del agente local: `infra/ci/install-local-agent.sh`

---

## Flujo del pipeline (6 stages)

```
┌─────────────────────────────────────────────────────────────┐
│  PARALELO (pools distintos)                                 │
│  Stage 1 Build_Frontend  [LocalBuild]  bun + vite           │
│  Stage 2 Build_Backend   [LocalBuild]  docker buildx → GCR  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼  SERIALIZADO en pool Default
                    Stage 3 Deploy_Frontend (Oracle Caddy — sin cambios, ver nota arriba)
                              │
                              ▼
                    Stage 4 Deploy_GCP (Cloud Run)
                              │
                              ▼
                    Stage 5 Deploy_Mirrors
                         Oracle (deshabilitado) → OCI-1 (deshabilitado) → AWS (independiente)
                              │
                              ▼
                    Stage 6 Cleanup (workspace agentes + artefacto ADO)
```

> Desde el 4 ago 2026, `Mirror_Oracle` y `Mirror_OCI1` tienen `condition: false` — no se ejecutan.
> `Mirror_AWS` ya no depende de `Mirror_OCI1` (se independizó, `dependsOn: []`) para que no quedara
> huérfano al apagar los otros dos.

### Tiempos esperados (referencia)

| Fase | Duración típica | Por qué tarda |
|------|-----------------|-------------|
| Cola / espera agente | 0–5 min | `LocalBuild` debe estar online; si hay otro build corriendo, espera |
| Stage 1 — Frontend | 2–5 min | `bun install` + `vite build`; cache bun acelera |
| Stage 2 — Backend buildx | **15–35 min** | Cross-compile Rust **amd64 + arm64**, push GCR; timeout job **45 min** |
| Stages 3→5 — Deploys | **8–15 min** | **En serie** (Oracle frontend → Cloud Run → AWS; Mirror_Oracle/OCI1 deshabilitados desde 4 ago 2026); un solo agente `Default` |
| Stage 6 — Cleanup | 1–2 min | Limpia disco en agentes; intenta borrar artefacto `flashcard-site` |
| **Total end-to-end** | **~25–45 min** | Normal en esta arquitectura |

**No encolar dos builds a la vez** (manual + push CI). El 2026-06-18 se encolaron 6 runs duplicados (`main` y `qa` × manual + automático) → el doble de tiempo y artefactos huérfanos.

**Si parece “colgado”:** revisar Stage 2 en Azure (buildx push a GCR) o que `LocalBuild` no esté offline.

### Por qué los deploys van en serie (no en paralelo)

Antes, stages 3, 4 y 5 arrancaban a la vez → **5 jobs** compitiendo por **1 agente** `Default` y límite de paralelismo self-hosted → colas y fallos.

**Desde `fe8cc2c` (jun 2026) hasta el 4 ago 2026:**
- Stage 4 espera a Stage 3 (`dependsOn: Deploy_Frontend`)
- Stage 5 espera a Stage 4 (`dependsOn: Deploy_GCP`, con skip si build backend falló)
- Dentro del stage 5: `Mirror_OCI1` → `dependsOn: Mirror_Oracle`; `Mirror_AWS` → `dependsOn: Mirror_OCI1`

**Desde el 4 ago 2026:** `Mirror_Oracle` y `Mirror_OCI1` quedaron con `condition: false` (no compiten
por el agente porque no corren). `Mirror_AWS` pasó a `dependsOn: []` — ya no espera a nadie dentro
del stage 5, corre en cuanto el stage arranca.

Stages 1 y 2 **siguen en paralelo** (correcto: usan `LocalBuild`, no compiten con el agente `Default`).

---

## Stage 1 — Build Frontend (`LocalBuild`)

- Cache de módulos bun (`Cache@2`)
- `VITE_API_URL=https://fluency.lat` (**sin** `/api` al final)
- Publica artefacto `flashcard-site` (`client/dist`)

---

## Stage 2 — Cross-Compile Backend (`LocalBuild`)

- `docker buildx` plataformas `linux/amd64,linux/arm64`
- Push a `gcr.io/launch-490115/flashcard-backend:latest`
- Cache registry: `gcr.io/launch-490115/flashcard-backend:buildcache` (`mode=min`)
- **3 reintentos** de push con re-login GCR (evita `DeadlineExceeded`)
- Timeout job: 45 min; `DOCKER_CLIENT_TIMEOUT=300`
- Login GCR: task `Docker@2` + re-login con `GCP_KEY_JSON` en reintentos

**No ejecutar buildx en Oracle** (1 GB RAM — regla de oro).

---

## Stage 3 — Deploy Frontend (`Default` → Oracle)

1. Descarga artefacto `flashcard-site`
2. `CopyFilesOverSSH` → `/root/smart-proxy/flashcard`
3. `CopyFilesOverSSH` → sync `infra/proxy/*` a `/root/smart-proxy/infra-proxy/`
4. `SSH@0` → `bootstrap-oracle.sh --caddy-only`

Scripts copiados en cada deploy: `bootstrap-oracle.sh`, `deploy-caddy.sh`, `deploy-oracle-backend.sh`, `docker-gcr-auth.sh`, etc.

---

## Stage 4 — Deploy GCP Cloud Run (`Default`)

- Solo si Stage 2 succeeded
- `gcloud run deploy flashcard-backend` con imagen `:latest` de GCR
- Espejo/overflow histórico; **producción principal no depende de Cloud Run**

> ⚠️ **Este stage nunca había funcionado en `main`** (diagnosticado el 5 ago 2026). Falló con
> `PERMISSION_DENIED: Permission 'run.services.get' denied ... authenticated as
> alberto.testing01@gmail.com` en los builds 388 y 391 — los **únicos dos** runs de `main` desde
> que el stage existe (el último `main` verde, run 318 del 21 jul, tenía un pipeline de solo 2
> stages, sin `Deploy_GCP`). No es una regresión: nació roto.
>
> **Causa raíz:** el step heredaba la cuenta `gcloud` *activa del agente*, que es estado
> compartido de la máquina — un humano que corra `gcloud config set account` ahí (p. ej. durante
> la migración a GCP del 4 ago) cambia con qué identidad despliega el pipeline. Verificado en
> vivo: `alberto.testing01@gmail.com` **no** tiene `run.services.get` sobre `launch-490115`,
> mientras que `azure-pipelines-deployer@launch-490115.iam.gserviceaccount.com` **sí** (y sus
> credenciales ya están en el credential store del usuario `jcoronado`, que es con el que corren
> ambos agentes). **Corregido** fijando `CLOUDSDK_CORE_ACCOUNT` en el propio step, para no
> depender del ambiente.
>
> Impacto mientras estuvo roto: como `Deploy_Mirrors` exige
> `in(dependencies.Deploy_GCP.result, 'Succeeded', 'Skipped')` y aquí el resultado era `Failed`,
> **arrastraba a `Mirror_AWS` a `Skipped`** — el único mirror activo no se actualizaba. El backend
> de producción real (la VM de GCP) no se ve afectado porque este pipeline nunca lo despliega
> (ver sección siguiente).
>
> **Segundo bug del mismo stage (destino de media legado — corregido a medias):** `ORACLE_HOST`
> y `ORACLE_SSH_PASSWORD` **no existían en ningún lado**, así que Azure dejaba el literal
> `$(ORACLE_HOST)`, bash lo interpretaba como sustitución de comando (de ahí los
> `ORACLE_HOST: command not found` del log) y el valor llegaba **vacío**. Verificado en el
> servicio Cloud Run vivo: `SYNC_TO_ORACLE='true'` con `ORACLE_HOST=''`. Además
> `ORACLE_REMOTE_PATH` apuntaba a la ruta de Oracle (`/root/smart-proxy/repository/flashcard`),
> que **no existe en el proxy de GCP** (verificado por SSH) — la real es
> `/mnt/sda/repository/flashcard`. **El mismo defecto afectaba a `Mirror_AWS`**, no solo a
> Cloud Run. Consecuencia: si el tráfico caía al overflow y un premium/admin generaba audio o
> imagen, el SCP iba a un host vacío y fallaba (patrón "Audio 500 `ssh mkdir 255`").
>
> Corregido en el YAML: `ORACLE_HOST` (`35.188.162.50`) y `ORACLE_REMOTE_PATH`
> (`/mnt/sda/repository/flashcard`) ahora son variables del pipeline — el prefijo `ORACLE_*` es
> **nombre legado**, el destino real es el proxy de GCP. La IP no es secreta (ya estaba en
> `server_inventory.md`); la contraseña sí.
>
> 🔴 **Falta un paso manual:** `ORACLE_SSH_PASSWORD` debe cargarse como variable **secreta** en
> el variable group `Flashcard-Secrets` (contraseña root del proxy, en `SECRETS_MAP.md`).
> Mientras no exista, Cloud Run y el mirror de AWS siguen sin poder escribir media en el proxy.

---

## Deploy del backend de producción REAL (manual — el pipeline no lo hace)

El pipeline **no despliega** el backend que sirve `fluency.lat`: solo construye y publica la
imagen en GCR (stage 2). Quien corre en la VM `fluency-proxy-backend` (`35.188.162.50`) es el
contenedor `flashcard-backend-node`, y actualizarlo es un paso **manual**.

**Ojo con las credenciales de GCR** (verificado 5 ago 2026): la cuenta `gcloud` activa por defecto
es `alberto.testing01@gmail.com`, que sirve para el proyecto `fluency` (las VMs) pero **NO** tiene
`artifactregistry.repositories.downloadArtifacts` sobre `launch-490115` (donde vive la imagen).
La que sí puede es la service account del pipeline. Sin cambiar la config global de `gcloud`:

```bash
CLOUDSDK_CORE_ACCOUNT=azure-pipelines-deployer@launch-490115.iam.gserviceaccount.com \
  docker pull gcr.io/launch-490115/flashcard-backend:latest
```

La VM **no tiene `gcloud` ni credenciales de Docker** (el pipeline se las inyectaba efímeras), así
que no puede hacer `docker pull` por sí sola. El camino que funciona es empujar la imagen desde la
PC de desarrollo:

```bash
docker save gcr.io/launch-490115/flashcard-backend:latest \
  | gzip -1 \
  | sshpass -p '<pass>' ssh root@35.188.162.50 'gunzip | docker load'
```

Y luego recrear el contenedor **replicando su configuración exacta leída en vivo**, no de memoria:
`docker inspect` da las ~21 env vars, y se pasan con `--env-file` (cada línea `KEY=VALUE` literal,
sin `eval` ni quoting — que es donde se rompen estos scripts). Config verificada del contenedor:
`--network host --restart always --memory 512m --memory-swap 512m --cpu-shares 1024`,
logs `json-file` 10m×2, mount `/mnt/sda/repository/flashcard:/data`. Antes de tocar nada, taguear
la imagen en uso (`docker tag <id> flashcard-backend:rollback-<fecha>`) para poder revertir, y
cerrar con `curl -sf http://127.0.0.1:8080/api/health`. Archivos temporales **siempre en
`/mnt/sda`**, nunca en `/` (tmpfs de ~485 MB).

---

## Stage 5 — Replicate Mirrors (`Default`)

Condición: `Deploy_Frontend` OK y `Deploy_GCP` Succeeded o Skipped (si falló compile, mirrors igual despliegan imagen anterior).

### A. Oracle Proxy Mirror — ⚠️ DESHABILITADO desde el 4 ago 2026 (`condition: false`)

> Descrito abajo tal como funcionaba antes de archivar Oracle — útil como referencia si se
> reactiva (`tools/oracle-legacy/README.md` tiene el checklist de reactivación). Hoy este job no
> corre; el backend de producción real (GCP) se despliega manualmente, no por este pipeline.

1. Prepara `GCP_CREDS_B64` (base64 de `GCP_KEY_JSON`) como variable secreta del job
2. Sync scripts `infra/proxy` (si no llegaron en stage 3)
3. Si `DEPLOY_JSON: 'true'`, genera el manifiesto global del catálogo y transfiere todo
   `json/` a staging. El valor predeterminado es `'false'` para omitir esa transferencia.
4. **`SSH@0` con `runOptions: inline`** (obligatorio — ver sección Secretos)

Ejecuta `bootstrap-oracle.sh --backend-only --no-monitors`

#### Costo conocido del staging JSON

`CopyFilesOverSSH` vuelve a transferir los 2.978 archivos de `json/` (~46 MB) en cada despliegue.
En el run 279 tardó ~12 minutos. El paso posterior sí es incremental: `rsync -a --update` aplica el
staging al repositorio en unos segundos y no borra decks que solo existan en Oracle. Ni `json/`, ni
audio, ni imágenes se suben automáticamente por defecto — el operador los sube a mano; `json/` es la
única excepción parametrizable (`deployJson`).

Por ese costo, la publicación de `json/` está desactivada normalmente. Para un despliegue que deba
actualizar el catálogo versionado, ejecutar manualmente el pipeline y activar el parámetro booleano
**`Publicar json/ en Oracle`** (`deployJson`). El interruptor habilita conjuntamente la generación
del manifiesto, la copia a staging y su aplicación en Oracle. Los runs automáticos y los manuales que
dejen la casilla desmarcada omiten las tres operaciones.

Los cambios exclusivos bajo `json/**` no disparan automáticamente el pipeline: se publican con ese
run manual y la casilla activada. Así se evita ejecutar el pipeline completo para un cambio que el
modo predeterminado no transferiría.

Esto es una ineficiencia conocida del transporte de staging, no consumo de RAM por usuario. Una
optimización futura debe preservar el manifiesto, la ausencia de `--delete`, los decks exclusivos de
Oracle y recuperación; no reemplazarla a ciegas por una sincronización destructiva.

### B. OCI-1 Mirror (`129.158.214.227`) — ⚠️ DESHABILITADO desde el 4 ago 2026 (`condition: false`)

- Genera `deploy-oci1.sh`, SCP + SSH con `sshpass`
- Login GCR efímero (`DOCKER_CONFIG` temp), `GOOGLE_CREDENTIALS_JSON` en env del contenedor
- Cuando estaba activo: **después de** Oracle (`dependsOn: Mirror_Oracle`)

### C. AWS Mirror (`34.229.229.255`, Alpine) — activo, independizado el 4 ago 2026

- Igual patrón que OCI-1 pero `doas docker` y `mktemp /tmp/gcp-key-XXXXXX` (BusyBox — **sin** `.json` después de `XXXXXX`)
- `SYNC_TO_ORACLE=true` (espejo remoto con SCP al proxy real — nombre de variable legado, hoy apunta
  a `ORACLE_HOST`, que por defecto es la IP del proxy de GCP)
- Ya **no** depende de OCI-1 (`dependsOn: []` desde el 4 ago 2026 — antes `dependsOn: Mirror_OCI1`;
  se cambió para que no quedara huérfano al deshabilitar Mirror_Oracle/Mirror_OCI1)

---

## Secretos — flujo actual (NO usar patrones viejos)

### Fuente de verdad

**Azure DevOps → Variable Group `Flashcard-Secrets`**

Variables clave: `GCP_KEY_JSON`, `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_TTS_API_KEY`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GCP_API_KEY`, `OCI_PASSWORD`, `ORACLE_HOST`, `ORACLE_SSH_PASSWORD`, `SUPER_ADMIN_EMAIL`

> `GEMINI_TTS_API_KEY_BACKUP` es **solo local** (`backend/.env`) para `--batch-gen-audio`; no va en Azure ni en el contenedor de producción.

### Oracle backend deploy (sin archivos en disco)

```
Pipeline job Mirror_Oracle
  └─ GCP_CREDS_B64 = base64(GCP_KEY_JSON)  [variable secreta del job]
       └─ SSH inline (UN solo script, una sesión shell):
            export DATABASE_URL="..."
            export GOOGLE_CREDENTIALS_JSON="$(GCP_CREDS_B64)"
            ...
            bash bootstrap-oracle.sh --backend-only
                 └─ deploy-oracle-backend.sh
                      ├─ gcr_docker_login() → tmp + DOCKER_CONFIG → pull → borrar
                      └─ docker run -e GOOGLE_CREDENTIALS_JSON=...  (sin montar /gcp/key.json)
```

El backend Rust decodifica `GOOGLE_CREDENTIALS_JSON` (base64) y escribe `/tmp/gcp-credentials.json` **dentro del contenedor**.

### Reglas de SSH@0 (críticas para IAs)

| Modo | Comportamiento | Usar para |
|------|----------------|-----------|
| `runOptions: commands` | **Cada línea = proceso separado** — `export` NO persiste | Comandos independientes (ej. un solo `curl`) |
| `runOptions: inline` | **Un script = una sesión** — `export` persiste | Deploy Oracle con variables de entorno |

**Error histórico:** `DATABASE_URL is required` con `export` visible en log → causado por `commands` en lugar de `inline`.

### Archivos que NO deben quedar en Oracle

| Archivo | Estado |
|---------|--------|
| `/tmp/gcp-deploy-key.json` | **Obsoleto** — borrar si existe |
| `/tmp/flashcard-backend.env` | **Obsoleto** — borrar si existe |
| `~/.docker/config.json` con credencial GCR permanente | **Evitar** — usar `docker-gcr-auth.sh` |

---

## Scripts canónicos (`infra/proxy/`)

| Script | Función |
|--------|---------|
| `bootstrap-oracle.sh` | Orquesta deploy backend y/o Caddy |
| `deploy-oracle-backend.sh` | Pull imagen, run contenedor, health check |
| `deploy-caddy.sh` | Build `fluency-proxy`, restart `caddy-smart` |
| `docker-gcr-auth.sh` | Login GCR efímero (`DOCKER_CONFIG` temp) |

**Regla:** no poner `docker run` largo inline en `azure-pipelines.yml` para Oracle. Toda config de contenedores Oracle vive en estos scripts.

---

## Disparar el pipeline

**Trigger automático** en push a `main` o `qa` si cambia:
- `azure-pipelines.yml`
- `client/**`
- `backend/**`
- `infra/**`

El trigger usa `batch: true`: si llegan nuevos pushes a una rama mientras su run está activo,
Azure los agrupa y lanza una sola ejecución posterior con el cambio más reciente. Esto no evita que
un operador encole además un run manual, por lo que se mantiene la regla de no lanzar manual + CI.

**Manual:**
```bash
az pipelines build queue \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby \
  --definition-name "jcoronado1982.fluency" \
  --branch main
```

**Importante:** lanzar **un solo build** a la vez. No encolar manual + CI simultáneo (compiten por el mismo agente).

---

## Limpieza de logs y artefactos en Azure DevOps

### Limpieza rápida (1 comando)

**Autenticación preferida para automatización/IA:** el script toma el PAT de
`SECRETS_MAP.md` y lo exporta internamente como `AZURE_DEVOPS_EXT_PAT`, sin
mostrarlo ni guardarlo fuera del proceso. También acepta `AZURE_DEVOPS_EXT_PAT`
ya definido. Solo hace falta la extensión `azure-devops` (`az extension add --name azure-devops`).

No depender de `az login`, de una sesión del navegador, SSH ni MCP para esta
operación: el PAT es la vía canónica cuando se ejecuta desde este repositorio.

```bash
# Siempre primero: simular sin borrar
./scripts/cleanup-ado-builds.sh --dry-run

# Mantenimiento habitual — conserva último run exitoso de main y qa
./scripts/cleanup-ado-builds.sh

# Reset total de historial terminado + logs del agente LocalBuild en tu PC.
# Conserva siempre los runs en ejecución o en cola; no crea un pipeline nuevo.
./scripts/cleanup-ado-builds.sh --purge-all --clean-agent-logs
```

| Flag | Efecto |
|------|--------|
| *(sin flags)* | Conserva el último run **succeeded** de `main` y `qa`; borra el resto (hasta 200 runs listados) |
| `--dry-run` | Muestra leases y builds a borrar; no ejecuta DELETE |
| `--purge-all` | No conserva ningún **run terminado** — borra todos los históricos; nunca toca ejecuciones activas o en cola |
| `--clean-agent-logs` | Vacía `~/azp-agent-localbuild/_diag/*.log` y `_work/` (override: `AZP_AGENT_DIR`) |
| `--keep ID …` | Conserva run IDs concretos (anula la detección automática de main/qa) |

Variables opcionales: `ADO_ORG`, `ADO_PROJECT`, `ADO_PIPELINE_ID` (default pipeline `2`).

El script quita **retention leases** en lote y luego borra cada build terminado — evita el bucle lento run × 3 llamadas API. El borrado del run elimina también sus logs y artefactos asociados.

### Automática (cada deploy)

**Stage 6 Cleanup** (`azure-pipelines.yml`):
- Borra workspaces y `.log` en agentes `Default` y `LocalBuild`
- `docker buildx prune` en LocalBuild (últimas 24 h)
- Intenta `DELETE` del artefacto `flashcard-site` del run actual

> La API de artefactos de build **a menudo no acepta DELETE** por nombre; el stage puede dejar `WARN: could not delete ADO artifact`. Los artefactos viejos se eliminan **borrando el run completo** (ver abajo).

### Retención (por qué no se borran solos)

Azure crea **retention leases** por rama/pipeline. Sin quitar el lease, borrar un run falla con:

`TF900561: ... retention lease on it`

**Dónde viven los logs:**

| Ubicación | Qué es | Cómo borrar |
|-----------|--------|-------------|
| **Azure DevOps (nube)** | Log de cada run en el portal | Se elimina **con el run** (`DELETE build`). Con 0 runs no quedan logs de pipeline. |
| **Agente LocalBuild** (`~/azp-agent-localbuild/_diag/*.log`, `_work/`) | Copia local en tu PC | `--clean-agent-logs` |
| **Agente Default** (histórico: hospedado en Oracle) | Workspace del agente en el servidor | Stage 6 Cleanup en cada deploy |
| **Audit log org** (Settings → Auditing) | Eventos de org/proyecto | **No borrable** por API; retención fija de Microsoft |

### Política en portal (opcional)

Azure DevOps → **Project settings** → **Pipelines** → **Settings** → **Retention**:
- Reducir días de retención de artifacts/logs
- Evitar “Retain indefinitely” en runs de prueba

### Ver cuántos runs quedan

```bash
az pipelines runs list --pipeline-ids 2 --top 10 --output table
```

```bash
curl -sf https://fluency.lat/api/health
# {"status":"ok","service":"flashcard-rust-backend",...}

ssh root@157.151.199.170 "docker ps --format 'table {{.Names}}\t{{.Status}}'"
# flashcard-backend-node, caddy-smart Up

# No debe existir:
ssh root@157.151.199.170 "ls /tmp/gcp-deploy-key.json /tmp/flashcard-backend.env 2>&1"
```

---

## Patrones OBSOLETOS — no reintroducir

| Patrón viejo | Por qué está mal | Reemplazo actual |
|--------------|------------------|------------------|
| `CopyFilesOverSSH` de `gcp-deploy-key.json` a Oracle | Secreto en disco | `GOOGLE_CREDENTIALS_JSON` vía SSH `inline` |
| `FLASHCARD_DEPLOY_ENV_B64` blob único en SSH | No llegaba al script remoto | `export` individual en script `inline` |
| SSH `runOptions: commands` con múltiples `export` | Variables no persisten | `runOptions: inline` |
| `docker login` permanente en `~/.docker/config.json` | Credencial en disco | `docker-gcr-auth.sh` |
| `-v /tmp/gcp-deploy-key.json:/gcp/key.json` | JSON en host Oracle | `GOOGLE_CREDENTIALS_JSON` env |
| Stages 3+4+5 en paralelo en `Default` | Cola por 1 agente | `dependsOn` en cadena |
| 3 mirror jobs en paralelo | Misma cola | `dependsOn` Oracle→OCI-1→AWS |
| Compilar en Oracle ARM | OOM / disco lleno | `LocalBuild` en PC |
| `SYNC_TO_ORACLE=true` en contenedor **Oracle** | SSH por archivo, error 255 | `false` + volumen `/data` |
| `apt-get install sshpass` en job mirror | Sin permisos en agente | `command -v sshpass` (ya instalado) |
| `mktemp /tmp/foo.XXXXXX.json` en Alpine | BusyBox: Invalid argument | `mktemp /tmp/foo-XXXXXX` |

---

## Troubleshooting rápido

| Síntoma | Causa | Acción |
|---------|-------|--------|
| `DATABASE_URL is required` en deploy Oracle | SSH `commands` en vez de `inline` | Usar `runOptions: inline` |
| `maximum parallel jobs Self-Hosted` | Varios builds o stages en paralelo | Un build; deploy serializado |
| `DeadlineExceeded` push GCR | Red/timeout transitorio | Reintentar pipeline (ya hay 3 intentos) |
| `mktemp: Invalid argument` en AWS | Template mktemp en Alpine | Sufijo `XXXXXX` al final |
| `SUPER_ADMIN_EMAIL: command not found` | `$(VAR)` sin sustituir en heredoc | Asignar `VAR_VAL='$(VAR)'` antes del heredoc |
| Audio 500 `ssh mkdir 255` | `SYNC_TO_ORACLE=true` en Oracle | Ver [`oracle-local-backend-deploy.md`](../../tools/oracle-legacy/oracle-local-backend-deploy.md) (archivado) |
| LocalBuild offline | PC apagada o agente parado | `systemctl status` en `~/azp-agent-localbuild` |
| `PERMISSION_DENIED run.services.get` en Stage 4 | El step heredaba la cuenta `gcloud` activa del agente (`alberto.testing01@`), que no tiene ese permiso en `launch-490115` | Corregido: `export CLOUDSDK_CORE_ACCOUNT=azure-pipelines-deployer@launch-490115...` dentro del step. No heredar identidad del ambiente del agente |
| `ORACLE_HOST: command not found` en Stage 4 | La variable no existe en el variable group → Azure deja `$(ORACLE_HOST)` literal → bash lo ejecuta como comando → valor vacío | Definirla en `Flashcard-Secrets` (o quitar el `SYNC_TO_ORACLE=true` de Cloud Run). Ver §Stage 4 |
| `artifactregistry...downloadArtifacts denied` al hacer `docker pull` | Cuenta `gcloud` activa (`alberto.testing01@…`) es del proyecto `fluency`, no de `launch-490115` | `CLOUDSDK_CORE_ACCOUNT=azure-pipelines-deployer@launch-490115.iam.gserviceaccount.com docker pull …` |
| El fix está en `main` pero `fluency.lat` sirve lo viejo | El pipeline NO despliega el backend real | Deploy manual — ver §"Deploy del backend de producción REAL" |

---

## Historial de cambios relevantes

| Fecha | Build / commit | Cambio |
|-------|----------------|--------|
| 2026-06-07 | `#154` / `cf1c7a3` | Backend Oracle local, scripts `infra/proxy/` |
| 2026-08-04 | `1594319` | Migración de producción a GCP: `Mirror_Oracle`/`Mirror_OCI1` deshabilitados (`condition: false`), `Mirror_AWS` independizado (`dependsOn: []`). Ver `tools/oracle-legacy/README.md`. |
| 2026-06-08 | `8441e3f` | Secretos efímeros, sin `gcp-deploy-key.json` |
| 2026-06-08 | `8a49d4a` | SSH `inline` para exports |
| 2026-06-08 | `fe8cc2c` | Reintentos GCR, deploy serializado, mirrors en cadena |
| 2026-06-18 | `http-fluency.lat` | Repo GitHub + pipeline renombrado `jcoronado1982.fluency`; arquitectura modular |
| 2026-08-05 | `#391` / `40350ea` | Documentado el deploy MANUAL del backend real (el pipeline solo publica la imagen en GCR) y el fallo IAM preexistente de Stage 4 → `Mirror_AWS` skipped. |
| 2026-06-08 | `#165` | Primer pipeline completo en verde con nueva arquitectura |
