# Git, ramas y sparse-checkout

> **Advertencia de seguridad:** cambiar perfiles no es una operación de solo lectura. La poda
> manual con `rm -rf` está prohibida y fue eliminada del flujo sparse; Git es el único responsable
> de materializar u ocultar archivos versionados. Ningún asistente puede ejecutar
> `sparse-module.sh <perfil>`, `full`,
> `dev-module.sh`, `sparse-cargo-sync.sh` ni wrappers equivalentes sin autorización explícita del
> usuario para el comando concreto. `status` y `list` son las únicas operaciones autónomas
> permitidas. Esta regla prevalece sobre cualquier receta de aislamiento del repositorio.

## Dos conceptos distintos (no mezclar)

| Concepto | Para qué sirve | Ejemplos |
|----------|----------------|----------|
| **Rama Git** | Entorno / línea de release | `main` producción, `qa` pre-producción |
| **Perfil sparse** | Qué archivos existen en disco al desarrollar | `flashcards`, `pronoun`, `admin`, combinaciones |

Las ramas **no** sustituyen al sparse-checkout. En la misma rama `qa` puedes tener solo flashcards en disco o solo pronoun, según el script que ejecutes.

---

## Repositorio y ramas

### Remoto nuevo (http-fluency.lat)

```bash
# Si partes de cero en el repo nuevo:
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/jcoronado1982/fluency.lat.git

git push -u origin main

# Rama pre-producción (QA)
git checkout -b qa
git push -u origin qa
```

### Flujo de publicación (Jun 2026)

**Solo `dev-flashcards` → `qa` → `main`.** Ver [GIT_BRANCHES.md](GIT_BRANCHES.md).

`dev-full` tiene todos los módulos en disco (`sparse full`); **no** es la rama que publica por ahora.

---

## Perfiles sparse (aislamiento en disco)

Fuente de verdad: `scripts/module_registry.sh`

### Comandos

```bash
# Solo lectura: permitidos sin autorización
./scripts/sparse-module.sh list
./scripts/sparse-module.sh status

# Cambian los archivos versionados materializados: requieren autorización explícita y respaldo previo
./scripts/sparse-module.sh flashcards
./scripts/sparse-module.sh pronoun
./scripts/sparse-module.sh admin

# Varios módulos (A + B)
./scripts/sparse-module.sh flashcards pronoun

# Todo el repo
./scripts/sparse-module.sh full

```

Antes de ejecutar cualquier comando mutante autorizado se debe:

1. Inventariar `git status --short --untracked-files=all` y archivos ignorados bajo las rutas objetivo.
2. Crear un respaldo fuera del repositorio y verificarlo mediante hashes.
3. Mostrar al usuario las rutas que Git dejará de materializar.
4. Abortar ante cualquier `rm -rf`, sobrescritura no autorizada o ruta compartida no prevista.

Una tarea de desarrollo normal no concede autorización implícita para cambiar perfiles.

### Gate de seguridad

```bash
./scripts/test-sparse-safety.sh
```

Falla si `sparse-module.sh` o `sparse-cargo-sync.sh` vuelven a contener un `rm` recursivo y
forzado o una función de poda manual. `validate-module.sh` ejecuta este gate antes de compilar.

### Wrappers rápidos

```bash
./scripts/sparse-flashcards.sh
./scripts/sparse-pronoun.sh
./scripts/sparse-admin.sh
./scripts/sparse-full.sh
```

### Qué hay en disco tras cada perfil

| Perfil | Existe en disco | No existe |
|--------|-----------------|-----------|
| `flashcards` | shell + `mod_flashcards` + `modules/flashcards` + `json/` | pronoun, práctica |
| `pronoun` | shell + `mod_pronoun` + `modules/pronounPractice` | flashcards, `json/` |
| `admin` | shell + auth + `AdminPage` | `mod_*`, módulos de estudio |
| `flashcards pronoun` | shell + ambos módulos | resto |
| `full` | repo completo | — |

La IA y el editor solo ven lo que está en disco.

---

## Build por perfil

```bash
# Flashcards
cargo build -p api_main --no-default-features --features auth,flashcards

# Pronoun
cargo build -p api_main --no-default-features --features auth,pronoun_practice

# Admin
cargo build -p api_main --no-default-features --features auth
```

Validar:

```bash
./scripts/validate-module.sh flashcards
./scripts/validate-module.sh pronoun
./scripts/validate-module.sh admin
```

### Flags frontend sugeridos

El script sparse imprime los flags al activar un perfil. Ejemplo admin:

```
VITE_ENABLE_ADMIN=true
VITE_ENABLE_FLASHCARDS=false
VITE_ENABLE_PRONOUN_REFERENCE=false
VITE_ENABLE_PRONOUN_PRACTICE=false
```

---

## Flujo típico de un desarrollador

> Los siguientes ejemplos describen el flujo humano esperado; un asistente no ejecuta los pasos
> que cambian perfiles sin la autorización y el respaldo exigidos al inicio de este documento.

```bash
# Rama + sparse pareados (recomendado)
./scripts/dev-module.sh flashcards

# O manual:
git checkout dev-flashcards
./scripts/sparse-module.sh flashcards

# ... editar, probar ...
./scripts/validate-module.sh flashcards

# Integrar en dev-full antes de QA
git checkout dev-full
git merge dev-flashcards
./scripts/sparse-module.sh full
cargo check --manifest-path backend/Cargo.toml
cd client && npm run build
```

---

## Exportar entrega por módulo

```bash
./scripts/export-module.sh flashcards
./scripts/export-module.sh pronoun
```

Genera `.tar.gz` con shell + módulo para cliente o IA aislada.

---

## Preguntas frecuentes

**¿Creo una rama `flashcards` en Git?**  
Usa **`dev-flashcards`**. El cambio al perfil `flashcards` solo se ejecuta después de cumplir la
preverificación y, para asistentes, recibir autorización explícita.

**¿El sparse se sube al remoto?**  
No. Es configuración local de tu working copy. Cada clon ejecuta el script que necesite.

**¿Puedo tener A y B sin C?**  
Sí, mediante un perfil combinado; su activación sigue siendo una operación mutante que requiere
respaldo y autorización explícita cuando la realiza un asistente.

**¿Dónde está documentada la arquitectura modular?**  
[ARQUITECTURA_MODULAR.md](ARQUITECTURA_MODULAR.md)
