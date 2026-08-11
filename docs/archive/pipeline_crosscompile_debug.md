# 🔧 Debug: Pipeline Cross-Compile ARM64 — Sesión 2026-06-06

> ⚠️ **DOCUMENTO HISTÓRICO** — describe problemas de compilar en Oracle ARM (ya resuelto).
> **Arquitectura actual (Jun 2026):** compilar en pool `LocalBuild` (PC), deploy en `Default` (Oracle).
> **Leer en su lugar:** [`pipeline-and-deploy.md`](pipeline-and-deploy.md)

## Estado actual al pausar

- **Build activo en cola:** `Build 150` → `notStarted` (esperando agente)
- **Pipeline en repo:** `azure-pipelines.yml` → commit `e96e885` (nuevo, no probado aún)
- **Backup del pipeline anterior:** `azure-pipelines.yml.bak`

---

## Raíz del problema original (builds 145 y 146)

El `docker buildx` fallaba en el agente Oracle ARM con **DOS errores distintos**:

### Error 1 — Disco lleno en Oracle (97%)
```
⚠ Free disk space on / is lower than 5%; Currently used: 97.01%
```
El agente auto-hospedado en Oracle tiene el disco casi lleno. `docker buildx` genera
capas intermedias gigantes (imagen Rust ~2-3 GB) que desbordan el disco.

### Error 2 — `make` no instalado en el builder (Dockerfile)
```
Error building OpenSSL dependencies:
    Command 'make' not found. Is make installed?
    Command failed: cd ".../openssl-build/build/src" && "make" "depend"
```
El `Dockerfile` instala `gcc`, `g++`, `pkg-config`, `perl` pero **olvida `make`**.
Cargo intenta compilar `openssl-sys` desde fuente y falla porque `make` no existe en
la imagen builder. Esto pasa tanto para `amd64` como para `arm64`.

**Línea exacta del Dockerfile a corregir (línea 10-16):**
```dockerfile
# ANTES (falta make):
RUN apt-get update && apt-get install -y \
    pkg-config \
    perl \
    gcc \
    g++ \
    make \          ← ya está, pero el problema es que make no compila openssl-src
    && rm -rf /var/lib/apt/lists/*
```

Espera — `make` SÍ está en el Dockerfile. El problema real es que la variable
de entorno `AR_aarch64_unknown_linux_gnu` no está configurada para el paso de
dependencias (líneas 36-47 del Dockerfile), pero `openssl-src` intenta compilar
OpenSSL nativo (no el pkg del sistema). Solución: usar `openssl` del sistema con
`OPENSSL_NO_VENDOR=1` o agregar `libssl-dev` al builder.

---

## Cambios ya aplicados al pipeline (commit e96e885)

| Qué cambió | Por qué |
|---|---|
| Stages 1+2 usan `vmImage: ubuntu-latest` | Oracle ARM 1GB no puede compilar Rust |
| Stages 1+2 corren en paralelo (`dependsOn: []`) | Reduce tiempo total |
| `docker buildx` con `--cache-from/to` GCR | Warm builds en ~3-5 min |
| `Cache@2` para bun modules | Ahorra ~30 s en front |
| Eliminado `CopyFiles@2` innecesario | Limpieza |
| 5 stages separados (antes 4) | Build separado de Deploy |

---

## Problema pendiente: Build 150 en `notStarted`

El build 150 (primer run del nuevo pipeline) lleva varios minutos en cola sin iniciar.

**Causa probable:** La organización `safejcoronado1982` en Azure DevOps puede no tener
créditos de agentes Microsoft-hosted disponibles (plan gratuito = 0 parallel jobs
para proyectos privados).

**Cómo verificarlo:**
```
https://dev.azure.com/safejcoronado1982/_settings/buildqueue
```
Si dice "No parallel jobs" → necesita comprar 1 slot (~$40/mes) o usar alternativa.

---

## Próximos pasos al retomar (en orden de prioridad)

### Paso 1 — Limpiar disco de Oracle (URGENTE, hace fallar todo)
```bash
# Conectar al Oracle ARM (via SrvPortfolio SSH o directo):
docker system prune -af --volumes
docker builder prune -af
df -h /
# Objetivo: bajar de 97% a <70%
```

