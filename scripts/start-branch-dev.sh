#!/usr/bin/env bash
# Arranca backend+frontend por rama dev-* (sparse + env profile + Docker como start.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${1:-}"

case "$BRANCH" in
  dev-admin)
    PROFILE=admin
    SPARSE_MODULES=(admin)
    FEATURES=auth
    ;;
  dev-flashcards)
    PROFILE=flashcards
    SPARSE_MODULES=(landing dashboard flashcards)
    FEATURES="auth,flashcards"
    ;;
  dev-pronoun)
    PROFILE=pronoun
    SPARSE_MODULES=(pronoun)
    FEATURES="auth,pronoun_practice"
    ;;
  dev-full)
    PROFILE=full
    SPARSE_MODULES=()
    FEATURES="auth,flashcards,pronoun_practice"
    ;;
  *)
    echo "Uso: $0 dev-admin|dev-flashcards|dev-pronoun|dev-full" >&2
    exit 1
    ;;
esac

fuser -k 8081/tcp 5173/tcp 2>/dev/null || true
sleep 1

cd "$ROOT"
git checkout "$BRANCH" -q 2>/dev/null || true

if [[ "$BRANCH" == "dev-full" ]]; then
  ./scripts/sparse-module.sh full
  if [[ -f "client/env-profiles/full.profile" ]]; then
    cp client/env-profiles/full.profile client/.env.development
  elif [[ -f "client/.env.development.local" ]]; then
    cp client/.env.development.local client/.env.development
  fi
else
  ./scripts/sparse-module.sh "${SPARSE_MODULES[@]}"
  cp "client/env-profiles/${PROFILE}.profile" client/.env.development
fi

DOCKER_READY=false
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DOCKER_READY=true
fi

CLIENT_ENV_FILE="$ROOT/client/.env.development"

start_dev_databases() {
  if [[ "$DOCKER_READY" != true ]]; then
    echo "⚠️  Docker no disponible — imágenes demo vía Oracle desactivadas (SYNC_TO_ORACLE=false)."
    return 0
  fi

  echo "🚀 Levantando bases de datos (igual que start.sh)..."
  if docker ps -a --format '{{.Names}}' | grep -Fxq "flashcard-db"; then
    docker rm -f flashcard-db >/dev/null 2>&1 || true
  fi
  docker-compose -f "$ROOT/docker-compose.yml" up -d db

  if docker ps -a --format '{{.Names}}' | grep -Fxq "surrealdb"; then
    docker rm -f surrealdb >/dev/null 2>&1 || true
  fi
  docker run -d --rm --name surrealdb \
    -p 8001:8000 \
    surrealdb/surrealdb:v3.2.3 start --user root --pass root memory

  local count=0
  until PGPASSWORD=postgres psql -h localhost -U postgres -d flashcard_db -c '\q' > /dev/null 2>&1; do
    sleep 1
    count=$((count + 1))
    if [[ $count -ge 30 ]]; then
      echo "❌ Postgres no respondió." >&2
      exit 1
    fi
  done

  count=0
  until curl -sf http://localhost:8001/health > /dev/null; do
    sleep 1
    count=$((count + 1))
    if [[ $count -ge 30 ]]; then
      echo "❌ SurrealDB no respondió." >&2
      exit 1
    fi
  done
  echo "✅ Bases de datos listas."

  if [[ "$PROFILE" == "pronoun" ]] && [[ -f "$ROOT/infra/proxy/seed-pronoun-practice.sh" ]]; then
    bash "$ROOT/infra/proxy/seed-pronoun-practice.sh"
  fi
}

start_dev_databases

cargo build --manifest-path "$ROOT/backend/Cargo.toml" -p api_main \
  --no-default-features --features "$FEATURES" >/tmp/start-${BRANCH}-build.log 2>&1

(
  cd "$ROOT/backend"
  export PORT=8081
  if [[ "$DOCKER_READY" != true ]]; then
    export SYNC_TO_ORACLE=false
  fi
  RUST_MIN_STACK=8388608 ./target/debug/api_main
) > /tmp/start-${BRANCH}-backend.log 2>&1 &

(
  cd "$ROOT/client"
  npm run dev -- --port 5173 --host 127.0.0.1
) > /tmp/start-${BRANCH}-frontend.log 2>&1 &

for i in $(seq 1 40); do
  if curl -sf http://127.0.0.1:8081/api/health >/dev/null \
    && curl -sf http://127.0.0.1:5173/ >/dev/null; then
    img_code="$(curl -s -o /dev/null -w '%{http_code}' \
      'http://127.0.0.1:8081/card_images/landing-demo/verbs-essentials/verbs-essentials_card_1_def0.avif' \
      2>/dev/null || echo 000)"
    echo "✅ dev listo — backend :8081, frontend :5173, demo image HTTP ${img_code}"
    exit 0
  fi
  sleep 1
done
echo "timeout esperando servidores — ver /tmp/start-${BRANCH}-backend.log" >&2
exit 1
