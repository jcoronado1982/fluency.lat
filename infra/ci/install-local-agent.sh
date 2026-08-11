#!/bin/bash
# Instala y registra el agente Azure DevOps en pool LocalBuild (tu PC).
# Requiere: AZURE_DEVOPS_EXT_PAT en el entorno (ver SECRETS_MAP.md).
set -euo pipefail

ORG_URL="${ORG_URL:-https://dev.azure.com/safejcoronado1982}"
POOL_NAME="${POOL_NAME:-LocalBuild}"
AGENT_VERSION="${AGENT_VERSION:-4.252.0}"
AGENT_DIR="${AGENT_DIR:-$HOME/azp-agent-localbuild}"
AGENT_NAME="${AGENT_NAME:-$(hostname)-localbuild}"

if [[ -z "${AZURE_DEVOPS_EXT_PAT:-}" ]]; then
  echo "ERROR: export AZURE_DEVOPS_EXT_PAT antes de ejecutar este script."
  exit 1
fi

mkdir -p "$AGENT_DIR"
cd "$AGENT_DIR"

if [[ ! -f ./config.sh ]]; then
  curl -fsSL -o agent.tar.gz \
    "https://download.agent.dev.azure.com/agent/${AGENT_VERSION}/vsts-agent-linux-x64-${AGENT_VERSION}.tar.gz"
  tar xzf agent.tar.gz
fi

if [[ -f ./.agent ]]; then
  echo "Agente ya configurado en $AGENT_DIR"
else
  ./config.sh --unattended \
    --url "$ORG_URL" \
    --auth pat \
    --token "$AZURE_DEVOPS_EXT_PAT" \
    --pool "$POOL_NAME" \
    --agent "$AGENT_NAME" \
    --work "_work" \
    --acceptTeeEula
fi

sudo ./svc.sh install "$USER"
sudo ./svc.sh start

# Autorizar pool para todos los pipelines (requerido la primera vez)
curl -fsS -X PATCH \
  -u ":$AZURE_DEVOPS_EXT_PAT" \
  -H "Content-Type: application/json" \
  "${ORG_URL}/theruby/_apis/pipelines/pipelinepermissions/queue/10?api-version=7.1-preview.1" \
  -d '{"allPipelines":{"authorized":true}}' >/dev/null

echo "Agente LocalBuild instalado, autorizado y en ejecución ($AGENT_DIR)"
