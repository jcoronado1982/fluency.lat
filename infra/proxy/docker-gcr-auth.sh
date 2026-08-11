#!/bin/bash
# Login efímero a GCR sin dejar credenciales en ~/.docker/config.json
# Uso: source docker-gcr-auth.sh && gcr_docker_login && ... && gcr_docker_auth_cleanup

_gcr_auth_tmp=""
_gcr_key_tmp=""

# Escribe la SA en un tmp efímero (chmod 600). Devuelve la ruta por stdout.
_write_gcp_key_tmp() {
  local content="$1"
  _gcr_key_tmp="$(mktemp /tmp/gcp-key.XXXXXX.json)"
  chmod 600 "$_gcr_key_tmp"
  printf '%s' "$content" > "$_gcr_key_tmp"
  echo "$_gcr_key_tmp"
}

# Resuelve clave: GCP_KEY_JSON, GOOGLE_CREDENTIALS_JSON (base64) o archivo legacy.
resolve_gcp_key_file() {
  if [[ -n "${GCP_KEY_JSON:-}" ]]; then
    _write_gcp_key_tmp "$GCP_KEY_JSON"
    return 0
  fi
  if [[ -n "${GOOGLE_CREDENTIALS_JSON:-}" ]]; then
    local decoded=""
    decoded="$(printf '%s' "$GOOGLE_CREDENTIALS_JSON" | base64 -d 2>/dev/null)" || return 1
    _write_gcp_key_tmp "$decoded"
    return 0
  fi
  local path="${GCP_KEY_PATH:-/tmp/gcp-deploy-key.json}"
  if [[ -f "$path" ]]; then
    echo "WARN: usando GCP_KEY_PATH legacy ($path); preferir GOOGLE_CREDENTIALS_JSON" >&2
    echo "$path"
    return 0
  fi
  return 1
}

gcr_docker_login() {
  local key_file=""
  key_file="$(resolve_gcp_key_file)" || {
    echo "WARN: sin GCP key (GCP_KEY_JSON o GCP_KEY_PATH); omitiendo docker login" >&2
    return 0
  }

  _gcr_auth_tmp="$(mktemp -d /tmp/docker-auth.XXXXXX)"
  chmod 700 "$_gcr_auth_tmp"
  export DOCKER_CONFIG="$_gcr_auth_tmp"

  if ! cat "$key_file" | docker login -u _json_key --password-stdin https://gcr.io >/dev/null 2>&1; then
    echo "ERROR: docker login a gcr.io falló" >&2
    return 1
  fi
}

gcr_docker_auth_cleanup() {
  if [[ -n "$_gcr_auth_tmp" && -d "$_gcr_auth_tmp" ]]; then
    rm -rf "$_gcr_auth_tmp"
    _gcr_auth_tmp=""
    unset DOCKER_CONFIG
  fi
  if [[ -n "${_gcr_key_tmp:-}" && -f "$_gcr_key_tmp" ]]; then
    rm -f "$_gcr_key_tmp"
    _gcr_key_tmp=""
  fi
}
