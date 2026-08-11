# Oracle Local Backend — Runtime en producción (Jul 2026)

> **Documento para IAs y operadores.** Leer antes de tocar Caddy, el backend en Oracle o audio TTS.
> **Restricciones de RAM y topología:** [`AI_OPERATIONS_CONTEXT.md`](AI_OPERATIONS_CONTEXT.md).
> **Para pipeline CI/CD, secretos y compilación:** [`pipeline-and-deploy.md`](pipeline-and-deploy.md) (fuente de verdad).
> **Para entrega y caché de imágenes/audio:** [`media-delivery-cache.md`](media-delivery-cache.md).
> Última revisión contra el código y endpoints públicos: 2026-07-14.

---

## Resumen en una frase

**La API de flashcard en producción va a `localhost:8080` en Oracle y el backend escribe audio/imágenes/JSON directo en disco local — NO usa SSH/SCP ni overflow AWS para el tráfico normal.**

---

## Arquitectura actual (NO confundir con la anterior)

```
Usuario
  └── https://fluency.lat
        └── Caddy (caddy-smart, Oracle 157.151.199.170)
              ├── /flashcard/*     → SPA React (disco)
              ├── /card_audio/*    → disco /root/smart-proxy/repository/flashcard
              ├── /card_images/*   → disco (mismo path)
              ├── /json/*          → disco (mismo path)
              ├── /test/*          → proyecto independiente test1 en :8083 (NO es flashcard)
              └── /api/*           → localhost:8080 si RAM libre > 250 MB
                                      GCP Cloud Run si el monitor retira ORACLE_HEALTHY
```

### Flujo de audio TTS (flashcard)

```
POST /api/synthesize-speech
  → Caddy → flashcard-backend-node :8080
  → Google TTS genera .ogg
  → upload_blob() escribe en /data/card_audio/...  (volumen Docker)
  → mismo path en host: /root/smart-proxy/repository/flashcard/card_audio/...
  → Caddy sirve /card_audio/* desde ese disco
```

**Latencia:** escritura local, sin `sshpass`, sin `scp`, sin nueva conexión SSH por archivo.

---

## Configuración canónica del backend Oracle

Contenedor: `flashcard-backend-node`

| Variable | Valor en Oracle | Por qué |
|----------|-----------------|---------|
| `LOCAL_STORAGE_PATH` | `/data` | Raíz de almacenamiento dentro del contenedor |
| `SYNC_TO_ORACLE` | `false` | **Crítico.** Si es `true`, intenta SCP por SSH → falla o es lento |
| `PORT` | `8080` | Caddy apunta aquí |
| Volumen | `/root/smart-proxy/repository/flashcard:/data` | Mismo disco que sirve Caddy |
| Red | `--network host` | Acceso a SurrealDB del segundo Oracle en `10.0.1.138:8080` |
| `SURREAL_URL` | `10.0.1.138:8080` | VCN privada; SurrealDB no vive en el Proxy |
| `ORACLE_REPOSITORY_ONLY` | `false` | Evita tratar el volumen local como repositorio remoto |
| `MEDIA_DELIVERY_MODE` | `cloudflare` en producción actual | Debe coincidir con Caddy; `oracle` es rollback explícito |

### Verificar en servidor

```bash
docker inspect flashcard-backend-node --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}\n{{end}}'
docker inspect flashcard-backend-node --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'SYNC|LOCAL_STORAGE|PORT'
curl -sf http://127.0.0.1:8080/api/health
curl -sf https://fluency.lat/api/health
```

Valores esperados:
- Mount: `.../repository/flashcard -> /data`
- `SYNC_TO_ORACLE=false`
- `LOCAL_STORAGE_PATH=/data`

---

## Configuración canónica de Caddy

Archivo fuente: `infra/proxy/Caddyfile`

```caddyfile
@backend_routes {
    path /api/*
}
handle @backend_routes {
    import api_with_overflow
}
```

### ❌ NO hacer (errores que ya ocurrieron)

| Error | Síntoma | Causa |
|-------|---------|-------|
| `SYNC_TO_ORACLE=true` en Oracle local | `500` en `/api/synthesize-speech`, mensaje `ssh mkdir falló con código 255` | Backend intenta SSH a sí mismo o sin credenciales |
| Backend sin volumen `/data` | `404` en `/card_audio/...` tras generar audio | Archivo guardado dentro del contenedor, Caddy sirve otro path |
| `SYNC_TO_ORACLE=true` en Oracle | Conexiones SSH extra, RAM desperdiciada en servidor 1 GB | Innecesario cuando backend y disco están en la misma VM |
| Cambiar solo Caddyfile en servidor sin pipeline | Config se pierde en próximo deploy | Fuente de verdad es el repo + pipeline |

---

## Scripts de despliegue (fuente de verdad)

Todo vive en `infra/proxy/`. El pipeline **copia y ejecuta** estos scripts; no duplicar lógica en YAML inline.

| Script | Función |
|--------|---------|
| `bootstrap-oracle.sh` | Crea carpetas, despliega backend y/o Caddy, reinicia monitors |
| `deploy-caddy.sh` | Build `fluency-proxy` + `docker run caddy-smart` con todos los volúmenes |
| `deploy-oracle-backend.sh` | Pull imagen GCR + `flashcard-backend-node` con volumen `/data` |
| `deploy.sh` | Alias de `deploy-caddy.sh` |

