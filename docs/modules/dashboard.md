# Módulo `dashboard` — Shell de app autenticada + home

## Propósito

Doble rol: (1) **home post-login** en `/dashboard` (hub con tarjetas de acceso a módulos, stats,
recomendaciones) y (2) **appShell de toda la app autenticada** — aporta `DashboardShell` (sidebar,
header, footer, menú flotante) dentro del cual se renderizan los demás módulos.

## Estado y roadmap

- Estado: **activo** (opt-out; default on).
- Si el módulo no está en disco o está desactivado, la app cae a `MinimalAppShell` y el home
  post-login pasa al módulo default — nada debe romperse.

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Manifiesto | `client/src/modules/dashboard/index.jsx` | ruta `/dashboard`, nav "Panel", `appShell: DashboardShell` |
| Shell de app | `client/src/modules/dashboard/DashboardShell.jsx` | layout con `<Outlet/>` (árbol estable, sin remount) |
| Home | `client/src/modules/dashboard/DashboardHome.jsx` + `.css` | hub post-login |
| Layout | `client/src/modules/dashboard/layout/` | Sidebar, Header, Footer, FloatingMenu (sidebar 256px + offset 260px deliberado) |
| Datos | `client/src/modules/dashboard/ports/`, `adapters/`, `useCases/` (`dashboardProgress.js`), `features/` | stats y recomendaciones |
| Routing shell | `client/src/App.jsx`, `client/src/components/routing/SafeRedirect.jsx`, `client/src/components/shell/` | rutas bare vs app, fallbacks |

## Contratos / endpoints

Sin endpoints propios. Consume stats de flashcards (`/api/learning-stats`) y sesión del shell
vía puertos (`ports/` del módulo) — nunca importando internals de otros módulos.

## Flags y activación

- Cargo feature: — (solo frontend).
- Vite: `VITE_ENABLE_DASHBOARD` (**opt-out**, default on) → `/dashboard` tras login (`getAuthenticatedHomePath()`).
- Sparse: `./scripts/sparse-module.sh dashboard`.

## Dependencias con otros módulos

- **shell-auth** ([`shell-auth.md`](shell-auth.md)): sesión y layout base.
- Contrato `client/src/contracts/courseDirection.js` compartido con flashcards (el import directo dashboard→flashcards se eliminó en jul 2026 — no reintroducirlo).

## Datos

Ninguna colección propia; lee progreso/stats vía API de flashcards.

En móvil, las recomendaciones conservan su carrusel horizontal pero adoptan la composición
cinematográfica de la sesión PWA: miniatura a sangre completa, degradado de contraste, categoría
y nivel en cápsulas de cristal y nombre del deck superpuesto. La meta actual, progreso, nivel y
ruta comparten ese acabado con cristal oscuro y acentos rosa/naranja. El escritorio conserva su grilla.
La PWA instalada ya NO monta navegación propia desde este módulo: la barra inferior vive en el
shell (`components/pwa/PwaShellNavigation.jsx`, montada una vez en `App.jsx`) y es una píldora
flotante de cristal translúcido estilo WhatsApp iOS (referencia `menu.jpg` en la raíz) con
pestañas constantes (Inicio, Estudiar, Categorías, Idioma) y estado activo por ruta. En la ruta
del dashboard PWA móvil esa barra reemplaza visualmente al footer compartido, que permanece
oculto, y el contenido scrollea por detrás del cristal. En standalone el carrusel del curso
(`CourseSessionCard`) se navega con swipe horizontal táctil y sus flechas quedan ocultas por CSS
(los puntos indicadores permanecen).

La cabecera del dashboard instalado sigue el patrón nativo de título grande: `PwaGreeting`
(en `layout/Header.jsx`, oculto fuera de standalone) muestra "Hola, {nombre}" + fecha a la
izquierda y el avatar como cápsula de cristal a la derecha; el logo/hamburguesa/nombre de marca se
ocultan. El header es fijo y arranca transparente; con animaciones scroll-driven
(`animation-timeline: scroll(root)`, keyframes `pwa-header-scroll-edge`/`pwa-greeting-condense` en
`layout/Layout.css`) gana cristal, condensa el título y desvanece la fecha al scrollear; sin
soporte, conserva el cristal constante como fallback.
Las tarjetas del dashboard instalado comparten `--pwa-card-radius` y `--pwa-border`, definidos en
`styles/app-brand.css`, para mantener idénticos radio y grosor de línea entre meta, progreso, nivel,
ruta y recomendaciones. El anillo usa texto primario claro con cuerpo móvil reforzado; el CTA y los
halos fotográficos reducen su saturación para que la jerarquía dependa del contenido y no de varios
acentos compitiendo. Hasta 768 px, la grilla superior PWA fluye en una columna y su bloque de
estadísticas usa `auto-fit`, evitando que el anillo se superponga con la meta en tablet u horizontal.
Su header usa el isotipo blanco centrado y conserva a la derecha el avatar del perfil como disparador
del menú de cuenta; hamburguesa, nombre de marca y botón de tres puntos se ocultan solo en esa vista.
La franja superior y el panel de cuenta emplean cristal más transparente que la cabecera de Flashcards,
con desenfoque de fondo para sostener el contraste del contenido.

## Cómo probar

```bash
./scripts/sparse-module.sh dashboard
cd client && npm run dev
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # login dev
# UI: http://localhost:5173/dashboard
npm run test:routing    # login → /dashboard y fallbacks sin dashboard
```
