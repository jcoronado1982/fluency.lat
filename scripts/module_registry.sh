#!/usr/bin/env bash

set -euo pipefail

MODULE_NAMES=(
  landing
  pricing
  dashboard
  flashcards
  pronoun
  admin
)

module_exists() {
  local module="${1:-}"
  local item
  for item in "${MODULE_NAMES[@]}"; do
    if [[ "$item" == "$module" ]]; then
      return 0
    fi
  done
  return 1
}

module_description() {
  case "${1:-}" in
    landing) echo "Landing publica en / (marketing, sin shell autenticado)" ;;
    pricing) echo "Precios y checkout publico (modulo frontend de pagos)" ;;
    dashboard) echo "Shell autenticado: sidebar, header, footer y menu flotante" ;;
    flashcards) echo "Flashcards base con imagenes/audio AVIF/Opus y progreso" ;;
    pronoun) echo "Referencia y practica guiada de pronombres" ;;
    admin) echo "Panel admin, auth y presencia (shell sin modulos de estudio)" ;;
    *) return 1 ;;
  esac
}

module_backend_feature() {
  case "${1:-}" in
    landing) echo "" ;;
    pricing) echo "" ;;
    dashboard) echo "" ;;
    flashcards) echo "flashcards" ;;
    pronoun) echo "pronoun_practice" ;;
    admin) echo "auth" ;;
    *) return 1 ;;
  esac
}

module_cargo_features() {
  local module="${1:-}"
  local features="auth"
  local module_feature=""
  if module_exists "$module"; then
    module_feature="$(module_backend_feature "$module")"
    if [[ -n "$module_feature" ]]; then
      features+=",$module_feature"
    fi
  fi
  echo "$features"
}

module_cargo_features_multi() {
  local features="auth"
  local module feat
  for module in "$@"; do
    if module_exists "$module"; then
      feat="$(module_backend_feature "$module")"
      if [[ -n "$feat" && ",$features," != *",$feat,"* ]]; then
        features+=",$feat"
      fi
    fi
  done
  echo "$features"
}

module_cargo_build_args() {
  local module="${1:-}"
  printf '%s' "--no-default-features --features $(module_cargo_features "$module")"
}

module_cargo_build_args_multi() {
  printf '%s' "--no-default-features --features $(module_cargo_features_multi "$@")"
}

module_frontend_flag() {
  case "${1:-}" in
    landing) echo "VITE_ENABLE_LANDING=true" ;;
    pricing) echo "VITE_ENABLE_PAYMENTS=true" ;;
    dashboard) echo "VITE_ENABLE_DASHBOARD=true" ;;
    flashcards) echo "VITE_ENABLE_FLASHCARDS=true" ;;
    pronoun)
      printf '%s\n' \
        "VITE_ENABLE_PRONOUN_REFERENCE=true" \
        "VITE_ENABLE_PRONOUN_PRACTICE=true"
      ;;
    admin) echo "VITE_ENABLE_ADMIN=true" ;;
    *) return 1 ;;
  esac
}

module_default_home() {
  echo "flashcards"
}

module_default_home_multi() {
  local module
  for module in "$@"; do
    case "$module" in
      flashcards)
        echo "flashcards"
        return 0
        ;;
      pronoun)
        echo "pronoun"
        return 0
        ;;
    esac
  done
  echo "flashcards"
}

module_frontend_disable_flag() {
  case "${1:-}" in
    landing) echo "VITE_ENABLE_LANDING=false" ;;
    pricing) echo "VITE_ENABLE_PAYMENTS=false" ;;
    dashboard) echo "VITE_ENABLE_DASHBOARD=false" ;;
    flashcards) echo "VITE_ENABLE_FLASHCARDS=false" ;;
    pronoun)
      printf '%s\n' \
        "VITE_ENABLE_PRONOUN_REFERENCE=false" \
        "VITE_ENABLE_PRONOUN_PRACTICE=false"
      ;;
    admin) echo "VITE_ENABLE_ADMIN=false" ;;
    *) return 1 ;;
  esac
}

module_frontend_env_lines() {
  local selected=("$@")
  local module

  echo "VITE_API_URL="
  echo "VITE_DEFAULT_MODULE=$(module_default_home_multi "${selected[@]}")"

  for module in "${MODULE_NAMES[@]}"; do
    if module_selected_contains "$module" "${selected[@]}"; then
      module_frontend_flag "$module"
    else
      module_frontend_disable_flag "$module"
    fi
  done
}

