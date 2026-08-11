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

### Images (ComfyUI/Flux 2 + Qwen)

1. `backend/mod_flashcards/src/image_use_cases.rs` orchestrates pipeline.
2. **Prompt Refinement**: Ollama (**Qwen**, `OLLAMA_URL=http://127.0.0.1:11434`) converts text to visual description.
3. **Render**: **ComfyUI + Flux 2** (`COMFY_URL=http://127.0.0.1:8188`). Output rendered at **768×512 (3:2)**.
4. **Compression**: AVIF via `ImageCompressor` port (`AvifCompressor` adapter).

### Hardware (LocalBuild Station)

- **GPU 0** RTX 5060 Ti 16 GB → ComfyUI/Flux 2 (`CUDA_VISIBLE_DEVICES=0`).
- **GPU 1** GTX 1660 Ti 6 GB → Ollama/Qwen (`CUDA_VISIBLE_DEVICES=1`).

## How to Test

```bash
./start.sh                       # starts ComfyUI (8188) + backend (8081)
systemctl status ollama comfyui  # check systemd services
tail -f image_generation.log
```
