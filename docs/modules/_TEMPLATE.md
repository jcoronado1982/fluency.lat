# Módulo `<id>` — <nombre humano>

> Plantilla de doc de módulo. Copiar, rellenar TODAS las secciones (escribir "—" si no aplica)
> y mantener actualizada en el mismo cambio que modifique el módulo.
> Paso previo: [`GEMINI.md`](../../GEMINI.md) → protocolo de lectura.

## Propósito

2–3 líneas: qué problema de negocio resuelve el módulo y para quién.

## Estado y roadmap

- Estado: activo | beta | pausado.
- Pendientes conocidos / próximos pasos.

## Mapa de archivos

La guía directa al código — mantenerla exacta.

| Capa | Ruta | Qué contiene |
|---|---|---|
| Backend crate | `backend/mod_<x>/` | casos de uso |
| Backend rutas | `backend/api_main/src/modules/<x>.rs` | registro de endpoints |
| Backend handlers | `backend/api_main/src/api/endpoints/<x>.rs` | handlers HTTP |
| Frontend | `client/src/modules/<x>/` | manifiesto + UI |

## Contratos / endpoints

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|

## Flags y activación

- Cargo feature: `<feature>` (o — si es solo frontend).
- Flags Vite: `VITE_ENABLE_<X>`.
- Perfil sparse: `./scripts/sparse-module.sh <x>`.

## Dependencias con otros módulos

Lista explícita. Solo lo declarado aquí autoriza a leer la doc de otro módulo.

## Datos

Colecciones SurrealDB que toca (enlace a [`database_schema_diagram.md`](../../database_schema_diagram.md)).

## Cómo probar

Comandos de arranque, perfil sparse, URL local y tests relevantes.
