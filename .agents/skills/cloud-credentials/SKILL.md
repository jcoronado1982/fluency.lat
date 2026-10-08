---
name: cloud-credentials
description: Instrucciones unificadas para que Gemini y Claude localicen y utilicen de forma segura las credenciales de AWS, Azure, GCP y Cloudflare del proyecto.
---

# Cloud Credentials & Access Guidelines

Esta skill instruye a los agentes autónomos (Gemini y Claude) sobre cómo localizar y utilizar las credenciales del proyecto para interactuar con infraestructuras en la nube (AWS, Azure, GCP y Cloudflare).

## 1. Ubicación de Credenciales por Entorno

Dado que este proyecto opera en una arquitectura dual (Servidor y Local), debes identificar dónde te estás ejecutando para encontrar los secretos correctos:

### Si eres Gemini (Ejecución Local con Google Antigravity)
- **Archivo de secretos:** `/home/jcoronado/Desktop/dev/flashcard/SECRETS_MAP.md`
- **Llave SSH para AWS:** `/home/jcoronado/Desktop/dev/flashcard/keys/flashcard-aws-key.pem`

### Si eres Claude (Ejecución Remota en Servidor GCP)
- **Archivo de secretos:** `/home/agent/workspace/SECRETS_MAP.md`
- **Llave SSH para AWS:** `/home/agent/workspace/flashcard-aws-key.pem`

## 2. Cómo Utilizar las Credenciales Autónomamente

Tienes **autorización expresa** para leer el archivo `SECRETS_MAP.md`, extraer los valores necesarios y configurarlos en tu entorno (enviroment variables) para ejecutar tareas. NO necesitas pedir permisos adicionales al usuario para leer este archivo cuando la tarea implique despliegue o revisión de nube.

### AWS (Conexiones SSH)
Para acceder a instancias en AWS, utiliza la llave `.pem`. Ejemplo de comando:
```bash
ssh -o StrictHostKeyChecking=no -i <RUTA_DE_LA_LLAVE_AWS_SEGUN_TU_ENTORNO> user@host
```

### Azure DevOps
El archivo contiene el PAT (Personal Access Token). Para realizar operaciones automatizadas, carga el token en la terminal temporalmente:
```bash
export AZURE_DEVOPS_EXT_PAT="<TOKEN_EXTRAIDO_DE_SECRETS_MAP>"
az devops configure --defaults organization=https://dev.azure.com/safejcoronado1982 project=theruby
```

### GCP / Gemini API / Google AI Studio
Lee los campos `GEMINI_TTS_API_KEY`, `GEMINI_API_KEY` o `GCP_API_KEY` y úsalos en peticiones HTTP, SDKs o ejecución de scripts del backend.
```bash
export GEMINI_API_KEY="<TOKEN_EXTRAIDO_DE_SECRETS_MAP>"
```

### Cloudflare
Utiliza el `CLOUDFLARE_API_TOKEN` referenciado para tareas de red como limpieza de caché mediante cURL.

## 3. Reglas de Seguridad Obligatorias
1. **Nunca imprimas los tokens:** No muestres contraseñas ni tokens reales en tus respuestas por el chat. Confirma que la operación fue exitosa diciendo "Conexión exitosa" o similar.
2. **Cero Commits:** Nunca agregues el archivo `SECRETS_MAP.md` ni el `.pem` a un commit de Git.
3. **Memoria Temporal:** Usa `export` para la sesión actual de bash. No escribas tokens quemados (hardcoded) en código de producción.

## 4. Terminología de Entornos (Nomenclatura del Usuario)
Cuando el usuario te asigne tareas o te pida buscar/guardar información, utilizará los siguientes alias para referirse a la infraestructura:

- **"La Bestia" (o "thebeast")**: Se refiere a la **máquina virtual / PC Local** de desarrollo (Linux Arch con GPU RTX 5060 Ti). 
  - Si el usuario dice *"pon esto en la bestia"*, debes ubicar los archivos o ejecutar los comandos en el entorno local (rutas bajo `/home/jcoronado/Desktop/`).
  - Para Claude (remoto), esto implica usar las herramientas MCP `local_pc` (`mcp__local_pc__write_local_file`, `mcp__local_pc__run_local_command`).

- **"El Server" (o "server-ai")**: Se refiere al **servidor en la nube** (GCP Alpine Linux) donde corre el daemon AI Orchestrator Bridge.
  - Si el usuario dice *"búscalo en el server"*, debes buscar en las rutas remotas del contenedor GCP (como `/home/agent/workspace/` o la ruta de despliegue correspondiente).
  - Para Gemini (local), esto podría implicar conectarse vía SSH (`ssh root@34.139.53.254`) para interactuar con dicho servidor.

- **"Qwen" (o "la LLM local")**: Es el modelo local (Qwen 2.5 Coder 14B) que corre físicamente en **La Bestia** (PC local) acelerado por la GPU RTX 5060 Ti. Atiende peticiones en el puerto 8082 (`local_runner`) y 8080 (`llama-server`).
