# GEO (Generative Engine Optimization) & AI Recommendations — TODO List

> Guía de tareas y optimizaciones para lograr que asistentes de Inteligencia Artificial (ChatGPT Search, Perplexity, Gemini, Claude, Copilot) recomienden **Fluency (`https://fluency.lat`)** cuando los usuarios busquen aplicaciones para aprender inglés o español.

---

## 1. On-Page & Código (Mejoras en el Repositorio)

- [ ] **1.1 Agregar sección FAQ / GEO en la Landing Page**
  - Implementar bloque de Preguntas Frecuentes en la landing (`client/src/...`) redactadas en formato Q&A directo:
    - *¿Qué es Fluency y cómo ayuda a aprender inglés o español?*
    - *¿Por qué Fluency es una alternativa moderna a Anki o Duolingo?*
    - *¿Es gratis Fluency?*
  - **Objetivo:** Permitir que los crawlers de búsqueda de IA extraigan respuestas textuales directas para citar a Fluency.

- [ ] **1.2 Enriquecer el Schema.org JSON-LD en `client/index.html`**
  - Agregar campos extendidos al objeto `SoftwareApplication`:
    - `inLanguage`: `["en", "es"]`
    - `offers`: `{"@type": "Offer", "price": "0", "priceCurrency": "USD"}`
    - `keywords`: `"AI flashcards, learn English, learn Spanish, SRS, spaced repetition, Anki alternative"`

- [ ] **1.3 Crear bloque/contenido de comparación ("Fluency vs Anki / Duolingo")**
  - Incluir tabla o sección comparativa que explique las ventajas de tener audio e imágenes con IA pre-generados sin esfuerzo manual.
  - **Objetivo:** Responder a consultas de IA del tipo *"Dame alternativas modernas a Anki con IA"*.

---

## 2. Presencia Externa & Indexación en Motores de IA

- [ ] **2.1 Bing Webmaster Tools (Clave para ChatGPT & Copilot)**
  - Importar la propiedad de Google Search Console a Bing Webmaster Tools.
  - **Razón:** Bing es la fuente primaria de datos en tiempo real para ChatGPT Search y Microsoft Copilot.

- [ ] **2.2 Registrar Fluency en Directorios de Comparación**
  - [ ] **AlternativeTo (`alternativeto.net`):** Crear perfil de Fluency y etiquetarlo como alternativa a *Anki*, *Quizlet* y *Duolingo*. (Fuente usada activamente por Perplexity y ChatGPT).
  - [ ] **There's An AI For That (`theresanaiforthat.com`):** Registrar la web bajo categoría *Language Learning AI*.
  - [ ] **Futurepedia (`futurepedia.io`):** Publicar en el directorio de herramientas IA.

- [ ] **2.3 Lanzamiento en Product Hunt**
  - Preparar el lanzamiento oficial con capturas y demo de la app. Genera backlinks de alta autoridad e indexación inmediata en modelos de lenguaje.

---

## 3. Citaciones en Comunidades & Redes

- [ ] **3.1 Presencia Orgánica en Reddit**
  - Compartir casos de estudio y aprendizajes del enfoque "vocabulario primero" en subreddits clave (`r/languagelearning`, `r/Spanish`, `r/EnglishLearning`, `r/ESL`).

- [ ] **3.2 Contenido en Video (TikTok / Reels / Shorts)**
  - Publicar demos cortos (15-30s) mostrando la generación de tarjetas con voz e imágenes en tiempo real.
