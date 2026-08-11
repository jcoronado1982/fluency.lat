#!/usr/bin/env bash
# Borra runs viejos de Azure Pipelines (logs + artefactos) de forma eficiente.
# Autenticación: usa AZURE_DEVOPS_EXT_PAT si ya está definido. Como fallback local,
# carga el PAT de SECRETS_MAP.md sin imprimirlo. Requiere la extensión azure-devops.
#
# Uso:
#   ./scripts/cleanup-ado-builds.sh              # conserva último main + último qa
#   ./scripts/cleanup-ado-builds.sh --purge-all  # borra TODOS los runs (pipeline como nuevo)
#   ./scripts/cleanup-ado-builds.sh --purge-all --clean-agent-logs
#   ./scripts/cleanup-ado-builds.sh --dry-run
#   ./scripts/cleanup-ado-builds.sh --keep 229 230
#
# Doc: docs/infrastructure/pipeline-and-deploy.md#limpieza-de-logs-y-artefactos-en-azure-devops

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# No mostrar nunca el PAT. Esto permite operar desde un agente no interactivo
# sin depender de `az login` ni de una sesión del navegador.
if [[ -z "${AZURE_DEVOPS_EXT_PAT:-}" && -f "$REPO_ROOT/SECRETS_MAP.md" ]]; then
  export AZURE_DEVOPS_EXT_PAT
  AZURE_DEVOPS_EXT_PAT=$(grep -iE 'PAT[ _-]*Token' "$REPO_ROOT/SECRETS_MAP.md" | grep -oE '[A-Za-z0-9]{50,}' | head -n1 || true)
fi
if [[ -z "${AZURE_DEVOPS_EXT_PAT:-}" ]]; then
  echo "ERROR: falta AZURE_DEVOPS_EXT_PAT y no se encontró PAT Token en SECRETS_MAP.md" >&2
  exit 1
fi

ORG="${ADO_ORG:-https://dev.azure.com/safejcoronado1982}"
PROJ="${ADO_PROJECT:-theruby}"
PIPELINE_ID="${ADO_PIPELINE_ID:-2}"
API_VER="7.1"
DRY_RUN=false
PURGE_ALL=false
CLEAN_AGENT_LOGS=false
KEEP_IDS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --purge-all) PURGE_ALL=true; shift ;;
    --clean-agent-logs) CLEAN_AGENT_LOGS=true; shift ;;
    --keep)
      shift
      while [[ $# -gt 0 && "$1" != --* ]]; do
        KEEP_IDS+=("$1")
        shift
      done
      ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *) echo "Opción desconocida: $1" >&2; exit 1 ;;
  esac
done

if [[ "$PURGE_ALL" == true ]]; then
  KEEP_IDS=()
elif [[ ${#KEEP_IDS[@]} -eq 0 ]]; then
  KEEP_MAIN=$(az pipelines runs list --organization "$ORG" --project "$PROJ" \
    --pipeline-ids "$PIPELINE_ID" --branch main --result succeeded --top 1 \
    --query "[0].id" -o tsv)
  KEEP_QA=$(az pipelines runs list --organization "$ORG" --project "$PROJ" \
    --pipeline-ids "$PIPELINE_ID" --branch qa --result succeeded --top 1 \
    --query "[0].id" -o tsv)
  [[ -n "$KEEP_MAIN" && "$KEEP_MAIN" != "None" ]] && KEEP_IDS+=("$KEEP_MAIN")
  [[ -n "$KEEP_QA" && "$KEEP_QA" != "None" ]] && KEEP_IDS+=("$KEEP_QA")
fi

echo "Conservando run IDs: ${KEEP_IDS[*]:-(ninguno)}"

# Nunca interrumpir un deploy: solo se borran runs terminados. Los estados
# inProgress, notStarted y postponing quedan intactos incluso con --purge-all.
mapfile -t ALL_RUNS < <(az pipelines runs list --organization "$ORG" --project "$PROJ" \
  --pipeline-ids "$PIPELINE_ID" --top 200 --query "[?status=='completed'].id" -o tsv)

TO_DELETE=()
for id in "${ALL_RUNS[@]}"; do
  keep=false
  for k in "${KEEP_IDS[@]}"; do
    [[ "$id" == "$k" ]] && keep=true && break
  done
  $keep || TO_DELETE+=("$id")
done

echo "Runs a borrar: ${#TO_DELETE[@]} / ${#ALL_RUNS[@]}"

if [[ ${#TO_DELETE[@]} -eq 0 ]]; then
  echo "Nada que limpiar."
  exit 0
fi

# Una sola llamada: todos los retention leases del pipeline
LEASES_JSON=$(az devops invoke --organization "$ORG" \
  --area build --resource leases \
  --route-parameters "project=$PROJ" \
  --query-parameters "definitionId=$PIPELINE_ID" \
  --api-version "$API_VER" -o json)

LEASES_TO_DELETE=$(
  export LEASES_JSON
  python3 - <<'PY' "${TO_DELETE[@]}"
import json, os, sys
delete_runs = set(sys.argv[1:])
data = json.loads(os.environ["LEASES_JSON"])
ids = []
for lease in data.get("value", []):
    if str(lease.get("runId")) in delete_runs:
        ids.append(str(lease["leaseId"]))
print(",".join(ids))
PY
)

if [[ -n "$LEASES_TO_DELETE" ]]; then
  count=$(echo "$LEASES_TO_DELETE" | tr ',' '\n' | wc -l)
  echo "Borrando $count retention lease(s)..."
  if [[ "$DRY_RUN" == true ]]; then
    echo "  [dry-run] DELETE leases: $LEASES_TO_DELETE"
  else
    az devops invoke --organization "$ORG" --http-method DELETE \
      --area build --resource leases \
      --route-parameters "project=$PROJ" \
      --query-parameters "ids=$LEASES_TO_DELETE" \
      --api-version "$API_VER" -o none
  fi
fi

deleted=0
failed=0
for run_id in "${TO_DELETE[@]}"; do
  if [[ "$DRY_RUN" == true ]]; then
    echo "  [dry-run] DELETE build $run_id"
    deleted=$((deleted + 1))
    continue
  fi
  if az devops invoke --organization "$ORG" --http-method DELETE \
      --area build --resource builds \
      --route-parameters "project=$PROJ" "buildId=$run_id" \
      --api-version "$API_VER" -o none 2>/dev/null; then
    deleted=$((deleted + 1))
  else
    failed=$((failed + 1))
    echo "  WARN: no se pudo borrar build $run_id (lease restante?)" >&2
  fi
done

echo "Listo: borrados=$deleted fallos=$failed"

if [[ "$CLEAN_AGENT_LOGS" == true ]]; then
  AGENT_DIR="${AZP_AGENT_DIR:-$HOME/azp-agent-localbuild}"
  if [[ -d "$AGENT_DIR" ]]; then
    echo "Limpiando logs locales del agente en $AGENT_DIR ..."
    if [[ "$DRY_RUN" == true ]]; then
      echo "  [dry-run] find $AGENT_DIR/_diag -name '*.log' -delete"
      echo "  [dry-run] rm -rf $AGENT_DIR/_work/*"
    else
      find "$AGENT_DIR/_diag" -name "*.log" -type f -delete 2>/dev/null || true
      rm -rf "$AGENT_DIR/_work/"* 2>/dev/null || true
      echo "  Agente local: _diag/*.log y _work/ vaciados"
    fi
  else
    echo "WARN: no existe $AGENT_DIR (omitido)" >&2
  fi
fi
