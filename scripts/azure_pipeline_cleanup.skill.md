# Skill portable: limpiar el historial de Azure Pipelines

> Procedimiento neutral en Markdown para cualquier IA o persona con acceso a una terminal. No
> requiere Codex, Claude, Gemini, MCP, plugins ni una aplicación concreta. Usar cuando se pida
> limpiar Azure Pipelines, borrar runs antiguos, eliminar artefactos o logs, hacer mantenimiento o
> dejar un pipeline como nuevo.

## Requisitos portables

- Bash.
- Azure CLI con la extensión `azure-devops`.
- Un PAT con permisos para consultar y borrar builds, suministrado mediante
  `AZURE_DEVOPS_EXT_PAT` o el mecanismo secreto del entorno.
- El script `scripts/cleanup-ado-builds.sh` de este repositorio.

No depender de una integración propia de un proveedor de IA. Ejecutar y verificar todo mediante el
script y Azure CLI.

## Fuente de verdad y seguridad

- Trabajar desde la raíz del repositorio Fluency.
- Leer primero `docs/infrastructure/pipeline-and-deploy.md`, sección **Limpieza de logs y
  artefactos en Azure DevOps**.
- Ejecutar solamente `scripts/cleanup-ado-builds.sh`; no duplicar su lógica con comandos ad hoc.
- No mostrar, copiar como literal en comandos ni registrar el PAT. Preferir
  `AZURE_DEVOPS_EXT_PAT`; en Fluency el script también puede cargarlo internamente desde
  `SECRETS_MAP.md`.
- El borrado exige autorización explícita del usuario en el turno actual. Sin ella, limitarse a
  simular y reportar.
- No cancelar runs activos o en cola. El script protege `inProgress`, `notStarted` y `postponing`.

## Elegir el alcance

| Solicitud | Acción |
|---|---|
| Auditar o revisar qué sobra | Solo `--dry-run` |
| Limpiar historial viejo | Conservar el último run exitoso de `main` y `qa` |
| Dejar el pipeline como nuevo | Borrar todos los runs terminados y limpiar LocalBuild |

El script acepta `ADO_ORG`, `ADO_PROJECT` y `ADO_PIPELINE_ID` para operar sobre otro pipeline sin
modificar su código. Si no se definen, usa los valores predeterminados documentados para Fluency.

## Simular siempre antes de borrar

Mantenimiento normal:

```bash
./scripts/cleanup-ado-builds.sh --dry-run
```

Reinicio total:

```bash
./scripts/cleanup-ado-builds.sh --purge-all --clean-agent-logs --dry-run
```

Informar cuántos runs terminados y retention leases se eliminarían. Si el alcance del usuario no
coincide con la simulación, detenerse antes de mutar Azure.

## Ejecutar la limpieza autorizada

Mantenimiento normal:

```bash
./scripts/cleanup-ado-builds.sh
```

Reinicio total:

```bash
./scripts/cleanup-ado-builds.sh --purge-all --clean-agent-logs
```

El borrado de un run elimina también sus logs y artefactos asociados en Azure. La opción
`--clean-agent-logs` vacía `_diag/*.log` y `_work/` del agente LocalBuild.

Azure puede reflejar los borrados gradualmente o completar un lote parcial. Consultar el estado
después de cada pasada y repetir exactamente el mismo comando mientras queden runs terminados. El
script procesa hasta 200 runs por pasada.

## Verificar antes de declarar éxito

Autenticar sin imprimir el PAT y comprobar por Azure CLI/API:

1. La definición del pipeline sigue existiendo.
2. En reinicio total quedan `0` runs terminados; reportar por separado cualquier run activo y no
   tocarlo.
3. Quedan `0` retention leases asociados a los runs borrados.
4. Si se limpió LocalBuild, quedan `0` archivos `*.log` en `_diag` y `0` entradas en `_work`.
5. Si hubo que corregir el script o la documentación, ejecutar `bash -n
   scripts/cleanup-ado-builds.sh`, `git diff --check` y `./scripts/verify-blueprints.sh`.

No asumir que Azure quedó limpio solo porque el comando terminó: verificar los conteos. Si falla
la autenticación, corregir la lectura local del PAT sin revelar el valor y repetir primero el dry-run.

## Cierre

Reportar los conteos finales de runs, leases y logs locales; confirmar que la definición fue
preservada; y decir si quedó alguna ejecución activa.

Advertir que el audit log administrativo tiene retención controlada por Microsoft y que el contador
interno del número de build puede continuar aunque el historial visible quede vacío. No iniciar un
despliegue nuevo salvo solicitud explícita.
