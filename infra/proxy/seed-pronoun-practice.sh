#!/bin/bash
# Importa stories/episodes/story_screens para el módulo pronoun en SurrealDB.
# Uso (en el servidor): bash seed-pronoun-practice.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_FILE="${SEED_FILE:-$SCRIPT_DIR/../seed/pronoun_practice_seed.surql}"
CONTAINER="${SURREAL_CONTAINER:-surrealdb}"

if [ ! -f "$SEED_FILE" ]; then
  echo "ERROR: No se encontró $SEED_FILE"
  exit 1
fi

REMOTE_SEED="/tmp/pronoun_practice_seed.surql"
echo "Importando seed de práctica de pronombres en SurrealDB ($CONTAINER)..."
docker cp "$SEED_FILE" "$CONTAINER:$REMOTE_SEED"
docker exec "$CONTAINER" /surreal import \
  --conn http://localhost:8000 \
  --user root \
  --pass root \
  --ns flashcard \
  --db flashcard \
  "$REMOTE_SEED"
docker exec "$CONTAINER" /bin/sh -c "rm -f $REMOTE_SEED" 2>/dev/null || true

echo "Verificando episodios..."
echo "SELECT count() FROM episodes GROUP ALL;" | docker exec -i "$CONTAINER" /surreal sql \
  --conn http://localhost:8000 \
  --user root --pass root \
  --ns flashcard --db flashcard --json

echo "Seed de pronoun practice aplicado."