### Paso 2 — Corregir el Dockerfile del backend (CRÍTICO)
Agregar `libssl-dev` al builder O usar OpenSSL del sistema para evitar compilar
openssl-src desde fuente:

```dockerfile
# En backend/Dockerfile, en el RUN de apt-get del builder (línea ~10):
RUN apt-get update && apt-get install -y \
    pkg-config \
    perl \
    gcc \
    g++ \
    make \
    libssl-dev \        ← AGREGAR ESTO
    && rm -rf /var/lib/apt/lists/*
```

Y en el build de dependencias agregar la variable:
```dockerfile
ENV OPENSSL_NO_VENDOR=1
```

### Paso 3 — Resolver el problema de agentes Microsoft-hosted
**Opción A (recomendada):** Comprar 1 parallel job Microsoft-hosted en Azure DevOps
- URL: `https://dev.azure.com/safejcoronado1982/_settings/buildqueue`
- Costo: ~$40/mes (1 job paralelo)

**Opción B (gratis):** Seguir usando el `Default` pool (Oracle ARM) pero:
1. Primero limpiar el disco (Paso 1)
2. Agregar `libssl-dev` al Dockerfile (Paso 2)
3. Revertir `vmImage: ubuntu-latest` → `{ name: 'Default' }` solo en builds
4. El pipeline funciona pero sigue siendo lento (~20-30 min)

**Opción C (gratis alternativa):** Registrar un segundo agente en una máquina más
potente (ej. la máquina de desarrollo local) como agente del pool `Default`

### Paso 4 — Verificar que el nuevo pipeline funcione de extremo a extremo

---

## Archivos importantes

| Archivo | Estado |
|---|---|
| `azure-pipelines.yml` | Nuevo optimizado (commit e96e885, NO probado) |
| `azure-pipelines.yml.bak` | Pipeline anterior (fallaba por disco+openssl) |
| `azure-pipelines.yml.gold` | Versión certificada anterior (207 líneas) |
| `backend/Dockerfile` | Necesita `libssl-dev` agregado |

---

## Comandos rápidos para retomar

```bash
# Ver estado del build en cola
az pipelines build show \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby --id 150 --output json | python3 -c \
  "import sys,json; b=json.load(sys.stdin); print(b['status'], b.get('result','?'))"

# Ver últimos builds
az pipelines build list \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby --top 5 --output table

# Disparar nuevo build manual
az pipelines build queue \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby --definition-name "jcoronado1982.fluency" --branch main

# Ver timeline de un build (reemplazar BUILD_ID)
az devops invoke \
  --organization https://dev.azure.com/safejcoronado1982 \
  --area build --resource timeline \
  --route-parameters project=theruby buildId=BUILD_ID \
  --output json | python3 -c "
import sys, json
for r in sorted(json.load(sys.stdin).get('records',[]), key=lambda x: x.get('order',0)):
    if r.get('type') in ('Stage','Job','Task'):
        ind = '' if r['type']=='Stage' else '  ' if r['type']=='Job' else '    '
        print(f'{ind}[{r[\"type\"]}] {r.get(\"name\",\"\")[:40]:40} {r.get(\"state\",\"\"):12} {r.get(\"result\",\"-\")}')
        for i in (r.get('issues') or []):
            print(f'     ⚠ {i.get(\"message\",\"\")}')
"
```

---

## Contexto de arquitectura (resumen)

```
Browser → fluency.lat (Oracle ARM 1GB = Caddy proxy)
  └── /api/* → AWS EC2 Alpine (backend primario)
             → GCP Cloud Run (fallback)

Servidores backend:
  - AWS EC2 34.229.229.255  (Alpine, docker con doas)
  - GCP Cloud Run            (imagen gcr.io/launch-490115/flashcard-backend)
  - OCI-1  129.158.214.227   (mirror Oracle)
  - Oracle 157.151.199.170   (proxy Caddy + mirror backend)

Stack: Rust (Axum) + React 19 (Vite/Bun) + SurrealDB
PostgreSQL aparece en notas históricas como soporte previsto para pagos/transacciones futuras, no como base activa del producto en esta arquitectura.
Secrets: Variable group "Flashcard-Secrets" en Azure DevOps
```
