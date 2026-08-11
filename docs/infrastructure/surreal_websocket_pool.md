# 🔌 Pool Adaptativo de Conexiones WebSocket a SurrealDB

## 📋 Resumen de Configuración

Para garantizar alta eficiencia de memoria y prevenir embotellamientos durante picos de concurrencia en la base de datos, el backend de Fluency implementa un **Pool Adaptativo bajo demanda** en la clase `SurrealConnection` (`backend/api_main/src/infrastructure/storage/surreal/connection.rs`).

---

## ⚙️ Reglas de Comportamiento e Infraestructura

1. **Reposo (Baseline MIN = 1)**:
   - En estado normal o sin tráfico de usuarios, la aplicación mantiene **1 sola conexión WebSocket** abierta con SurrealDB.
   - Consumo de RAM en reposo: **< 0.1 MB**.

2. **Escalado Bajo Demanda (MAX = 10)**:
   - Ante ráfagas masivas de escrituras o lecturas concurrentes (p. ej. pruebas de carga o múltiples usuarios guardando tarjetas al mismo tiempo), el pool escala automáticamente abriendo hasta **un máximo de 10 conexiones WebSocket paralelas**.
   - Evita el bloqueo de cola (*Head-of-Line Blocking*) en el socket TCP.

3. **Depuración Automática Inactiva (Idle Pruning = 60s)**:
   - El watchdog en segundo plano monitorea las conexiones secundarias.
   - Si una conexión creada bajo demanda permanece inactiva por más de **60 segundos**, se destruye automáticamente, retornando el sistema al mínimo base (1 conexión).

---

## 📌 Variables de Entorno Persistentes (`.env`)

Estas variables están configuradas en `backend/.env` y persisten ante cualquier reinicio del servidor o contenedor:

```env
# --- POOL ADAPTATIVO WEBSOCKET SURREALDB (Min 1, Max 10, Idle 60s) ---
SURREAL_POOL_MIN=1
SURREAL_POOL_MAX=10
SURREAL_POOL_IDLE_SEC=60
```
