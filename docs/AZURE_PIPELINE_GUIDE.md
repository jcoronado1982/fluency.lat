# 📘 Guía de Azure Pipelines — Flashcard Project

> Canónico: [`infrastructure/pipeline-and-deploy.md`](infrastructure/pipeline-and-deploy.md). Este
> documento solo profundiza en la configuración de Azure DevOps (sintaxis YAML, pools, service
> connections, lecciones de errores reales). Ante conflicto, manda el canónico. Última revisión: 2026-07-16.
>
> **Lectura obligatoria antes de modificar `azure-pipelines.yml`.**

---

## 📚 Referencias Oficiales

- **Esquema YAML completo**: https://learn.microsoft.com/en-us/azure/devops/pipelines/yaml-schema/
- **Tarea SSH@0** (manual oficial): https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/ssh-v0
- **Variables predefinidas** de Azure Pipelines: https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables
- **Expresiones de condición**: https://learn.microsoft.com/en-us/azure/devops/pipelines/process/expressions
- **Sintaxis de template `${{ if }}`**: https://learn.microsoft.com/en-us/azure/devops/pipelines/process/template-expressions

---

## 🏗️ Arquitectura del pipeline

```
Stage 1 Build_Frontend ──┐  PARALELO — Agente: LocalBuild (PC dev x86_64)
Stage 2 Build_Backend  ──┘  docker buildx arm64+amd64 → push GCR

                          ↓
Stage 3 Deploy_Frontend   → Oracle Caddy  (Agente: Default) — deploy SPA a Oracle;
                                            Oracle está archivado como servidor de PRODUCCIÓN
                                            real (ver tools/oracle-legacy/), pero este stage
                                            sigue activo tal cual (no se tocó al archivar).
Stage 4 Deploy_GCP        → Cloud Run     (Agente: Default) [solo main]
Stage 5 Deploy_Mirrors    → AWS           (Agente: Default) [solo main]
                            (Mirror_Oracle y Mirror_OCI1 quedaron con condition: false el
                             4 ago 2026 — no se ejecutan más, ver azure-pipelines.yml)
Stage 6 Cleanup           → limpia artefactos y workspace de los agentes
```

### Pools de agentes

| Pool | Máquina | Uso |
|------|---------|-----|
| `LocalBuild` | PC dev (x86_64, ~30 GB RAM) | Compilar — Bun/Vite + Docker Buildx Rust |
| `Default` | Agente self-hosted en ARM (histórico: hospedado en Oracle) | Deploy only — NUNCA compilar |

> ⚠️ **REGLA DE ORO**: el agente `Default` (1 GB) **nunca compila**. Solo hace `docker pull` +
> `docker run`. Esto es sobre la máquina que EJECUTA los pasos de deploy (el agente de Azure
> DevOps), no sobre a dónde se despliega — no confundir con el servidor Oracle Proxy que fue
> archivado como destino de producción (`tools/oracle-legacy/`); este agente sigue existiendo
> y ejecutando pasos SSH hacia GCP y AWS.

---

## 🌿 Lógica de ramas

El pipeline corre en dos ramas:

| Rama | URL destino | Puerto | DB Namespace | Mirrors |
|------|------------|--------|--------------|---------|
| `main` | `fluency.lat` | `8080` | `flashcard` | AWS (Oracle/OCI-1 deshabilitados, ver arriba) |
| `qa` | `qa.fluency.lat` | `8081` | `qa_flashcard` | Ninguno activo (antes solo Oracle) |

### Variables compile-time con `${{ if }}`

Para variables que necesitas en **tiempo de compilación** del YAML (ej. `remotePath` usado en `targetFolder` de tareas SSH), usa la sintaxis de **lista/sequence** obligatoriamente:

```yaml
# ✅ CORRECTO — sintaxis de lista (sequence)
variables:
  - name: sshConn
    value: 'SrvPortfolio'
  - ${{ if eq(variables['Build.SourceBranch'], 'refs/heads/qa') }}:
    - name: remotePath
      value: '/root/smart-proxy/qa_flashcard'
  - ${{ else }}:
    - name: remotePath
      value: '/root/smart-proxy/flashcard'
```

```yaml
# ❌ INCORRECTO — sintaxis de mapa (map) mezclada con condicionales
variables:
  sshConn: 'SrvPortfolio'
  ${{ if eq(variables['Build.SourceBranch'], 'refs/heads/qa') }}:
    remotePath: '/root/smart-proxy/qa_flashcard'
  ${{ else }}:
    remotePath: '/root/smart-proxy/flashcard'
```

> **Por qué**: YAML no permite mezclar `key: value` (mapping) con `- name: / value:` (sequence). Azure DevOps requiere sequence cuando se usan condicionales `${{ if }}` en el bloque `variables:` raíz.

### Variables runtime con `$(Build.SourceBranch)` en scripts

Para lógica condicional **dentro de un script shell** (runtime), usa la interpolación normal `$(Build.SourceBranch)`:

