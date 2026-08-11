# 🏛️ Skill: Arquitectura de Software (Clean & SOLID)

Este documento define la filosofía de diseño y los patrones arquitectónicos del proyecto Flashcard. Es de **lectura obligatoria** para mantener la cohesión del código.

---

## 1. 🏗️ Stack Tecnológico
- **Frontend:** React + Vite + Bun (Elegido por velocidad de build y ejecución).
- **Backend:** Rust (Axum) - Migrado de Python para garantizar seguridad de memoria y alto rendimiento.
- **Base de Datos:** SurrealDB 3.2.3 (GCP, `fluency-db-surreal` — VPC privada; antes Oracle Cloud
  `server-oci-1`, ver `tools/oracle-legacy/`). Postgres solo existe en docker-compose local, sin
  uso en producción. Los pagos SÍ están activos (LemonSqueezy + SurrealDB, ver `docs/modules/pricing.md`).
- **IA:** Integración nativa con Gemini 3.1 y Flux 2 para generación de contenido.

---

## 2. 🧩 Arquitectura del Frontend (Clean Architecture)
El frontend sigue principios de **Clean Architecture** y **SOLID**:

### Patrón Repository
- Los componentes NO llaman directamente a la API.
- Usan un `Repository` que abstrae la fuente de datos. Esto permite cambiar de local a producción sin tocar un solo componente.

### SOLID en Acción
- **S (Single Responsibility):** Los componentes de UI (ej: `CardFront`) solo se encargan de renderizar. La lógica de negocio vive en Hooks y Contextos.
- **O (Open/Closed):** El sistema de categorías está diseñado para extenderse con nuevos tipos de flashcards sin modificar el motor principal.
- **D (Dependency Inversion):** Los componentes dependen de interfaces (Contextos), no de implementaciones concretas.

---

## 3. 🦀 Arquitectura del Backend (Axum)
- **Modularidad:** El backend está dividido en servicios (Audio, Imágenes, DB) con responsabilidades claras.
- **Fuzzy Caching:** Implementa un sistema de matching de assets en GCS para evitar costos innecesarios de regeneración de IA.

---

## 4. 🛡️ El Sistema Sentinel (Rationale)
El Sentinel no es solo un monitor, es un **Mecanismo de Supervivencia**:

- **Problema:** La base de datos en su VM dedicada (hoy GCP, antes Oracle) puede sufrir picos de consumo de RAM que la bloquean por completo.
- **Solución:** Un proceso en Rust monitorea la RAM cada segundo.
- **Acción:** Si la RAM libre cae por debajo de un umbral crítico, el Sentinel notifica al Proxy (Caddy) para que bloquee el tráfico a las apps no esenciales, protegiendo la integridad del sistema principal.

---

## 🔐 Convenciones de IA
Cualquier cambio de código debe:
1. Mantener la **separación de intereses**.
2. No introducir **secretos** en el código (usar el sistema de variables de entorno documentado).
3. Respetar los **contratos** entre Frontend y Backend definidos en el Repository.