### Uso manual en Oracle (migración / recuperación)

```bash
# Todo el stack Oracle (backend + Caddy + monitors)
bash /root/smart-proxy/infra-proxy/bootstrap-oracle.sh --all

# Solo Caddy (tras cambio de Caddyfile)
bash /root/smart-proxy/infra-proxy/bootstrap-oracle.sh --caddy-only

# Solo backend (tras nuevo build de imagen): exportar primero los secretos en
# la misma sesión shell. El pipeline usa SSH inline y es el procedimiento normal.
bash /root/smart-proxy/infra-proxy/bootstrap-oracle.sh --backend-only --no-monitors
```

El pipeline inyecta secretos en memoria dentro de una única sesión `SSH inline`; no genera
`/tmp/flashcard-backend.env`. Ese archivo es legado y el deploy lo elimina si existe.

---

## Pipeline Azure

**Ver documentación completa:** [`pipeline-and-deploy.md`](pipeline-and-deploy.md)

Resumen para este documento (solo runtime Oracle):

| Stage | Qué afecta a Oracle producción |
|-------|-------------------------------|
| 3 — Deploy Front | Caddy + SPA → `bootstrap-oracle.sh --caddy-only` |
| 5 — Mirror Oracle | Backend → `bootstrap-oracle.sh --backend-only` vía SSH `inline` + secretos Azure |

Reglas que aplican aquí (el resto del pipeline está en el otro doc):

1. **NO** `SYNC_TO_ORACLE=true` en contenedor Oracle.
2. **NO** quitar volumen `repository/flashcard:/data`.
3. **SÍ** mantener `api_with_overflow`: Oracle local es primario y GCP solo entra bajo presión de RAM.

---

## AWS y GCP (rol actual — secundario para fluency.lat)

| Servidor | Rol hoy | SYNC_TO_ORACLE | Notas |
|----------|---------|----------------|-------|
| AWS `34.229.229.255` | Espejo / backup backend | `true` | Sigue usando SCP hacia Oracle si genera assets |
| GCP Cloud Run | Overflow histórico | `true` | Pipeline stage 4 sigue desplegando |
| Oracle `157.151.199.170` | **Primario en producción** | `false` | API y almacenamiento local |

El snippet `api_with_overflow` **sí se usa** para `/api/*`: el archivo
`/tmp/ORACLE_HEALTHY` selecciona Oracle local; si falta, selecciona GCP Cloud Run. AWS no forma parte
de esta decisión de Caddy.

`aws-health-monitor.sh` puede seguir corriendo; no afecta el routing actual de `/api/*`.

---

## Proyecto independiente `/test` (test1)

- URL: `https://fluency.lat/test`
- Contenedor: `audio-clone-rust` en puerto **8083**
- **NO** mezclar con flashcard-backend-node
- Despliegue: **manual** (no usa pipeline flashcard)
- Caddy: `handle /test*` con `strip_prefix /test` → `:8083`

---

## Diagnóstico rápido de audio roto

```bash
# 1. API responde
curl -sf https://fluency.lat/api/health

# 2. Backend Oracle bien configurado
ssh root@157.151.199.170 \
  'docker inspect flashcard-backend-node --format "{{range .Config.Env}}{{println .}}{{end}}" | grep SYNC'

# 3. Caddy conserva la válvula Oracle local → GCP
ssh root@157.151.199.170 \
  'docker exec caddy-smart grep -A20 "(api_with_overflow)" /etc/caddy/Caddyfile'

# 4. La respuesta indica el backend elegido
curl -sI https://fluency.lat/api/health | grep -i '^x-backend:'

# 5. Probar síntesis (requiere JWT de usuario autenticado)
# Si 500 con "ssh mkdir" → SYNC_TO_ORACLE=true o API yendo a AWS
```

---

## Historial del cambio

| Fecha | Qué pasó |
|-------|----------|
| 2026-06-07 | Audio flashcard fallaba: API iba a AWS, SCP SSH código 255 |
| 2026-06-07 | Fix: Caddy → `localhost:8080`, backend Oracle con volumen `/data`, `SYNC_TO_ORACLE=false` |
| 2026-06-07 | Scripts `bootstrap-oracle.sh`, `deploy-oracle-backend.sh`, `deploy-caddy.sh` + pipeline actualizado |
| 2026-06-07 | Pipeline #154 succeeded — config reproducible en cada deploy |
| 2026-06-08 | Secretos efímeros, SSH inline, deploy serializado — ver `pipeline-and-deploy.md` |
| 2026-06-08 | Pipeline #165 — 5 stages OK |
| 2026-07-14 | Documentado `api_with_overflow`, SurrealDB remoto, modo Cloudflare y secretos SSH inline |

---

## Terraform vs Pipeline

- **Pipeline + `infra/proxy/*.sh`** → configuración de contenedores y Caddy en VM existente (**usar esto**).
- **Terraform** → solo si se provisiona VM/red/DNS desde cero; no reemplaza los scripts de deploy de aplicación.
