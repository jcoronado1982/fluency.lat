# Plan de SEO off-page y distribución — Fluency

> Complementa el SEO on-page ya implementado en `client/index.html`,
> `client/public/robots.txt` y `client/public/sitemap.xml`. Este documento
> es el plan de distribución/backlinks/redes; no requiere cambios de código.

## Audiencia objetivo

Dos segmentos, no uno:

- **Estadounidenses que quieren aprender español.**
- **Latinos (LatAm y diáspora en EE.UU.) que quieren aprender inglés.**

El copy y los canales de distribución deben cubrir ambos, no asumir un solo idioma dominante.

## 1. Base técnica (hacer primero, apalancamiento inmediato)

- **Google Search Console**: verificar `fluency.lat` (meta tag o registro DNS) y enviar `sitemap.xml` (ya existe en `client/public/sitemap.xml`). Sin esto, la indexación puede tardar semanas aunque el on-page esté perfecto.
- **Bing Webmaster Tools**: importar directo desde Search Console — cubre Bing/DuckDuckGo/Yahoo con poco esfuerzo extra.
- **Analítica** (GA4, o Plausible/Umami si se prefiere privacidad) con UTMs en cada link compartido (`?utm_source=instagram&utm_medium=social`) para saber qué canal realmente trae usuarios.

## 2. Backlinks de nicho (edtech / idiomas)

- **Directorios de producto**: Product Hunt (lanzamiento formal — funciona muy bien con una demo interactiva como la de Fluency), SaaSHub, AlternativeTo (posicionarse como alternativa a Anki/Duolingo/Quizlet, mucho tráfico de búsqueda comparativa), There's An AI For That / Futurepedia (por el componente de imágenes con IA).
- **Comparadores de idiomas**: blogs de profesores de ELE (español lengua extranjera) y ESL — buscar reseña o intercambio de link.
- **Foros de developers/indie**: Indie Hackers, Hacker News (Show HN si el ángulo técnico —IA generando flashcards— es fuerte), comunidades de devs LatAm (Rock N Code, Discords locales).

## 3. Comunidades de nicho (orgánico, no self-promo directo)

- **Reddit**: r/languagelearning, r/Spanish, r/EnglishLearning, r/ESL, r/duolingo. Regla: aportar valor primero (responder preguntas, compartir el enfoque "vocabulario primero"), mencionar Fluency solo cuando sea relevante — el self-promo directo se banea rápido.
- **Facebook groups**: profesores/estudiantes de inglés en LatAm (muy activos en México, Colombia, Argentina) y grupos de intercambio de idiomas en EE.UU. para angloparlantes aprendiendo español.
- **Discord**: servers de "language exchange" y de aprendizaje bidireccional inglés↔español — muchos tienen canal de "recursos".

## 4. Redes sociales orgánicas

Canal con mejor ROI orgánico en edtech de idiomas: **TikTok / Instagram Reels**.

- Formato: clips 15-30s con el demo interactivo (imagen IA generándose en vivo + audio nativo), "palabra del día" en ambas direcciones (inglés para latinos, español para americanos), antes/después de una frase difícil. El demo público de la landing (`DemoFlashcardSession`) ya es contenido listo para grabar.
- **X**: hilos sobre el método "vocabulario primero" (base ya escrita en `WhySection`/`VocabularyFirstSection`), útil para comunidad indie/maker y build-in-public.
- **YouTube Shorts**: republicar el mismo contenido de TikTok — costo incremental casi nulo.
- Cadencia realista: 3-4 posts/semana en 1-2 plataformas rinde más que presencia débil en cuatro. Prioridad sugerida: TikTok/Reels (mismo video sirve para ambos) + X.
- Importante: crear contenido en **ambos idiomas** alternando o en el mismo clip (ej. subtítulos bilingües), para no favorecer solo a una de las dos audiencias.

## 5. Colaboraciones

- Micro-influencers de profesores de inglés/español (5k-50k seguidores): trueque de acceso Premium gratis por mención/reseña, costo marginal cero.
- Guest posts o menciones en blogs de aprendizaje de idiomas a cambio de backlink dofollow.

## 6. Orden de prioridad sugerido (impacto/esfuerzo)

1. ~~Search Console + sitemap~~ — **hecho** (verificado e indexado por el usuario).
2. Lanzamiento en Product Hunt (evento único, alto backlink + tráfico inicial).
3. 2-3 posts semanales en TikTok/Reels con clips del demo existente, en ambos idiomas.
4. Presencia orgánica en 2-3 comunidades Reddit/Facebook relevantes para cada audiencia.

## Pendiente / decisiones del usuario

- Bing Webmaster Tools (importar desde Search Console) todavía pendiente, si se quiere cubrir Bing/DuckDuckGo.
- Publicar en Instagram/X/TikTok requiere cuentas y sesión del usuario; el asistente puede redactar copy pero no crear cuentas ni publicar sin confirmación explícita por publicación.
- `og:image`/`twitter:image` usa `logo.avif` como placeholder — falta un asset dedicado de preview social (1200×630 px, JPG/PNG).
