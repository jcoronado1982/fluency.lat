# Flujo de Despliegue: De QA a Producción

> Canónico del pipeline: [`infrastructure/pipeline-and-deploy.md`](infrastructure/pipeline-and-deploy.md).
> Este documento solo cubre el procedimiento de promoción `qa` → `main` (PR, merge, verificación).
> Última revisión: 2026-07-21.

Este documento detalla el procedimiento estándar y seguro para promover cambios que ya han sido probados y validados en el entorno de **QA** (`https://qa.fluency.lat`) hacia el entorno de **Producción** (`https://fluency.lat`).

---

## 🔄 Resumen del Flujo de Trabajo (Git Branching)

El repositorio utiliza un modelo de ramas protegido para evitar caídas en producción:

```mermaid
graph LR
    DevF[dev-flashcards] -->|merge| QA_Branch[qa]
    QA_Branch -->|Deploy Automático| QA_Env[qa.fluency.lat]
    QA_Env -->|Pruebas OK ✅| PR[PR qa → main]
    PR -->|Merge MANUAL| Main_Branch[main]
    Main_Branch -->|Deploy Automático| Prod_Env[fluency.lat]
```

> ⚠️ **El paso de `qa` a `main` es siempre una decisión manual.**
> El pipeline de producción solo corre cuando hay un merge real a `main`.
> Nadie lo hace automáticamente.

---

## 📋 Procedimiento Paso a Paso

### Paso 1: Validación en QA
Antes de mover cualquier código a producción, asegúrate de que el comportamiento en el entorno de QA sea el esperado:
1. Navega a [https://qa.fluency.lat](https://qa.fluency.lat).
2. Realiza pruebas funcionales de la nueva característica o corrección.
3. Verifica que las llamadas a la API y el almacenamiento en la base de datos (`qa_flashcard` en SurrealDB) funcionen correctamente.

---

### Paso 2: Crear una Pull Request (PR) en Azure DevOps
Para pasar el código de la rama `qa` a la rama `main`, utiliza la plataforma de Azure DevOps para mantener un historial limpio y realizar revisiones.

1. Entra a tu proyecto en **Azure DevOps**.
2. Ve a la sección **Repos** > **Pull Requests**.
3. Haz clic en **New Pull Request** (Nueva Pull Request).
4. Configura las ramas de la siguiente manera:
   * **Source branch (Rama Origen):** `qa`
   * **Target branch (Rama Destino):** `main`
5. Escribe un título descriptivo (ej. `feat: agregar sistema de traducción probado en QA`).
6. Revisa la pestaña **Files** (Archivos) para dar una última inspección visual a los cambios de código.
7. Haz clic en **Create** (Crear).

---

### Paso 3: Completar el Merge
Una vez que estés seguro de los cambios:
1. Dentro de la Pull Request en Azure DevOps, haz clic en **Approve** (Aprobar).
2. Haz clic en el botón **Complete** (Completar).
3. Selecciona la opción de merge recomendada (por ejemplo, **Merge (no fast-forward)** o **Squash commit** para mantener la historia de commits limpia).
4. Haz clic en **Complete merge**.

---

### Paso 4: Despliegue Automático y Monitoreo (CI/CD)
Al completarse el Merge en la rama `main`, el Azure Pipeline iniciará un despliegue de forma totalmente automática.

1. El pipeline detectará que el cambio ocurrió en `main`.
2. **Despliegue Multi-Nube:** A diferencia de QA, el pipeline desplegará de forma paralela en:
   * **Servidor Principal** (GCP desde el 4 ago 2026, antes Oracle — ver `tools/oracle-legacy/`), puerto `8080`.
   * **AWS Mirror** (Servidor espejo).
   * **OCI-1 Mirror** (Servidor espejo).
3. Monitorea la ejecución en **Pipelines** > **Runs** dentro de Azure DevOps para cerciorarte de que todas las etapas finalicen con éxito (`succeeded`).

---

### Paso 5: Verificación en Producción
Una vez que el pipeline termine con éxito:
1. Entra a [https://fluency.lat](https://fluency.lat).
2. Comprueba que los cambios estén aplicados correctamente en vivo.

---

## ⚠️ Consideraciones de Seguridad y Buenas Prácticas

> [!IMPORTANT]
> **No hagas Push directo a la rama `main`**
> La rama `main` representa lo que está viendo el usuario final. Al usar Pull Requests desde `qa`, reduces a cero la posibilidad de romper producción por un error tipográfico o de configuración.

> [!NOTE]
> **Aislamiento de Base de Datos**
> Recuerda que la base de datos de producción (`flashcard`) es independiente de la de QA (`qa_flashcard`). Si tus cambios requerían de alguna migración de datos o inserción inicial manual, asegúrate de tenerla lista en producción antes de completar el merge.

---

## ❓ Preguntas Frecuentes y Detalles de Infraestructura

### 1. ¿Cada ambiente tiene su propia base de datos?
**Sí, de forma 100% aislada.** Aunque físicamente corren bajo el mismo motor SurrealDB en el servidor real (GCP), se utiliza separación lógica por **Namespaces**:
* **Producción (`main`):** Usa el namespace `flashcard`.
* **QA (`qa`):** Usa el namespace `qa_flashcard`.

Cualquier cambio, prueba de carga o eliminación de datos en QA **no afectará** en absoluto a tus usuarios en producción.

### 2. ¿Se reinicia Caddy durante el despliegue? ¿Se cae producción?
**No hay caída de servicio (Zero-Downtime).**
Caddy gestiona las recargas de la siguiente manera:
* **Recarga en Caliente (Hot Reload):** Caddy está configurado para que al detectar cambios en el `Caddyfile`, aplique la nueva configuración instantáneamente sin cerrar el servidor ni cortar las conexiones activas de producción.
* **Optimización en el Pipeline:** El pipeline solo toca Caddy si detecta cambios específicos en los archivos de configuración de infraestructura, protegiendo así el entorno de producción de reinicios innecesarios.