```bash
if [ "$(Build.SourceBranch)" = "refs/heads/qa" ]; then
  export BACKEND_PORT=8081
else
  export BACKEND_PORT=8080
fi
```

---

## 🔑 Reglas críticas para la tarea `SSH@0`

### ⚠️ REGLA 1: `commands` vs `inline` — la diferencia más importante

La tarea SSH tiene dos modos de ejecución:

| Modo | Campo YAML | Comportamiento |
|------|-----------|----------------|
| `commands` | `commands: \|` | Ejecuta cada línea como comando **independiente** por `sh -c`. Rompe `if/then/fi` multilínea. |
| `inline` | `inline: \|` | Ejecuta **todo el bloque** como un script `.sh` único. Soporta `if/then/fi`, funciones, loops. |

```yaml
# ✅ CORRECTO — inline soporta if/then/fi
- task: SSH@0
  inputs:
    sshEndpoint: $(sshConn)
    runOptions: 'inline'       # ← inline
    failOnStdErr: false
    inline: |
      if [ "$(Build.SourceBranch)" = "refs/heads/qa" ]; then
        echo "Entorno QA"
      else
        echo "Entorno Producción"
      fi
```

```yaml
# ❌ INCORRECTO — commands rompe if/then/fi multilínea
- task: SSH@0
  inputs:
    sshEndpoint: $(sshConn)
    runOptions: 'commands'     # ← commands NO soporta if/then/fi en múltiples líneas
    commands: |
      if [ "$(Build.SourceBranch)" = "refs/heads/qa" ]; then
        echo "Esto FALLA con: syntax error: unexpected end of file (expecting 'then')"
      fi
```

> **Cuándo usar `commands`**: Solo para **comandos simples de una línea**, como `chown`, `chmod`, `echo`. Nunca para scripts con estructuras de control.

### REGLA 2: `failOnStdErr: false` en tareas SSH

Muchos procesos de Linux (como Docker build, Caddy) escriben mensajes informativos a `stderr`. Si no se pone `failOnStdErr: false`, el pipeline falla aunque el comando haya terminado con éxito.

```yaml
- task: SSH@0
  inputs:
    runOptions: 'inline'
    failOnStdErr: false    # ← SIEMPRE ponerlo en tareas SSH con scripts complejos
    inline: |
      docker build -t fluency-proxy . 2>&1   # unifica stderr→stdout para evitar falsos positivos
```

### REGLA 3: `set -euo pipefail` en scripts SSH `inline`

Para scripts SSH con lógica crítica, añadir `set -euo pipefail` al inicio para que el script **falle rápido** si cualquier comando falla:

```yaml
inline: |
  set -euo pipefail
  export DATABASE_URL="$(DATABASE_URL)"
  # ... resto del script
```

---

## 🔀 Condiciones de stage (`condition:`)

### Condición simple — solo una rama

```yaml
condition: eq(variables['Build.SourceBranch'], 'refs/heads/main')
```

### Condición compuesta — múltiples criterios

```yaml
# ✅ CORRECTO — condición multi-línea con bloque literal
condition: |
  and(
    succeeded('Deploy_Frontend'),
    in(dependencies.Deploy_GCP.result, 'Succeeded', 'Skipped')
  )
```

> **Nota**: Cuando `Deploy_GCP` tiene `condition: ... eq(..., 'refs/heads/main')`, en la rama `qa` se marca como `Skipped`. El `in(..., 'Succeeded', 'Skipped')` permite que `Deploy_Mirrors` continúe igual.

---

## 🔐 Manejo de secretos y variables de grupo

### Variable groups

Los secretos sensibles se almacenan en el grupo `Flashcard-Secrets` de Azure DevOps. Para usarlos en un stage:

```yaml
- stage: MiStage
  variables:
    - group: Flashcard-Secrets   # ← importar el grupo en el stage que lo necesita
  jobs:
    - job: MiJob
      steps:
        - script: echo "$(DATABASE_URL)"   # disponible automáticamente
```

> **NUNCA** pongas el `group` en el bloque raíz `variables:` si no todos los stages lo necesitan — aumenta el tiempo de inicio de cada job.

### Pasar secretos entre steps dentro del mismo job

Para pasar un valor procesado de un `script` step a un `SSH` step posterior en el **mismo job**:

```yaml
# Step 1: calcular y exportar
- script: |
    GCP_CREDS_B64="$(printf '%s' '$(GCP_KEY_JSON)' | base64 -w0)"
    echo "##vso[task.setvariable variable=GCP_CREDS_B64;issecret=true]${GCP_CREDS_B64}"
  displayName: 'Preparar credenciales'

# Step 2: usar la variable exportada
- task: SSH@0
  inputs:
    inline: |
      export GOOGLE_CREDENTIALS_JSON="$(GCP_CREDS_B64)"
```

> La sintaxis `##vso[task.setvariable variable=NOMBRE;issecret=true]VALOR` exporta una variable al scope del job. El flag `issecret=true` la enmascara en los logs.

---

## 🏥 Health Checks — Patrones correctos

