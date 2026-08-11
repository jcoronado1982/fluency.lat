#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${LOCAL_BASE_URL:-http://127.0.0.1:5173}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "$BASE_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "ERROR: el smoke local solo acepta 127.0.0.1 o localhost: $BASE_URL" >&2
    exit 2
    ;;
esac

health_json=$(curl -fsS "$BASE_URL/api/health")
features_json=$(curl -fsS "$BASE_URL/api/features")
guest_json=$(curl -fsS -X POST "$BASE_URL/api/auth/dev-guest")

python3 - "$health_json" "$features_json" "$guest_json" <<'PY'
import json
import sys

health, features, guest = map(json.loads, sys.argv[1:])
assert health.get("status") == "ok", health
assert features.get("flashcards") is True, features
assert features.get("auth") is True, features
assert guest.get("success") is True and guest.get("token"), guest
print("✅ smoke HTTP local: health, features y dev-guest")
PY

python3 - "$BASE_URL" "$guest_json" "$REPO_ROOT" <<'PY'
import datetime as dt
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

base_url = sys.argv[1].rstrip("/")
guest = json.loads(sys.argv[2])
token = guest["token"]
user_id = guest["user"]["email"]
repo_root = pathlib.Path(sys.argv[3])
phonics_path = repo_root / "static/phonics_audio/phonics.json"
created_phonics_fixture = not phonics_path.exists()
if created_phonics_fixture:
    phonics_path.parent.mkdir(parents=True, exist_ok=True)
    phonics_path.write_text(json.dumps([{
        "rule": "short a",
        "sounds_like": "/æ/",
        "examples": ["cat", "map"],
        "ipa": ["/kæt/", "/mæp/"],
    }]), encoding="utf-8")

def request(method, path, payload=None, *, auth=True, expected=(200,)):
    headers = {"Accept": "application/json"}
    if auth:
        headers["Authorization"] = f"Bearer {token}"
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode()
    req = urllib.request.Request(base_url + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status = response.status
            raw = response.read()
            content_type = response.headers.get("content-type", "")
    except urllib.error.HTTPError as error:
        status = error.code
        raw = error.read()
        content_type = error.headers.get("content-type", "")
    assert status in expected, (method, path, status, raw[:500])
    if "json" in content_type and raw:
        return status, json.loads(raw)
    return status, raw

def get(path, query=None, **kwargs):
    if query:
        path += "?" + urllib.parse.urlencode(query)
    return request("GET", path, **kwargs)

_, categories_payload = get("/api/categories", {
    "course_direction": "es_en",
    "include_counts": "true",
})
categories = categories_payload["categories"]
assert categories and all(item["total"] > 0 for item in categories), categories_payload
category = categories[0]["name"]

_, decks_payload = get("/api/available-flashcards-files", {
    "course_direction": "es_en",
    "category": category,
})
decks = decks_payload["files"]
assert decks and decks_payload["active_file"] == decks[0], decks_payload
deck = decks[0]

context = {
    "user_id": user_id,
    "category": category,
    "deck": deck,
    "course_direction": "es_en",
}

def load_deck():
    _, payload = get("/api/flashcards-data", context)
    assert isinstance(payload, list) and len(payload) >= 3, payload
    return payload

def reset_deck():
    _, payload = request("POST", "/api/reset-all", {**context, "confirm": True})
    assert payload["success"] is True, payload

request("GET", "/api/learning-stats?course_direction=es_en", auth=False, expected=(401,))
request("POST", "/api/reset-all", {**context, "confirm": False}, expected=(400,))

try:
    reset_deck()
    deck_data = load_deck()
    assert not any(card.get("learned") for card in deck_data), "reset no limpió el progreso"

    _, single = request("POST", "/api/update-status", {**context, "index": 0, "learned": True})
    assert single["success"] is True, single
    assert load_deck()[0]["learned"] is True, "update-status no persistió"

    _, batch = request("POST", "/api/update-batch", {
        **context,
        "cards": [{"index": 0, "learned": False}, {"index": 1, "learned": True}],
    })
    assert batch == {"success": True, "saved": 2}, batch
    after_batch = load_deck()
    assert after_batch[0]["learned"] is False and after_batch[1]["learned"] is True

    _, empty = request("POST", "/api/update-batch", {**context, "cards": []})
    assert empty == {"success": True, "saved": 0}, empty
    request("POST", "/api/update-batch", {
        **context,
        "cards": [{"index": index, "learned": False} for index in range(51)],
    }, expected=(400,))
    request("POST", "/api/update-batch", {
        **context,
        "cards": [{"index": 2, "learned": False, "box_level": 1}],
    }, expected=(400,))

    due_at = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1)).isoformat().replace("+00:00", "Z")
    _, srs_saved = request("POST", "/api/update-batch", {
        **context,
        "cards": [{
            "index": 2,
            "learned": False,
            "box_level": 1,
            "ease_factor": 2.5,
            "interval_days": 1.0,
            "next_review_at": due_at,
        }],
    })
    assert srs_saved["saved"] == 1, srs_saved
    _, due = get("/api/srs/due", {"course_direction": "es_en", "limit": 50})
    assert due["success"] is True and isinstance(due["cards"], list), due

    _, stats = get("/api/learning-stats", {"course_direction": "es_en"})
    assert stats["success"] is True and isinstance(stats["stats"], dict), stats
    _, touched = request("POST", "/api/study/touch")
    assert touched["success"] is True, touched
    _, phonics = get("/api/phonics-data")
    assert isinstance(phonics, (dict, list)), type(phonics)

    first_card = deck_data[0]
    first_definition = first_card.get("definitions", [{}])[0]
    media_context = {
        "category": category,
        "deck": deck,
        "index": 0,
        "def_index": 0,
        "course_direction": "es_en",
    }
    image_status, image_result = request(
        "POST", "/api/resolve-image", media_context, expected=(200, 404)
    )
    if image_status == 200:
        image_path = image_result["path"]
        _, image_bytes = request("GET", image_path, auth=False)
        assert len(image_bytes) > 100, "imagen resuelta vacía"

    audio_status, audio_result = request("POST", "/api/resolve-audio", {
        "category": category,
        "deck": deck,
        "text": first_card.get("name") or first_definition.get("usage_example"),
        "voice_name": "",
        "verb_name": first_card.get("name"),
        "tone": "",
        "lang": "en",
        "course_direction": "es_en",
    }, expected=(200, 404))
    if audio_status == 200:
        audio_path = audio_result["audio_url"]
        _, audio_bytes = request("GET", audio_path, auth=False)
        assert len(audio_bytes) > 100, "audio resuelto vacío"

    for route in ("/api/resolve-image", "/api/resolve-audio", "/api/synthesize-speech"):
        request("POST", route, {}, expected=(400, 422))
finally:
    reset_deck()
    if created_phonics_fixture:
        phonics_path.unlink(missing_ok=True)
        try:
            phonics_path.parent.rmdir()
            phonics_path.parent.parent.rmdir()
        except OSError:
            pass

print(
    "✅ integración API local: catálogo, mazo, progreso individual/lote, "
    "SRS, reset, estadísticas, racha, fonética y media"
)
PY
