#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TARGET="prod"
PROFILE="json"
MAX_VUS=50
STAGE_SEC=30
ASSUME_YES=0
DRY_RUN=0

PROXY_IP="${PROXY_IP:-35.188.162.50}"
export SSH_PASS="${SSH_PASS:-Privado01*}"

ABORT_MEM_MB="${ABORT_MEM_MB:-150}"
ABORT_SWAP_MB="${ABORT_SWAP_MB:-400}"
ABORT_ROOT_PCT="${ABORT_ROOT_PCT:-90}"
ABORT_STEAL_PCT="${ABORT_STEAL_PCT:-30}"
ABORT_LOAD1="${ABORT_LOAD1:-8}"
ABORT_SSH_FAILS="${ABORT_SSH_FAILS:-3}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target) TARGET="$2"; shift 2 ;;
        --profile) PROFILE="$2"; shift 2 ;;
        --max-vus) MAX_VUS="$2"; shift 2 ;;
        --stage-sec) STAGE_SEC="$2"; shift 2 ;;
        --yes) ASSUME_YES=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) exit 0 ;;
        *) shift ;;
    esac
done

case "$TARGET" in
    prod) TARGET_BASE="https://fluency.lat" ;;
    qa)   TARGET_BASE="https://qa.fluency.lat" ;;
    *) echo "ERROR: --target debe ser prod o qa" >&2; exit 1 ;;
esac

case "$PROFILE" in json|api|mixed|db_write) ;; *) echo "ERROR: --profile invalido" >&2; exit 1 ;; esac

TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$SCRIPT_DIR/results/$TS"
mkdir -p "$OUT_DIR"

export TARGET_BASE PROFILE MAX_VUS STAGE_SEC
export SUMMARY_OUT="$OUT_DIR/k6-summary.json"

if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY-RUN: probando k6 (sin generar carga)..."
    k6 run --vus 1 --duration 2s --out "csv=$OUT_DIR/k6-raw.csv" "$SCRIPT_DIR/fluency-load-test.js"
    exit 0
fi

echo "CORRIENDO k6 en paralelo..."
k6 run --out "csv=$OUT_DIR/k6-raw.csv" "$SCRIPT_DIR/fluency-load-test.js" | tee "$OUT_DIR/k6-stdout.log"
