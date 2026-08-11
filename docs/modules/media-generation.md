# Media-generation — Pipeline de generación de audio e imágenes (tooling transversal)

> No es un módulo de negocio del registry: es el **tooling** que produce los assets que consume
> el módulo flashcards (y el demo de landing). Corre en la estación **LocalBuild** (PC dev) y en
> el backend de producción bajo demanda de usuarios premium/admin.

## Propósito

Generar y mantener el catálogo de media de las tarjetas:
- **Audio**: síntesis TTS → `.ogg` (Opus) en `card_audio/`.
- **Imágenes**: generación IA → `.avif` en `card_images/`.

## Estado

- Activo. La **entrega/caché** de estos assets (Cloudflare/Caddy, `?v=`) es tema aparte:
  [`../infrastructure/media-delivery-cache.md`](../infrastructure/media-delivery-cache.md).

## Cómo funciona

### Audio (TTS)

1. `backend/mod_flashcards/src/audio_use_cases.rs` orquesta la síntesis.
2. Proveedores: **Gemini TTS** (Google AI Studio, gRPC — `GEMINI_TTS_API_KEY`, backup solo para
   batch local) enrutado por `backend/api_main/src/infrastructure/ai/routing_tts_provider.rs`;
   **ElevenLabs** exclusivamente para `landing-demo`
   (`backend/api_main/src/infrastructure/ai/elevenlabs_tts_provider.rs`).
3. Batch local: `--batch-gen-audio` (usa `GEMINI_TTS_API_KEY_BACKUP` de `backend/.env`);
   fallos en `batch_audio_failures.log`.
4. ⚠️ **`card_audio/` tiene 3 layouts de nombre conviviendo** (~5k audios legacy que se
   encuentran por búsqueda de prefijo): **jamás regenerar ni migrar en masa**.

### Imágenes (ComfyUI/Flux 2 + Qwen)

0. **Atajo de producción/QA**: si `Settings::is_production` (`backend/api_main/src/config.rs`,
   función pura `compute_is_production`) es `true` y el rol es `premium`/`admin` (namespace
   distinto de `landing-demo`), `image_use_cases.rs::get_or_generate_image` salta TODO el
   pipeline de abajo y genera directo con `gemini-3.1-flash-lite-image` sobre el prompt crudo —
   el diálogo Gemini/Local del frontend (`Flashcard.jsx::handleRegenerateImage`, solo visible
   para admin) no tiene efecto en ese caso. `is_production` es `true` en prod y QA (comparten
   SurrealDB remota) y `false` en local (ver incidente #14 de
   `scripts/troubleshooting_library.skill.md`: el namespace `SURREAL_NS=flashcard` es compartido
   entre local y prod, así que la heurística exige además que `SURREAL_URL` no sea
   localhost/127.0.0.1). ⚠️ **La clave de este atajo no es intercambiable**: la Interactions API
   (`generativelanguage.googleapis.com/v1beta/interactions`) tiene que estar habilitada para esa
   clave en concreto. `GEMINI_API_KEY` (Agent Platform) devuelve **403
   `API_KEY_SERVICE_BLOCKED`**; `GEMINI_TTS_API_KEY` (AI Studio) sí funciona — por eso
   `GeminiInteractionsImageProvider::resolve_api_key` usa la cadena `GEMINI_IMAGE_API_KEY` →
   `GEMINI_TTS_API_KEY` → `GEMINI_API_KEY` (incidente #15 de
   `scripts/troubleshooting_library.skill.md`). ⚠️ Como este atajo manda la **frase cruda** (no
   pasa por el refinado de Ollama) y la Interactions API es **conversacional**,
   `finalize_prompt` debe envolverla en una instrucción explícita de fotografía: sin eso, frases
   que suenan a diálogo ("I could help you.") hacen que el modelo *responda* con texto en vez de
   dibujar (incidente #16). Por eso el provider distingue `for_raw_phrase()` (atajo de prod,
   envuelve) de `new()` (landing demo, cuya entrada ya viene refinada y pasa sin tocar) —
   **discriminar por nombre de modelo no sirve: ambos usan `gemini-3.1-flash-lite-image`**.
   En la práctica: **solo en local con `SURREAL_URL`
   apuntando a una
   SurrealDB local se ejercita el pipeline Ollama+ComfyUI de abajo** para usuarios reales de la
   app (fuera del namespace `landing-demo`, que siempre usa Gemini).
1. `backend/mod_flashcards/src/image_use_cases.rs` orquesta el pipeline.
2. **Refinado de prompt**: Ollama (**Qwen**, `OLLAMA_URL=http://127.0.0.1:11434`) convierte la
   palabra/frase en descripción visual. Si Ollama falla, el pipeline **se detiene con error
   explícito** (sin fallback silencioso).
