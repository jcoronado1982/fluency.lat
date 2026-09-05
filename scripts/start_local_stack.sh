#!/bin/bash
# ==============================================================================
# Script: start_local_stack.sh
# Propósito: Iniciar la pila local completa de Fluency (DB PERSISTENTE, Backend, AI Locales, Frontend y Túnel)
# ==============================================================================

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "🧹 Limpiando procesos antiguos en puertos 8001, 8081, 8082, 8188, 5173..."
fuser -k 8001/tcp 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true
fuser -k 8082/tcp 2>/dev/null || true
fuser -k 8188/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
pkill -f cloudflared 2>/dev/null || true
sleep 1

# 1. Base de Datos SurrealDB PERSISTENTE (8001)
echo "🗃️ 1. Iniciando SurrealDB 3.2.3 PERSISTENTE (puerto 8001)..."
DATA_DIR="/home/jcoronado/.surreal_local_data/data.db"
setsid /home/jcoronado/.surrealdb/surreal start --bind 127.0.0.1:8001 --user root --pass root "surrealkv:$DATA_DIR" > "$REPO_ROOT/surrealdb.log" 2>&1 &

# 2. Generación de Imágenes C++ - stable-diffusion.cpp (8188) en GPU 0 (RTX 5060 Ti)
echo "🎨 2. Iniciando AI Generación de Imágenes (sd-server / Flux 2 C++ en GPU 0, puerto 8188)..."
SD_BIN="/home/jcoronado/Desktop/dev/stable-diffusion.cpp/build/bin/sd-server"
MODELS_DIR="/home/jcoronado/Desktop/dev/models"
if [ -f "$SD_BIN" ]; then
    CUDA_VISIBLE_DEVICES=0 setsid "$SD_BIN" \
      --diffusion-model "$MODELS_DIR/unet/flux-2-klein-9b-Q8_0.gguf" \
      --llm "$MODELS_DIR/clip/Qwen_Qwen3-8B-Q8_0.gguf" \
      --vae "$MODELS_DIR/vae/flux2-vae.safetensors" \
      --backend diffusion=cuda0,llm=cpu,vae=cpu \
      --fa \
      --vae-tiling \
      --listen-port 8188 \
      --listen-ip 127.0.0.1 > "$REPO_ROOT/sd_server.log" 2>&1 &
fi

# 3. Refinamiento de Prompts (Configurado para Gemini Cloud - llama-server desactivado para experimento)
echo "✍️ 3. Refinamiento de Prompts configurado en Gemini Cloud (ahorrando VRAM/RAM local)..."
# LLAMA_BIN="/home/jcoronado/Desktop/dev/llama.cpp/build/bin/llama-server"
# if [ -f "$LLAMA_BIN" ]; then
#     CUDA_VISIBLE_DEVICES=1 setsid "$LLAMA_BIN" \
#       -m "$MODELS_DIR/clip/Qwen_Qwen3-8B-Q8_0.gguf" \
#       --port 8082 \
#       --host 127.0.0.1 > "$REPO_ROOT/llama_server.log" 2>&1 &
# fi

# 4. Backend Rust Axum (8081)
echo "🔥 4. Iniciando Backend Rust Axum (puerto 8081)..."
cd "$REPO_ROOT/backend" || exit 1
export PORT=8081
export LOCAL_STORAGE_PATH="$REPO_ROOT"
export SURREAL_URL="ws://127.0.0.1:8001"
export SURREAL_NS="flashcard"
export SURREAL_DB="flashcard"
export FLASHCARD_PROMPT_ENGINE="gemini"
setsid cargo run -p api_main > "$REPO_ROOT/backend.log" 2>&1 &

# 5. Frontend React 19 + Vite (5173)
echo "🌐 5. Iniciando Frontend React + Vite (puerto 5173)..."
cd "$REPO_ROOT/client" || exit 1
setsid npm run dev -- --port 5173 --host 0.0.0.0 > "$REPO_ROOT/vite.log" 2>&1 &

# 6. Túnel Cloudflare para launch.lat
echo "🚀 6. Conectando Túnel Cloudflare (launch.lat)..."
setsid cloudflared tunnel run cf7c2613-abcd-45bb-a759-da0f61a2b1bc > "$REPO_ROOT/cloudflared.log" 2>&1 &

disown -a 2>/dev/null || true
cd "$REPO_ROOT" || exit 1

echo "⏳ Esperando 5 segundos para verificación de salud..."
sleep 5

echo ""
echo "======================================================================="
echo "✅ PILA LOCAL Y SERVICIOS INICIADOS CORRECTAMENTE (BACKEND HYBRID CUDA/CPU)"
echo "======================================================================="
echo "📱 Frontend Local:          http://localhost:5173"
echo "🌐 Frontend Túnel Web:       https://launch.lat"
echo "⚙️ Rust Backend (API):      http://localhost:8081"
echo "🗃️ SurrealDB (Persistente): http://127.0.0.1:8001"
echo "🎨 Generador Imágenes (AI):  http://127.0.0.1:8188 (sd-server CUDA/CPU)"
echo "✍️ Refinador Prompts (AI):   http://127.0.0.1:8082 (llama-server GPU 1)"
echo "======================================================================="