shared_sparse_patterns() {
  cat <<'EOF'
README.md
CLAUDE.md
AGENTS.md
GEMINI.md
llms.txt
.cursorrules
.github/copilot-instructions.md
CODEBASE.md
SECRETS_MAP.md
database_schema_diagram.md
docs/ARQUITECTURA_MODULAR.md
docs/GIT_BRANCHES.md
docs/GIT_SPARSE_WORKFLOW.md
docs/MAPA_DOMINIOS.md
docs/QA_TO_PROD_FLOW.md
docs/DEPLOY_Y_REPOSITORIO.md
docs/modules
docs/infrastructure
backend/CLAUDE.md
backend/GEMINI.md
client/CLAUDE.md
client/GEMINI.md
modules
scripts
.branch-profile
backend/Cargo.toml
backend/Cargo.lock
backend/api_main
backend/core
backend/mod_shell
client/bun.lock
client/eslint.config.js
client/index.html
client/package-lock.json
client/package.json
client/public
client/src/App.css
client/src/App.jsx
client/src/assets
client/src/components/common
client/src/components/routing
client/src/components/flashcardStudy
client/src/components/pwa
client/src/components/shell
client/src/adapters
client/src/config
client/env-profiles
client/src/context
client/src/hooks
client/src/index.css
client/src/main.jsx
client/src/modules/index.js
client/src/modules/routingPaths.js
client/src/pages
client/src/styles
client/src/utils
client/src/contracts
client/src/services/httpClient.js
client/src/repositories/AuthRepository.js
client/src/repositories/adminRepository.js
client/vite.config.js
docker-compose.yml
start.sh
EOF
}

module_sparse_patterns() {
  case "${1:-}" in
    landing)
      cat <<'EOF'
client/src/modules/landing
EOF
      ;;
    pricing)
      cat <<'EOF'
client/src/modules/pricing
EOF
      ;;
    dashboard)
      cat <<'EOF'
client/src/modules/dashboard
EOF
      ;;
    flashcards)
      cat <<'EOF'
backend/mod_flashcards
client/src/modules/flashcards
client/src/modules/landing
client/src/modules/dashboard
json
card_images
card_audio
EOF
      ;;
    pronoun)
      cat <<'EOF'
backend/mod_pronoun
client/src/modules/pronounPractice
infra/seed
infra/proxy/seed-pronoun-practice.sh
EOF
      ;;
    admin)
      # Admin vive en el shell; sin mod_flashcards ni mod_pronoun
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

module_all_patterns() {
  local module
  shared_sparse_patterns
  for module in "$@"; do
    module_sparse_patterns "$module"
  done
}

# Rutas de disco que pertenecen a un modulo (para podar al cambiar perfil sparse)
module_disk_paths() {
  case "${1:-}" in
    landing)
      printf '%s\n' client/src/modules/landing
      ;;
    pricing)
      printf '%s\n' client/src/modules/pricing
      ;;
    dashboard)
      printf '%s\n' client/src/modules/dashboard
      ;;
    flashcards)
      printf '%s\n' \
        backend/mod_flashcards \
        client/src/modules/flashcards \
        client/src/modules/landing \
        client/src/modules/dashboard \
        json \
        card_images \
        card_audio
      ;;
    pronoun)
      printf '%s\n' \
        backend/mod_pronoun \
        client/src/modules/pronounPractice \
        infra/seed \
        infra/proxy/seed-pronoun-practice.sh
      ;;
    *) return 1 ;;
  esac
}

# Crates Rust del workspace segun modulos activos
module_workspace_members() {
  local modules=("$@")
  local members=('"core"' '"api_main"' '"mod_shell"')
  local module
  for module in "${modules[@]}"; do
    case "$module" in
      flashcards) members+=('"mod_flashcards"') ;;
      pronoun) members+=('"mod_pronoun"') ;;
    esac
  done
  local IFS=', '
  echo "${members[*]}"
}

module_selected_contains() {
  local needle="${1:-}"
  local item
  shift
  for item in "$@"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}

print_modules_table() {
  local module
  printf '%-12s | %-22s | %s\n' "modulo" "backend_feature" "descripcion"
  printf '%-12s-+-%-22s-+-%s\n' "------------" "----------------------" "---------------------------------------------"
  for module in "${MODULE_NAMES[@]}"; do
    printf '%-12s | %-22s | %s\n' \
      "$module" \
      "$(module_backend_feature "$module")" \
      "$(module_description "$module")"
  done
}