3. **Render**: **ComfyUI + Flux 2** (`flux-2-klein-9b-Q8_0.gguf`) en `http://127.0.0.1:8188` (`COMFY_URL`), instalado en
   `/home/jcoronado/Desktop/dev/ComfyUI`, servicio systemd `comfyui.service`, flag `--cache-none`.
   El render web/responsive nace en **768×512 (3:2)**.
4. **Compresión**: AVIF vía puerto `ImageCompressor` (adapter `AvifCompressor`). El formato
   canónico entregado es **768×512**; al coincidir con Flux 2 evita el estiramiento intermedio que
   existía cuando la salida se forzaba a 896×512. La carga manual del frontend usa el mismo
   tamaño y recorte `cover` centrado.
5. Log JSONL de generaciones: `image_generation.log` (raíz del repo).
6. Tanto la generación individual (`POST /api/generate-image`) como el batch comparten proveedor
   y compresor, por lo que producen 768×512. Batch: `scripts/batch-images.sh`; limpieza de legacy:
   `scripts/prune-legacy-512-avif.py`.
7. Las salidas 896×512 creadas por el resize antiguo pueden corregirse con
   `scripts/restore-stretched-896-images.py`. El script solo selecciona esa resolución, funciona
   en dry-run por defecto y, al ejecutar, escribe un árbol paralelo 768×512 sin sobrescribir el
   origen. `--exclude-top-level landing-demo` mantiene fuera el namespace del demo. No recupera
   los bytes originales ni debe usarse sobre imágenes 896×512 legítimas.

### Hardware (estación LocalBuild — detalle en [`server_inventory.md`](../infrastructure/server_inventory.md))

- **GPU 0** RTX 5060 Ti 16 GB → ComfyUI/Flux 2 (`CUDA_VISIBLE_DEVICES=0`).
- **GPU 1** GTX 1660 Ti 6 GB → Ollama/Qwen (override systemd
  `/etc/systemd/system/ollama.service.d/override.conf` con `CUDA_VISIBLE_DEVICES=1`).
- Esta separación resolvió los `torch.OutOfMemoryError`: no volver a poner ambos en la GPU 0.

### Subida a producción

Los assets generados localmente se suben al disco del proxy real (hoy GCP, antes Oracle)
(`/root/smart-proxy/repository/flashcard/`), fuente de verdad de media. En producción el backend
escribe directo a disco (`SYNC_TO_ORACLE=false`, nombre legado); los mirrors remotos sincronizan hacia el proxy real.
Reglas de RAM (nunca generar/comprimir catálogos en los servidores de 1 GB):
[`../infrastructure/AI_OPERATIONS_CONTEXT.md`](../infrastructure/AI_OPERATIONS_CONTEXT.md).

## Mapa de archivos

| Qué | Ruta |
|---|---|
| Casos de uso | `backend/mod_flashcards/src/audio_use_cases.rs`, `image_use_cases.rs`, `batch/` — piden voz/prompt final vía puertos (`AudioGenerator::pick_voice`, `ImageGenerator::finalize_prompt`), nunca conocen nombres de voz o hints de un proveedor concreto |
| Prompts/voces Gemini (demo) | `backend/api_main/src/infrastructure/ai/gemini_landing_demo_prompts.rs` (2026-07-26: movido fuera de `mod_flashcards`, ver `ARQUITECTURA_MODULAR.md` §8.1) |
| Proveedores IA | `backend/api_main/src/infrastructure/ai/` (gemini_grpc, routing_tts, elevenlabs_tts, avif_compressor…) |
| Endpoints | `backend/api_main/src/api/endpoints/generation.rs` (ver [`flashcards.md`](flashcards.md)) |
| Frontend | `client/src/components/flashcardStudy/features/useImageGeneration.js` (hook-dios, deuda #1 de `client/GEMINI.md` §9), `client/src/adapters/` |
| Scripts | `scripts/batch-images.sh`, `scripts/prune-legacy-512-avif.py`, `scripts/restore-stretched-896-images.py` |
| Logs | `image_generation.log`, `batch_audio_failures.log`, `ollama.log`, `backend/backend.log` |

## Dependencias

- **flashcards** ([`flashcards.md`](flashcards.md)): consumidor de los assets y dueño de los endpoints.
- **landing** ([`landing.md`](landing.md)): namespace `landing-demo` (ElevenLabs).

## Cómo probar

```bash
./start.sh                       # levanta ComfyUI (8188) + backend (8081)
systemctl status ollama comfyui  # ambos servicios systemd activos
# Generar una imagen desde la UI (rol admin dev-guest) y revisar image_generation.log
tail -f image_generation.log
```
