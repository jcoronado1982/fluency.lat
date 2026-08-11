# Reporte de Incidente: Audio mudo en producción (modo Oracle remoto accidental)
**Fecha:** 12 de julio de 2026
**Estado:** Resuelto ✅ (mitigación en caliente + fix permanente en commit `1ec23db9`)

## 🚨 Descripción del Problema
Tras el deploy a producción, el audio de las flashcards dejó de reproducirse:
- **Usuarios gratuitos (viewer):** `404 Audio no encontrado` en todas las palabras y frases → botón de audio mudo.
- **Admin/premium:** el sistema **regeneraba por TTS audios que ya existían** en disco (gasto de cuota Gemini TTS y archivos duplicados en `card_audio/es_en/…`).
- Efecto colateral en **imágenes**: resolución lenta y URLs sin `?v=` (sin caché immutable del navegador).

En 48h de logs: cientos de peticiones `🎧`, **0 aciertos de búsqueda legacy**, decenas de `🚫 Generación bloqueada` para viewers.

## 🔍 Causas Raíz (dos, encadenadas)

### 1. `ORACLE_REPOSITORY_ONLY` sin definir → default `true` (LA FALLA PRINCIPAL)
`backend/api_main/src/config.rs` tiene estos defaults:
- `ORACLE_REPOSITORY_ONLY` → `true` (modo "el repositorio vive en Oracle, léelo remoto")
- `ORACLE_HOST` → `157.151.199.170` (hardcodeado)
- `ORACLE_SSH_PASSWORD` → `""` (vacío)

`deploy-oracle-backend.sh` exportaba `SYNC_TO_ORACLE=false` pero **no** `ORACLE_REPOSITORY_ONLY`. Resultado: el backend del proxy — que tiene el repositorio **montado localmente en `/data`** — se trataba a sí mismo como servidor remoto:

- `blob_exists` (rutas exactas): HEAD HTTPS a `https://fluency.lat/...` → funcionaba, pero lento (TLS a sí mismo por dominio público).
- `find_blob_by_prefix` (búsqueda de audio legacy, que necesita **listar directorios**):
  1. SSH `root@157.151.199.170` con contraseña vacía → `⚠️ ls remoto falló ...: Permission denied` (firma inequívoca en logs).
  2. Fallback HTTP: parsear el listado `browse` de Caddy → falla porque `/card_audio` **no tiene `browse`** (solo `/json` lo tiene).
  3. La rama de lectura local se **salta** (está guardada por `!oracle_as_source_of_truth()`).
  → **Toda búsqueda por prefijo devolvía "no existe", siempre.**
- `blob_version` (mtime para `?v=` de imágenes): mismo SSH fallido → URLs sin versión → el navegador no podía cachear immutable.

El modo remoto es correcto **solo para los mirrors** (AWS / Cloud Run), que configuran `SYNC_TO_ORACLE=true` + `ORACLE_HOST` + password explícitos en el pipeline.

### 2. Búsqueda legacy desactivada para español (`lang ≠ en`)
`should_skip_legacy_audio` saltaba la búsqueda en la biblioteca legacy para cualquier idioma distinto de inglés. Las **~5.300 frases pregeneradas** (incluidas todas las españolas `_es_`) viven en el layout legacy `card_audio/{categoría}/{deck}/…` — el layout nuevo `card_audio/{dirección}/{categoría}/…` solo tenía ~120 archivos. El hash del nombre NO incluye la dirección: legacy y nuevo comparten nombre de archivo, solo cambia la carpeta.

## 🧪 Cómo se diagnosticó (reproducible)
```bash
# El endpoint acepta invitado sin JWT — prueba directa contra el binario vivo:
curl -X POST http://localhost:8080/api/resolve-audio -H "Content-Type: application/json" \
  -d '{"category":"preposition","deck":"1-basic","text":"in","voice_name":"","tone":"",
       "verb_name":"in","lang":"en","course_direction":"es_en"}'
# Antes del fix: 404 aunque card_audio/preposition/1-basic/1-basic_in_in_*.ogg existía.
# Después: {"audio_url":"/card_audio/preposition/…","voice_name":"Legacy","from_cache":true}

docker logs flashcard-backend-node | grep "ls remoto falló"   # firma de la falla
```

