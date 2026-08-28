# Media Generation — Audio and Image Generation Pipeline

> Cross-cutting tooling producing assets consumed by flashcards module and landing demo. Runs on **LocalBuild** station (dev PC) and production backend for premium/admin users.

## Purpose

Generate and maintain the card media catalog:
- **Audio**: TTS synthesis → `.ogg` (Opus) in `card_audio/`.
- **Images**: AI generation → `.avif` in `card_images/`.

## Status

- Active. Media delivery/caching (Cloudflare/Caddy, `?v=`) is covered in [`../infrastructure/media-delivery-cache.md`](../infrastructure/media-delivery-cache.md).

## How It Works

### Audio (TTS)

1. `backend/mod_flashcards/src/audio_use_cases.rs` orchestrates synthesis.
2. Providers: **Gemini TTS** (Google AI Studio gRPC) routed by `backend/api_main/src/infrastructure/ai/routing_tts_provider.rs`; **ElevenLabs** exclusively for `landing-demo`.

### Images (stable-diffusion.cpp / Flux 2 + llama.cpp / Qwen)

1. `backend/mod_flashcards/src/image_use_cases.rs` orchestrates pipeline.
2. **Prompt Refinement**: **llama.cpp / Qwen** (`llama-server` on `http://127.0.0.1:8082` or Gemini gRPC) converts text to visual description.
3. **Render**: **`stable-diffusion.cpp` + Flux 2** (`sd-server` on `http://127.0.0.1:8188`, native C++ with CUDA 13.3). Output rendered at **768×512 (3:2)**.
4. **Compression**: AVIF via `ImageCompressor` port (`AvifCompressor` adapter) to ~50 KB.

### Hardware y Rutas del Sistema (LocalBuild Station)

- **GPU 0** RTX 5060 Ti 16 GB → `stable-diffusion.cpp` / Flux 2 (`sd-server` en puerto 8188).
- **GPU 1** GTX 1660 6 GB → `llama.cpp` / Qwen (`llama-server` en puerto 8082).

#### Ubicación de Binarios y Modelos en Disco:
- **Directorio Central de Modelos:** `/home/jcoronado/Desktop/dev/models/`
  - *Flux 2 UNet:* `/home/jcoronado/Desktop/dev/models/unet/flux-2-klein-9b-Q8_0.gguf`
  - *Qwen Text Encoder:* `/home/jcoronado/Desktop/dev/models/clip/Qwen_Qwen3-8B-Q8_0.gguf`
  - *Flux VAE:* `/home/jcoronado/Desktop/dev/models/vae/flux2-vae.safetensors`
- **Binario stable-diffusion.cpp:** `/home/jcoronado/Desktop/dev/stable-diffusion.cpp/build/bin/sd-server`
- **Binario llama.cpp:** `/home/jcoronado/Desktop/dev/llama.cpp/build/bin/llama-server`

## How to Test

```bash
./start.sh                       # starts sd-server (8188) + databases + backend (8081) + vite (5173)
tail -f sd_server.log            # check native C++ generation logs
```