### ✅ Verificar el contenedor local (siempre funciona)

```bash
curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/health"
```

### ✅ Verificar Caddy sin DNS (bypass con header Host)

Cuando el subdominio aún no tiene DNS propagado (ej: QA recién creado):

```bash
# HTTPS con -k para certificado local
curl -sf -k -H "Host: qa.fluency.lat" https://127.0.0.1/api/health \
  || curl -sf -H "Host: qa.fluency.lat" http://127.0.0.1/api/health
```

### ✅ Verificar DNS externo — no bloqueante en QA, obligatorio en main

```bash
if curl -sf --connect-timeout 5 "$EXTERNAL_HEALTH_URL"; then
  echo "External health check OK"
else
  echo "WARNING: External health check failed"
  # En QA el DNS puede no estar propagado — solo aviso
  if [ "$(Build.SourceBranch)" != "refs/heads/qa" ]; then
    echo "ERROR: Production external health check must pass."
    exit 1
  fi
fi
```

---

## 📋 Tabla de errores comunes y sus soluciones

| Error en log | Causa | Solución |
|-------------|-------|----------|
| `syntax error: unexpected end of file (expecting "then")` | `runOptions: 'commands'` con `if/then/fi` multilínea | Cambiar a `runOptions: 'inline'` |
| `did not find expected key` / `mapping values are not allowed here` | Mezcla de sintaxis map y sequence en `variables:` | Usar solo `- name: / value:` (sequence) con condicionales `${{ if }}` |
| `Could not resolve host: qa.fluency.lat` | DNS del subdominio QA no propagado | Usar `curl -H "Host: ..."` contra `127.0.0.1` para el check local |
| `SUPER_ADMIN_EMAIL no está definido` | El grupo `Flashcard-Secrets` no importado en el stage | Agregar `- group: Flashcard-Secrets` en `variables:` del stage |
| `sshpass no instalado en el agente` | El agente Oracle no tiene `sshpass` instalado | Instalar con `apt-get install -y sshpass` en bootstrap |
| Pipeline no se dispara en rama `qa` | La rama no está en el `trigger:` | Agregar `- qa` en `trigger.branches.include` |

---

## 🌐 Estructura de directorios en Oracle (`/root/smart-proxy/`)

```
/root/smart-proxy/
├── flashcard/              ← Frontend SPA Producción (Caddy sirve desde aquí)
├── qa_flashcard/           ← Frontend SPA QA
├── infra-proxy/            ← Scripts copiados desde infra/proxy/ por el pipeline
│   ├── bootstrap-oracle.sh
│   ├── deploy-caddy.sh
│   ├── deploy-oracle-backend.sh
│   ├── deploy-surrealdb.sh
│   ├── Caddyfile
│   └── ...
└── repository/
    ├── flashcard/          ← Archivos de datos Producción (montado en /data del contenedor)
    │   ├── card_audio/
    │   ├── card_images/
    │   └── json/
    └── qa_flashcard/       ← Archivos de datos QA
        ├── card_audio/
        ├── card_images/
        └── json/
```

---

## 🐳 Contenedores Docker en Oracle

| Contenedor | Puerto | Rama | Descripción |
|-----------|--------|------|-------------|
| `flashcard-backend-node` | `8080` | `main` | Backend Producción |
| `qa-flashcard-backend-node` | `8081` | `qa` | Backend QA |
| `surrealdb` | `8001` | ambas | Base de datos compartida (namespaces separados) |
| `caddy-smart` | `80/443` | ambas | Reverse proxy — enruta por subdominio |

> SurrealDB usa namespaces/databases separados para aislar los datos:
> - **Prod**: namespace=`flashcard`, db=`flashcard`
> - **QA**: namespace=`qa_flashcard`, db=`qa_flashcard`

---

## 🚦 Flujo Git → Pipeline → Servidores

```
feature/x  →  PR → qa  →  [Azure Pipelines]  →  qa.fluency.lat
                                                  (puerto 8081, DB: qa_flashcard)
                                ↓ aprobado
              qa  →  PR → main  →  [Azure Pipelines]  →  fluency.lat
                                                          (puerto 8080, DB: flashcard)
                                                          + OCI-1 + AWS mirrors
```

---

## ✅ Checklist antes de modificar el pipeline

- [ ] ¿La tarea SSH usa `runOptions: 'inline'` si tiene `if/then/fi`?
- [ ] ¿Las variables raíz con `${{ if }}` usan sintaxis de lista (`- name:`)?
- [ ] ¿Los stages que usan secretos tienen `- group: Flashcard-Secrets` en `variables:`?
- [ ] ¿Los mirrors OCI-1 y AWS tienen `condition: eq(variables['Build.SourceBranch'], 'refs/heads/main')`?
- [ ] ¿Los health checks externos de QA son no-bloqueantes (`|| echo "WARN"`)?
- [ ] ¿`failOnStdErr: false` está en todas las tareas SSH con Docker?
- [ ] ¿El `trigger:` incluye todas las ramas activas (`main` y `qa`)?
