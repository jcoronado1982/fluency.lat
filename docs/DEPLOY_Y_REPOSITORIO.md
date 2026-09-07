# Deploy, repositorio y CI/CD — Fluency (Jul 2026)

> **Fuente de verdad** para Git, Azure DevOps y dominio de producción.
> Detalle operativo del pipeline: [`infrastructure/pipeline-and-deploy.md`](infrastructure/pipeline-and-deploy.md).

---

## Identidad del producto

| Concepto | Valor actual |
|----------|----------------|
| **Marca / dominio** | [fluency.lat](https://fluency.lat) |
| **Nombre interno legado** | Flashcard (paths en servidor, imagen GCR) — no renombrar sin plan de migración |
| **Dominio en transición** | theruby.lat (secundario; ver `.cursorrules`) |

---

## Repositorio Git

| Campo | Valor |
|-------|--------|
| **Repo canónico** | `https://github.com/jcoronado1982/fluency.lat.git` — **es también el que compila el pipeline** desde el 7 sep 2026 |
| **Repos obsoletos** | `jcoronado1982/flashcard`, `jcoronado1982/http-fluency.lat` — eliminados. `jcoronado1982/fluency` — **congelado**, ver aviso abajo |

> 🔴 **Aviso (7 sep 2026): existió un segundo repo desincronizado.** Hasta ese día el pipeline de
> Azure (definición 2) compilaba `jcoronado1982/fluency`, **no** este repo. Los dos tienen historias
> **sin ancestro común** (`git merge-base` entre ambos `main` no devuelve nada) y habían divergido en
> ~400 archivos: `fluency` se quedó en el commit `29298b39` del **5 ago 2026** mientras todo el
> trabajo seguía en `fluency.lat`. Consecuencia: **durante un mes el CI construyó y desplegó código
> de agosto**, y ningún cambio de septiembre pasó por el pipeline.
>
> Corregido apuntando la definición 2 a `jcoronado1982/fluency.lat` (revisión 5 del pipeline).
> `jcoronado1982/fluency` queda **congelado**: no borrarlo todavía (guarda la historia de agosto),
> pero **no commitear ahí**. Si algún día un build vuelve a checkoutear un commit que no existe en
> tu clon local, es este mismo problema.
| **Rama desarrollo** | `dev-flashcards` (+ `dev-pronoun`, `dev-admin`) — **NO despliegan** |
| **Rama integración** | `dev-full` — integra módulos, **NO despliega** |
| **Rama pre-prod** | `qa` → auto-deploy a `qa.fluency.lat` |
| **Rama producción** | `main` → auto-deploy a `fluency.lat`. El backend real corre en GCP
  (Oracle archivado, ver `tools/oracle-legacy/`); el pipeline sigue deployando el SPA/frontend
  a Oracle vía Deploy_Frontend (sin cambios), aunque no sirva el tráfico real de la API. |

```bash
git remote -v
# origin  https://github.com/jcoronado1982/fluency.lat.git
```


Push a `qa` o `main` dispara el pipeline si cambian `client/**`, `backend/**`, `infra/**` o `azure-pipelines.yml`.  
**`dev-*` y `dev-full` no despliegan** — ver [GIT_BRANCHES.md](GIT_BRANCHES.md).

---

## Flujo de trabajo: dev → QA → Producción

```
dev-flashcards  ──(merge/PR)──▶  qa  ──── auto-deploy ──▶  qa.fluency.lat
                                               │
                                    Pruebas manuales OK ✅
                                               │
                                    PR: qa → main  (merge manual)
                                               │
                          main  ──── auto-deploy ──▶  fluency.lat (producción)
```

### Regla fundamental

> **El paso de `qa` a `main` es siempre una decisión manual del operador.**
> Nadie hace ese merge automáticamente. El pipeline de producción solo corre
> cuando hay un merge real a `main`.

### Procedimiento para pasar QA → Producción

1. **Probar en QA**: navega a [https://qa.fluency.lat](https://qa.fluency.lat) y valida.
2. **Si todo está OK**, crear y mergear el PR `qa → main`:

```bash
# Con gh CLI (desde el repo local)
gh pr create \
  --repo jcoronado1982/fluency.lat \
  --base main --head qa \
  --title "release: <descripción breve>"
gh pr merge --merge
```

3. El pipeline detecta el merge en `main` y despliega automáticamente a producción.
4. Verificar en [https://fluency.lat/api/health](https://fluency.lat/api/health).

> **Nota:** Si `qa` y `main` apuntan al mismo commit (sin diferencias de código),
> GitHub rechaza el PR. En ese caso se dispara el pipeline directamente:
> ```bash
> az pipelines build queue --definition-id 2 --branch main
> ```
> Esto solo ocurre en situaciones excepcionales (ej.: creación inicial de ramas
> desde el mismo punto, 2026-07-21).

---

## Azure DevOps

| Campo | Valor |
|-------|--------|
| **Organización** | `https://dev.azure.com/safejcoronado1982` |
| **Proyecto** | `theruby` (nombre histórico del proyecto Azure; la app es Fluency) |
| **Pipeline** | `jcoronado1982.fluency` (id **2**) — nombre legado; desde el 7 sep 2026 su repo fuente es `jcoronado1982/fluency.lat` |
| **Pipeline obsoleto** | `jcoronado1982.flashcard` — renombrado |
| **Usuario / correo** | Jesus Coronado — `safe.jcoronado1982@outlook.com` |
| **Conexión GitHub** | `jcoronado1982 (1)` → cuenta GitHub `jcoronado1982` |
| **Variable group** | `Flashcard-Secrets` |
| **SSH service connection** | `SrvPortfolio` → Oracle `157.151.199.170` |

### Disparar deploy manual

```bash
# Producción
az pipelines build queue \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby \
  --definition-name "jcoronado1982.fluency" \
  --branch main

# Pre-prod
az pipelines build queue \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby \
  --definition-name "jcoronado1982.fluency" \
  --branch qa
```

### Verificación

```bash
curl -sf https://fluency.lat/api/health
```

### Limpieza rápida (1 comando)

```bash
./scripts/cleanup-ado-builds.sh --dry-run                              # simular
./scripts/cleanup-ado-builds.sh                                      # conserva último main + qa
./scripts/cleanup-ado-builds.sh --purge-all --clean-agent-logs       # reset total
```

Detalle de flags y retención: [`infrastructure/pipeline-and-deploy.md#limpieza-de-logs-y-artefactos-en-azure-devops`](infrastructure/pipeline-and-deploy.md#limpieza-de-logs-y-artefactos-en-azure-devops).

---

## Artefactos con nombre legado (intencional)

Estos nombres **no** cambiaron para no romper producción:

| Recurso | Nombre actual | Notas |
|---------|---------------|--------|
| Imagen Docker backend (GCR) | `gcr.io/launch-490115/flashcard-backend` | Misma imagen en todos los mirrors |
| Paths Oracle SPA | `flashcard`, `qa_flashcard` | Carpetas bajo `/root/smart-proxy/` en Oracle (archivado como backend real, pero el stage Deploy_Frontend sigue subiendo el SPA ahí) |
| Contenedor backend | `flashcard-backend-node` | Ver `deploy-oracle-backend.sh` |
| Variable group Azure | `Flashcard-Secrets` | Secretos cifrados en DevOps |

Renombrar requiere ventana de mantenimiento coordinada (GCR tag, Caddy volumes, env vars).

---

## Arquitectura modular (código)

- Backend: workspace Rust — `fluency_core`, `api_main`, `mod_flashcards`, `mod_pronoun`
- Frontend: registry en `client/src/modules/index.js`
- Sparse-checkout: `./scripts/sparse-module.sh flashcards|pronoun|admin|full`

Documentación: [`ARQUITECTURA_MODULAR.md`](ARQUITECTURA_MODULAR.md), [`GIT_SPARSE_WORKFLOW.md`](GIT_SPARSE_WORKFLOW.md).

---

## Historial de migración

| Fecha | Cambio |
|-------|--------|
| 2026-06-18 | Ramas `dev-full`, `dev-flashcards`, `dev-pronoun`, `dev-admin` alineadas con sparse |
| 2026-06-18 | Arquitectura modular (workspaces + registry frontend) en `main` y `qa` |
| 2026-06-08 | Pipeline serializado validado (build #165) — ver `pipeline-and-deploy.md` |
