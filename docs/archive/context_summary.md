# Resumen de Contexto - Sesión de Ajustes de Generación de Imágenes (06-Jul-2026)

> **AVISO: documento histórico de esa sesión, no describe el runtime vigente completo.** Algunas
> decisiones de UI, media e infraestructura cambiaron después del 6 de julio. Antes de reutilizar
> una conclusión de aquí, leer
> [`docs/infrastructure/AI_OPERATIONS_CONTEXT.md`](docs/infrastructure/AI_OPERATIONS_CONTEXT.md) y
> contrastar el código actual. En particular, la navegación rápida ya cancela trabajo abandonado y
> no debe volver a bloquearse esperando imagen/audio.

Este documento resume los cambios realizados en el proyecto **Flashcard** para resolver problemas de composición de imágenes, rendimiento, gestión de memoria (OOM), y UI. Sirve como punto de partida para que cualquier agente en futuras sesiones retome el contexto rápidamente.

---

## 1. Cambios en el Backend (Rust)

### A. Plausibilidad Geométrica y Composición de Prompts
*   **Archivos:** 
    *   [gemini_grpc_provider.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/api_main/src/infrastructure/ai/gemini_grpc_provider.rs)
    *   [landing_demo_image_prompt.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/mod_flashcards/src/landing_demo_image_prompt.rs)
*   **Detalle:** Añadimos reglas estrictas en el *system prompt* de la IA para resolver el conflicto de composición (p. ej., evitar que Flux coloque pantallas de cine o tableros de clase **detrás** del público/estudiantes solo para que aparezcan en escena). La regla obliga al modelo a mantener una coherencia espacial plausible.

### B. Propagación Obligatoria de Errores (Pipeline)
*   **Archivo:** [image_use_cases.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/mod_flashcards/src/image_use_cases.rs)
*   **Detalle:** Eliminamos el fallback silencioso. Antes, si Ollama (Qwen) estaba apagado o fallaba, el backend continuaba usando la frase original sin refinar. Ahora, el backend detiene la ejecución inmediatamente y retorna un error explícito explicando que el pipeline de prompts falló (así se puede depurar si Ollama está caído).

### C. Log de Generación de Imágenes
*   **Archivo:** [image_generation.log](file:///home/jcoronado/Desktop/dev/flashcard/image_generation.log) (en la raíz del proyecto).
*   **Detalle:** Implementamos un log local que registra en formato JSONL cada solicitud exitosa de prompt refinado, incluyendo la palabra, significado, ejemplo, descripción visual de Qwen y el prompt definitivo enviado a ComfyUI.

---

## 2. Gestión de GPU y Corrección de OOM (Out Of Memory)

*   **Problema original:** ComfyUI arrojaba constantemente `torch.OutOfMemoryError` en la GPU 0 (RTX 5060 Ti 16GB) al intentar renderizar con Flux mientras Ollama (Qwen 3.5 9B) estaba usando parte de esa misma GPU.
*   **Solución:**
    1.  **Ollama en GPU 1 (GTX 1660 - 6GB):** Modificamos el archivo de override del servicio systemd de Ollama ([override.conf](file:///etc/systemd/system/ollama.service.d/override.conf)) añadiendo `Environment="CUDA_VISIBLE_DEVICES=1"`. Qwen corre allí y libera la GPU principal.
    2.  **ComfyUI en GPU 0 (RTX 5060 Ti - 16GB):** Se migró ComfyUI a un servicio del sistema persistente (`comfyui.service` gestionado por systemd-run) configurado con `CUDA_VISIBLE_DEVICES=0`.
    3.  **Logs:** El log de ComfyUI está en su carpeta y el del backend de Rust se configuró para redirigir sus salidas a [backend/backend.log](file:///home/jcoronado/Desktop/dev/flashcard/backend/backend.log).

---

## 3. Cambios en el Frontend (React)

### A. Bloqueo de UI y Navegación
*   **Archivos:**
    *   [FlashcardUiContext.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/modules/flashcards/context/FlashcardUiContext.jsx)
    *   [DemoFlashcardSession.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/modules/landing/features/DemoFlashcardSession.jsx)
    *   [useImageGeneration.js](file:///home/jcoronado/Desktop/dev/flashcard/client/src/components/flashcardStudy/features/useImageGeneration.js)
    *   [Controls.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/components/flashcardStudy/features/Controls.jsx)
    *   [Flashcard.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/components/flashcardStudy/features/Flashcard.jsx)
*   **Detalle:**
    *   Expusimos el estado `isImageLoading` globalmente a través del contexto de UI de flashcards.
    *   En `Controls.jsx`, deshabilitamos los botones "Siguiente", "Anterior", "Marcar como Aprendida" y los atajos de teclado mientras una imagen se esté cargando o generando (`isImageLoading || isAudioLoading`).
    *   En `Flashcard.jsx`, deshabilitamos el click para voltear la tarjeta si `isImageLoading` está activo y cambiamos el cursor del mouse a `wait` (icono de carga).
