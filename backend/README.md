# Backend

## Credenciales locales de Google

El backend soporta tres formas de autenticacion para Google:

1. `GOOGLE_CREDENTIALS_JSON`
2. `GOOGLE_APPLICATION_CREDENTIALS`
3. Archivo local `backend/credentials.json`

El archivo `backend/credentials.json` es solo para desarrollo local y debe quedar fuera de Git.
Si existe y no hay variables de entorno configuradas, `api_main` lo detecta automaticamente.

## Agente local con Ollama

El backend expone un endpoint local para usar un modelo como "motor" y el repo como workspace controlado.

Variables útiles:

- `OLLAMA_URL=http://127.0.0.1:11434`
- `LOCAL_AGENT_MODEL=deepseek-r1:32b`
- `LOCAL_AGENT_WORKSPACE_ROOT=/home/jcoronado/Desktop/dev/flashcard`
- `LOCAL_AGENT_MAX_STEPS=8`
- `LOCAL_AGENT_ALLOWED_COMMANDS=cargo check,cargo test,cargo fmt,git status,git diff,git log`

Endpoint:

- `POST /api/local-agent/turn`

Ejemplo:

```bash
curl -s http://127.0.0.1:8080/api/local-agent/turn \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"revisa el backend y agrega una ruta de salud para el agente"}'
```

Herramientas disponibles para el agente:

- `list_files`
- `read_file`
- `write_file`
- `search`
- `run_command` dentro de la lista blanca
