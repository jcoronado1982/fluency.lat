---
name: start-local-stack
description: Inicia de forma rápida y automatizada toda la pila local de Fluency (Base de Datos PERSISTENTE SurrealDB, Backend en Rust, Frontend en React 19 + Vite, Motores de IA C++ en GPUs para imágenes y prompts, y Túnel Cloudflare para launch.lat).
---

# 🚀 Skill: Inicio Rápido de la Pila Local Completa (Fluency)

Este skill inicia en un solo comando todos los servicios locales del proyecto Fluency, asegurando que la base de datos **persistente**, el backend, el frontend, las IAs en GPU y el túnel web estén vivos y funcionando sin perder progreso.

---

## ⚠️ REGLAS OBLIGATORIAS DE BASE DE DATOS (LEER SIEMPRE)
1. **OBLIGATORIO:** SurrealDB **SIEMPRE** se debe iniciar usando el almacenamiento persistente en disco:
   `surrealkv:/home/jcoronado/.surreal_local_data/data.db`
2. **PROHIBIDO:** Usar el modo `memory` al levantar SurrealDB en local, ya que no carga las 524+ palabras aprendidas por el usuario y da la falsa impresión de que la base de datos se borró.

---

## 🎯 Cuándo utilizar este skill
* El usuario dice: *"inicia la app local"*, *"inicia todo"*, *"levanta la app con IAs"*, *"no puedo entrar a launch.lat"*, o tras un reinicio del sistema/servidor.

---

## ⚙️ Servicios que levanta automáticamente:

| Servicio | Puerto / URL | Tecnología | Propósito |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | `http://localhost:5173` | React 19 + Vite | Interfaz de usuario |
| **Túnel Web** | `https://launch.lat` | Cloudflare Tunnel | Acceso web externo a la pila local |
| **Rust Backend** | `http://localhost:8081` | Axum | API principal de producción/dev |
| **SurrealDB Persistente** | `http://127.0.0.1:8001` | SurrealDB 3.2.3 (`surrealkv`) | Base de datos local en disco (`/home/jcoronado/.surreal_local_data/data.db`) |
| **AI Generación Imágenes** | `http://127.0.0.1:8188` | `sd-server` (Flux 2 C++) | Render de imágenes en GPU 0 (RTX 5060 Ti) |
| **AI Refinamiento Prompts** | `http://127.0.0.1:8082` | `llama-server` (Qwen C++) | Optimización de prompts en GPU 1 (GTX 1660) |

---

## 🚀 Comando de Ejecución Directa

```bash
bash /home/jcoronado/Desktop/dev/flashcard/scripts/start_local_stack.sh
```

---

## 🧪 Verificación de Salud Post-Ejecución

```bash
# Verificar backend
curl -s http://localhost:8081/api/health

# Verificar progreso de usuario en SurrealDB local
curl -s -u 'root:root' -H 'surreal-ns: flashcard' -H 'surreal-db: flashcard' -H 'Accept: application/json' http://127.0.0.1:8001/sql -d "SELECT user_id, count() FROM card_progress WHERE learned = true GROUP BY user_id;"

# Verificar túnel web
curl -sI https://launch.lat

# Verificar motores AI
curl -s http://127.0.0.1:8188/v1/models
curl -s http://127.0.0.1:8082/v1/models
```
