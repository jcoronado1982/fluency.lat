#!/usr/bin/env bash
set -euo pipefail

SURREAL_HTTP_URL="${SURREAL_HTTP_URL:-http://127.0.0.1:8001}"
case "$SURREAL_HTTP_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "ERROR: la integración Surreal solo acepta 127.0.0.1 o localhost: $SURREAL_HTTP_URL" >&2
    exit 2
    ;;
esac

curl -fsS "$SURREAL_HTTP_URL/health" >/dev/null

# Desde SurrealDB 3.x, seleccionar un NS/DB inexistente por header ya no lo
# crea implícitamente (a diferencia de 1.5.5): hay que DEFINE-arlos primero,
# NS sin contexto y DB ya con el NS seleccionado (verificado empíricamente).
curl -fsS \
  -u "${SURREAL_USER:-root}:${SURREAL_PASS:-root}" \
  -H 'Accept: application/json' \
  -H 'Content-Type: text/plain' \
  --data-binary 'DEFINE NAMESPACE IF NOT EXISTS fluency_local_test;' \
  "$SURREAL_HTTP_URL/sql" >/dev/null

curl -fsS \
  -u "${SURREAL_USER:-root}:${SURREAL_PASS:-root}" \
  -H 'Accept: application/json' \
  -H 'Content-Type: text/plain' \
  -H 'Surreal-NS: fluency_local_test' \
  --data-binary 'DEFINE DATABASE IF NOT EXISTS fluency_local_test;' \
  "$SURREAL_HTTP_URL/sql" >/dev/null

curl -fsS \
  -u "${SURREAL_USER:-root}:${SURREAL_PASS:-root}" \
  -H 'Accept: application/json' \
  -H 'Content-Type: text/plain' \
  -H 'Surreal-NS: fluency_local_test' \
  -H 'Surreal-DB: fluency_local_test' \
  --data-binary 'REMOVE TABLE local_preprod_progress;' \
  "$SURREAL_HTTP_URL/sql" >/dev/null || true

sql='DEFINE TABLE local_preprod_progress SCHEMAFULL;
DEFINE FIELD user_id ON TABLE local_preprod_progress TYPE string;
DEFINE FIELD learned ON TABLE local_preprod_progress TYPE bool;
DEFINE INDEX idx_local_preprod_user ON TABLE local_preprod_progress COLUMNS user_id;
BEGIN TRANSACTION;
CREATE local_preprod_progress CONTENT { user_id: "local-test-user", learned: true };
COMMIT TRANSACTION;
SELECT user_id, learned FROM local_preprod_progress WHERE string::starts_with(user_id, "local-test");
REMOVE TABLE local_preprod_progress;'

response=$(curl -fsS \
  -u "${SURREAL_USER:-root}:${SURREAL_PASS:-root}" \
  -H 'Accept: application/json' \
  -H 'Content-Type: text/plain' \
  -H 'Surreal-NS: fluency_local_test' \
  -H 'Surreal-DB: fluency_local_test' \
  --data-binary "$sql" \
  "$SURREAL_HTTP_URL/sql")

python3 - "$response" <<'PY'
import json
import sys

statements = json.loads(sys.argv[1])
errors = [item for item in statements if item.get("status") != "OK"]
assert not errors, errors
rows = [row for item in statements for row in (item.get("result") or []) if isinstance(row, dict)]
assert any(row.get("user_id") == "local-test-user" and row.get("learned") is True for row in rows), rows
print("✅ SurrealDB 3.2.3 local: transacción, índice y string::starts_with")
PY