## 🛠️ Solución Implementada

### Mitigación inmediata (aplicada en caliente, 2026-07-12)
Se recrearon `flashcard-backend-node` y `qa-flashcard-backend-node` con `ORACLE_REPOSITORY_ONLY=false`, preservando imagen, env y límites (512m/128m). Verificado al instante: audio inglés resuelto desde legacy, cero procesos SSH.

### Fix permanente (commit `1ec23db9`)
1. **`infra/proxy/deploy-oracle-backend.sh`**: fija `-e ORACLE_REPOSITORY_ONLY="false"` (con comentario del porqué). Cubre prod y QA en cada deploy futuro; los mirrors no se tocan.
2. **`backend/mod_flashcards/src/audio_use_cases.rs`**:
   - `legacy_audio_prefixes()` (función pura, con tests): busca en orden — layout con dirección primero, luego los dos layouts legacy como fallback.
   - Eliminado el salto para español: el sufijo de idioma forma parte del prefijo (`…_es`), así que solo puede matchear audio del mismo texto e idioma; el orden direction-first da la seguridad de dirección que el salto aproximaba.

## ⚡ Nota sobre el "pequeño delay" de imágenes (resuelto con prefetch)
Tras el fix, el servidor resuelve imágenes en <1 ms y Caddy sirve los `.avif` (~15 KB) directo de disco. El delay que quedaba al avanzar de tarjeta era viaje de red, no servidor: `POST /api/resolve-image` (1 RTT) y después `GET /card_images/….avif` (1 RTT + TLS) — dos viajes serializados a un único servidor Oracle (sin CDN), ~0,4-0,5 s cada uno según distancia del usuario.

**Solución aplicada (commit `39ab2e07`)**: el frontend precarga en segundo plano la imagen de la tarjeta SIGUIENTE (`useNextImagePrefetch` + `imagePrefetchCache` en `client/src/components/flashcardStudy/features/`, documentado en `client/CLAUDE.md` §3). Al avanzar, la imagen sale de la caché del navegador sin ninguna petición. Guardas: una sola tarjeta por delante, debounce 600 ms, sin reintentos, caché client-side de solo strings (24 entradas / TTL 5 min), invalidada por mutaciones — carga neta del servidor ~cero. Verificado con Playwright observando la red.

Lo único que sigue pagando su RTT es la **primera** tarjeta de cada sesión; quitarlo requeriría CDN/edge delante de los assets — nunca caché en RAM en la caja de 1 GB.

## ✅ Verificación final (2026-07-12, tras el deploy del build 263)
- El deploy recreó el contenedor con el script nuevo: `docker inspect flashcard-backend-node` muestra `ORACLE_REPOSITORY_ONLY=false`.
- Frase en español (antes 404):
  `resolve-audio {category: preposition, deck: 1-basic, text: "El libro está sobre la mesa.", lang: es}` →
  `{"audio_url":"/card_audio/preposition/1-basic/1-basic_on_el_libro_está_sobre_la_mesa_es_f59330c67de98b4f.ogg","voice_name":"Legacy","from_cache":true}`
- Palabra en inglés: `text: "in"` → `1-basic_in_in_8b78797a2921fbcb.ogg` (`Legacy`).
- Logs sin `ls remoto falló` ni `🚫 Generación bloqueada` para audio existente.
- Confirmado por el usuario en producción: el audio reproduce.

## 🔒 Prevención
- Diagnóstico rápido futuro: `grep "ls remoto falló"` en logs del backend = config de modo Oracle incorrecta.
- El default `true` de `ORACLE_REPOSITORY_ONLY` es un footgun conocido; cualquier contenedor backend lanzado a mano en el proxy debe exportar `ORACLE_REPOSITORY_ONLY=false`.
- Los ~5.300 audios legacy no deben migrarse ni regenerarse: el lookup por prefijo los cubre (tests en `audio_use_cases.rs`).
