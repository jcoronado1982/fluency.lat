# Reporte de Incidente: Bloqueo de IA y Migración Gemini 3.1
**Fecha:** 9 de mayo de 2026  
**Estado:** Resuelto ✅

## 🚨 Descripción del Problema
El sistema de Tutor IA dejó de responder, devolviendo errores `403 Forbidden` y `404 Not Found`. Tras una investigación profunda, se detectaron dos causas raíz:
1. **API Key Filtrada (Leaked):** Google desactivó automáticamente la llave `AIzaSyCN...` tras detectar que fue expuesta públicamente (error 403).
2. **Modelos Obsoletos:** Se intentó usar la serie `Gemini 1.5`, la cual ha sido retirada en favor de la serie `3.1` (error 404).

## 🛠️ Solución Implementada

### 1. Actualización de API Key
* Se generó una **nueva llave** (`AIzaSyDD...`) y se actualizó en el archivo `.env`.
* **Mejora de Seguridad:** Se modificó `backend/src/config.rs` para que el cargador de configuraciones **sobrescriba obligatoriamente** cualquier variable de entorno global con los valores del archivo `.env`. Esto evita que llaves viejas "atrapadas" en la terminal bloqueen el sistema.

### 2. Migración a Gemini 3.1
* Se actualizó globalmente el modelo a **`gemini-3.1-flash-lite`**.
* Se simplificó el payload de la API (Universal Prompter) para máxima compatibilidad con la versión `v1beta` de Google Generative AI.

### 3. Blindaje de Arranque
* Se añadió un comando `unset GEMINI_API_KEY` en el script `start.sh` para limpiar la sesión antes de cada ejecución.

## 🔒 Medidas de Seguridad Preventivas
* Se verificó que `backend/.env` está incluido en el `.gitignore` de la raíz del proyecto.
* Se recomienda **no pegar la API Key directamente en el chat** si este se guarda en repositorios públicos.

## 🏁 Estado Final
* **Tutor IA:** Operativo con Gemini 3.1 Flash-Lite.
* **Base de Datos:** SurrealDB v1.5.5 (RocksDB) conectada y persistente.
* **RAM:** Estabilizada bajo los 1GB del servidor.
