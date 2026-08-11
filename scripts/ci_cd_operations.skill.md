# 🚀 Skill: CI/CD Operations (Azure Pipelines)

> **Fuente de verdad:** [`docs/infrastructure/pipeline-and-deploy.md`](../docs/infrastructure/pipeline-and-deploy.md)
> Este skill resume operaciones; si hay conflicto, gana el documento canónico.

## 📋 Prerrequisitos

- Azure DevOps: org `safejcoronado1982`, proyecto `theruby`
- Variable Group **`Flashcard-Secrets`** (secretos cifrados)
- Service Connection SSH: **`SrvPortfolio`** → Oracle `157.151.199.170` (sigue usándose para
  Deploy_Frontend; el servidor real de producción es GCP desde el 4 ago 2026, ver
  `tools/oracle-legacy/README.md`)
- Agente **`LocalBuild`** online en PC dev (`~/azp-agent-localbuild`)
- Agente **`Default`** online (self-hosted ARM, históricamente hospedado en Oracle) para deploys

## 🏗️ Arquitectura (no confundir)

| Pool | Dónde | Compila | Despliega |
|------|-------|---------|-----------|
| `LocalBuild` | PC dev | Front (bun) + Backend (buildx) | No |
| `Default` | Agente self-hosted (histórico: Oracle) | No | Front (Oracle), GCP, AWS mirror |

Deploy **serializado:** stage 3 → 4 → 5. Mirrors: solo AWS activo (`Mirror_Oracle`/`Mirror_OCI1`
deshabilitados desde el 4 ago 2026, `condition: false` — ver `tools/oracle-legacy/README.md`).

## 🛠️ Procedimientos

### Disparar pipeline

```bash
az pipelines build queue \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby \
  --definition-name "jcoronado1982.fluency" \
  --branch main
```

Trigger automático en push a `qa` o `main` si cambia: `azure-pipelines.yml`, `client/**`, `backend/**`, `infra/**`.

**Un solo build a la vez** — no encolar manual + CI simultáneo.

### Tiempos esperados

~**25–45 min** por deploy completo (buildx Rust dual-arch + deploys en serie). Detalle por stage en [`pipeline-and-deploy.md`](../docs/infrastructure/pipeline-and-deploy.md#tiempos-esperados-referencia).

### Limpiar logs y artefactos viejos en Azure

**Un comando (reset total):** `./scripts/cleanup-ado-builds.sh --purge-all --clean-agent-logs`

**Autenticación canónica para IA/automatización:** el script carga en silencio
el PAT `PAT_token` de `SECRETS_MAP.md` como `AZURE_DEVOPS_EXT_PAT`. No usar
`az login`, navegador, SSH ni MCP como primer intento. Nunca imprimir el PAT.
El script solo elimina runs `completed`; conserva el build en ejecución y los
encolados, y no crea ni reconfigura el pipeline existente.

```bash
./scripts/cleanup-ado-builds.sh --dry-run                              # simular
./scripts/cleanup-ado-builds.sh                                      # conserva último main + qa
./scripts/cleanup-ado-builds.sh --purge-all --clean-agent-logs       # reset total
```

Doc completa: [`pipeline-and-deploy.md`](../docs/infrastructure/pipeline-and-deploy.md#limpieza-de-logs-y-artefactos-en-azure-devops).

### Inspeccionar builds

```bash
az pipelines build list --definition-ids 2 --top 5 --output table

az devops invoke --area build --resource timeline \
  --route-parameters project=theruby buildId=[ID] --output json
```

### Verificar post-deploy

```bash
curl -sf https://fluency.lat/api/health
```

## 🔐 Secretos en deploy Oracle (patrón actual)

1. Job lee variables de `Flashcard-Secrets`
2. `GCP_CREDS_B64` = base64(`GCP_KEY_JSON`) como variable secreta del job
3. **`SSH@0` con `runOptions: inline`** exporta todas las vars
4. `bootstrap-oracle.sh --backend-only` → `deploy-oracle-backend.sh`
5. Login GCR efímero (`docker-gcr-auth.sh`), sin `/tmp/gcp-deploy-key.json`

**NO usar:** `CopyFilesOverSSH` de JSON GCP, SSH `commands` con múltiples `export`, `FLASHCARD_DEPLOY_ENV_B64` blob.

## 📁 Scripts canónicos

Copiados a `/root/smart-proxy/infra-proxy/` en cada deploy:

- `bootstrap-oracle.sh`
- `deploy-oracle-backend.sh`
- `deploy-caddy.sh`
- `docker-gcr-auth.sh`

**Regla:** no poner `docker run` largo en `azure-pipelines.yml`.

## ⚠️ Troubleshooting

| Error | Causa | Solución |
|-------|-------|----------|
| `DATABASE_URL is required` | SSH `commands` vs `inline` | `runOptions: inline` |
| `maximum parallel jobs` | Varios builds o deploys paralelos | Un build; stages serializados |
| `DeadlineExceeded` GCR push | Timeout red | Reintentar (pipeline tiene 3 intentos) |
| `mktemp: Invalid argument` AWS | BusyBox Alpine | `mktemp /tmp/foo-XXXXXX` |
| LocalBuild offline | PC apagada | Encender PC + agente systemd |
| Audio 500 ssh 255 | `SYNC_TO_ORACLE=true` en Oracle | Ver `oracle-local-backend-deploy.md` |

## 🚫 Patrones obsoletos

Ver tabla completa en [`pipeline-and-deploy.md`](../docs/infrastructure/pipeline-and-deploy.md#patrones-obsoletos--no-reintroducir).
