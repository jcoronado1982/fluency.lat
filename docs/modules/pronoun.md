# Módulo `pronoun` — Práctica Interactiva de Pronombres e Historias

> Módulo de aprendizaje y práctica interactiva de pronombres, historias y episodios.

## Propósito

Permite a los estudiantes practicar el uso de pronombres a través de historias interactivas y episodios con seguimiento de progreso detallado.

## Estado y roadmap

- Estado: activo.
- Funcionalidades: lecciones por episodios, pantallas interactivas de práctica y seguimiento de historia/progreso.

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Backend crate | `backend/mod_pronoun/` | Casos de uso de práctica de pronombres |
| Backend rutas | `backend/api_main/src/modules/pronoun_practice.rs` | Registro de endpoints HTTP |
| Backend handlers | `backend/api_main/src/api/endpoints/pronoun_practice.rs` | Handlers de episodios, historias y progreso |
| Frontend | `client/src/modules/pronoun/` | UI de episodios e interacción de historias |

## Contratos / endpoints

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| GET | `/api/progress` | JWT | Obtiene el progreso general de práctica de pronombres |
| POST | `/api/progress/update` | JWT | Actualiza el progreso del estudiante tras completar ejercicios |
| DELETE | `/api/progress/reset` | JWT | Reinicia el progreso de práctica de pronombres |
| GET | `/api/episodes/:episode_id/screens` | JWT | Obtiene las pantallas interactivas de un episodio |
| GET | `/api/episodes/:episode_id/next` | JWT | Obtiene el siguiente episodio recomendado |
| GET | `/api/stories/:story_id/full-history` | JWT | Obtiene el historial completo de una historia |

## Flags y activación

- Cargo feature: `mod_pronoun`.
- Flags Vite: `VITE_ENABLE_PRONOUN`.
- Perfil sparse: `./scripts/sparse-module.sh pronoun`.

## Dependencias con otros módulos

- `shell-auth`: autenticación por JWT.
- `flashcards`: tarjetas de soporte léxico opcionales.

## Datos

- Colecciones SurrealDB: `user_progress`, `episodes`, `stories`.

## Cómo probar

- Backend: `cargo check -p api_main`.
- Frontend: `npm run dev`.
- Verificación: `./scripts/verify-blueprints.sh`.
