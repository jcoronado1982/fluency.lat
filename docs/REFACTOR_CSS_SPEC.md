Actúa como arquitecto senior de software y especialista en React y CSS moderno.

Debes refactorizar el código que te proporcionaré sin cambiar su comportamiento funcional, su apariencia visual actual ni sus contratos públicos.

## Contexto del proyecto

El proyecto ya funciona correctamente y utiliza una arquitectura profesional basada en:

* Arquitectura hexagonal.
* Clean Architecture.
* Diseño modular.
* Principios SOLID.
* Separación de responsabilidades.
* Componentes React.
* CSS Vanilla escrito manualmente.
* CSS Modules para encapsular los estilos.

La refactorización debe respetar completamente esta arquitectura. No debes introducir dependencias innecesarias, frameworks CSS, librerías visuales ni patrones que contradigan la estructura actual.

## Objetivo principal

Reorganizar y limpiar la estructura visual para que cada región de la interfaz sea fácil de entender, mover, redimensionar, reordenar y mantener desde una única fuente de verdad.

El resultado debe permitir que un desarrollador pueda modificar una caja, espacio, tamaño o posición sin provocar efectos laterales inesperados en otras partes de la interfaz.

La refactorización no debe ser un rediseño.

## Regla fundamental

Todo funciona actualmente.

No elimines ni cambies funcionalidades.

No alteres:

* La lógica de negocio.
* El flujo de datos.
* Los estados.
* Los contextos.
* Los hooks.
* Las peticiones.
* Los permisos.
* La navegación.
* Los eventos.
* Los contratos entre componentes.
* Las propiedades públicas.
* Los identificadores utilizados por pruebas, tutoriales o integraciones.
* La apariencia visual validada.
* El comportamiento responsive existente.
* La accesibilidad existente, salvo para mejorarla sin alterar el funcionamiento.

Antes de cambiar algo, debes identificar para qué existe. No asumas que una regla es innecesaria solo porque parece repetida.

## Estrategia de layout obligatoria

Utiliza las herramientas CSS según su responsabilidad.

### CSS Grid

Utiliza CSS Grid como herramienta principal para estructuras bidimensionales:

* Regiones principales.
* Filas y columnas.
* Distribución del espacio.
* Posición entre regiones.
* Relaciones entre elementos.
* Reordenamiento responsive.
* Áreas visuales claramente identificables.

Cuando sea apropiado, utiliza:

* `grid-template-areas`.
* `grid-template-columns`.
* `grid-template-rows`.
* `minmax()`.
* Unidades `fr`.
* `gap`.
* `repeat()`.
* `auto-fit`.
* `auto-fill`.

Las áreas nombradas deben representar responsabilidades visuales, no detalles accidentales de implementación.

Cada región principal debe tener una ubicación clara dentro del Grid.

### Flexbox

Utiliza Flexbox dentro de las regiones o cajas cuando los elementos formen un grupo lineal:

* Filas de botones.
* Barras de herramientas.
* Grupos de iconos.
* Elementos alineados horizontalmente.
* Elementos alineados verticalmente.
* Controles internos.

Grid controla la estructura principal.

Flexbox controla la alineación interna de los grupos lineales.

No reemplaces Grid por Flexbox cuando exista una relación real entre filas y columnas. Tampoco uses Grid innecesariamente para una simple fila de elementos.

## Dimensionamiento moderno

Evita depender de medidas fijas para controlar la estructura principal.

Utiliza una combinación razonada de:

* `min()`.
* `max()`.
* `clamp()`.
* `minmax()`.
* `fr`.
* Porcentajes.
* `rem`.
* Unidades relativas al viewport cuando sean necesarias.
* Unidades relativas al contenedor cuando sean apropiadas.

Ejemplos del tipo de intención esperada:

```css
width: min(100%, 62rem);
padding: clamp(0.75rem, 2vw, 1.25rem);
gap: clamp(0.5rem, 1.5vw, 1rem);
grid-template-columns: minmax(0, 1fr);
```

Para distribuciones proporcionales:

```css
grid-template-columns: 2fr 1fr;
```

Para limitar tamaños:

```css
width: min(92vw, 62rem);
```

Para permitir que una región crezca correctamente:

```css
minmax(0, 1fr);
```

Para tipografía fluida:

```css
font-size: clamp(1.5rem, 4cqw, 2.25rem);
```

No copies estos valores literalmente si no corresponden al diseño. Utilízalos como referencia del enfoque.

Las medidas deben expresar la intención del diseño, no compensar accidentalmente otro problema del layout.

## Container Queries

Utiliza Container Queries para que un componente se adapte al espacio real que recibe de su contenedor.

No dependas exclusivamente del ancho del viewport cuando el componente pueda aparecer en diferentes contextos, páginas, paneles o tamaños de contenedor.

Cuando sea apropiado:

```css
.componentRoot {
    container-type: inline-size;
    container-name: component;
}
```

Y adapta las regiones internas según el tamaño disponible:

```css
@container component (inline-size < 30rem) {
    /* adaptación interna */
}
```

Utiliza unidades como `cqw`, `cqh`, `cqi` o `cqb` solamente cuando mejoren la claridad y estabilidad del comportamiento.

## Media Queries

Reserva las Media Queries para condiciones generales relacionadas con:

* El viewport.
* Orientación.
* Altura general disponible.
* Preferencias del usuario.
* Dispositivos de entrada.
* Accesibilidad.
* Casos que realmente dependan de la ventana y no del tamaño del componente.

No agregues breakpoints arbitrarios para corregir pequeños defectos aislados.

Antes de crear una nueva Media Query, comprueba si el problema debe resolverse mediante:

* Grid.
* Flexbox.
* Flujo natural.
* `minmax()`.
* `clamp()`.
* Variables CSS.
* Container Queries.

## CSS Custom Properties

Utiliza variables CSS como fuente de verdad para:

* Espaciados.
* Tamaños.
* Alturas mínimas.
* Anchos máximos.
* Radios.
* Sombras.
* Duraciones.
* Tipografía.
* Densidad visual.
* Variantes.
* Ajustes responsive.

Ejemplo conceptual:

```css
.componentRoot {
    --component-gap: 1rem;
    --component-padding: 1.25rem;
    --component-radius: 1.5rem;
}
```

Los elementos internos deben consumir esas variables cuando representen una decisión compartida.

No dupliques el mismo valor en múltiples reglas si corresponde a una sola decisión de diseño.

## CSS Modules

Mantén CSS Modules.

Cada componente o región con una responsabilidad visual independiente debe controlar sus propios estilos.

Evita que una única hoja CSS crezca hasta controlar todas las regiones internas del módulo.

Divide los estilos cuando exista una responsabilidad clara, por ejemplo:

* Contenedor exterior.
* Estructura principal.
* Encabezado.
* Contenido.
* Listados.
* Controles.
* Visores.
* Estados de carga.
* Variantes.

No dividas los archivos de manera artificial. Cada archivo debe representar una responsabilidad visual coherente.

## CSS puro

Mantén CSS Vanilla.

No introduzcas:

* Tailwind CSS.
* Sass.
* SCSS.
* Less.
* Styled Components.
* Emotion.
* Material UI.
* Bootstrap.
* Librerías de layout.
* Sistemas de estilos en JavaScript.

Puedes utilizar características modernas de CSS nativo cuando aporten claridad y estén correctamente soportadas por los navegadores objetivo.

## Variantes y estados

Representa las variantes importantes de forma explícita.

Cuando sea apropiado, utiliza atributos como:

```jsx
data-variant
data-layout
data-density
data-state
data-mode
```

Ejemplo conceptual:

```jsx
<div
    className={styles.root}
    data-variant={variant}
    data-state={state}
>
```

Y en CSS:

```css
.root[data-variant="compact"] {
    --component-gap: 0.5rem;
}
```

Evita depender de cadenas extensas de selectores globales o de la estructura accidental del DOM para determinar una variante.

## Especificidad

Reduce la complejidad de la cascada.

No agregues nuevos `!important`, salvo que exista una razón técnica documentada y realmente inevitable.

Cuando encuentres un `!important` existente:

1. Identifica por qué fue necesario.
2. Comprueba qué regla está compitiendo.
3. Reorganiza la responsabilidad o la cascada.
4. Elimínalo solo si puedes demostrar que el resultado sigue siendo correcto.

No aumentes la especificidad mediante selectores cada vez más largos.

Prefiere clases locales, atributos explícitos y variables CSS.

## Posicionamiento

No utilices `position: absolute` para construir la estructura general.

Puedes utilizarlo para elementos que realmente deban superponerse, como:

* Insignias.
* Controles flotantes.
* Overlays.
* Tooltips.
* Indicadores.
* Decoraciones.
* Estados de carga.

La estructura principal debe depender del flujo normal, Grid o Flexbox.

## React y componentes

Mantén la interfaz dividida en componentes visuales con responsabilidades claras.

Cada componente debe:

* Tener una responsabilidad identificable.
* Recibir únicamente los datos y acciones que necesita.
* Evitar conocer detalles internos de componentes hermanos.
* Controlar su estructura interna.
* No controlar dimensiones externas que correspondan al padre.
* Mantener sus contratos actuales mientras se realiza la refactorización.

El componente padre debe controlar:

* La distribución general.
* El espacio que asigna a sus hijos.
* La relación entre regiones principales.

El componente hijo debe controlar:

* Su contenido interno.
* Su alineación interna.
* Sus estados visuales.
* Su scroll interno cuando corresponda.

No crees componentes minúsculos sin responsabilidad real.

No combines lógica de dominio con detalles de presentación.

## Arquitectura y SOLID

Respeta los principios existentes:

### Responsabilidad única

Cada componente, hook, servicio y archivo de estilos debe tener una responsabilidad clara.

### Abierto/cerrado

Las variantes deben poder extenderse sin modificar grandes cantidades de reglas existentes.

### Sustitución

No cambies contratos de componentes o servicios de forma que una implementación deje de poder sustituir a otra.

### Segregación de interfaces

No obligues a componentes a recibir propiedades que no utilizan.

### Inversión de dependencias

La presentación no debe depender directamente de detalles de infraestructura.

Mantén los límites de la arquitectura hexagonal y Clean Architecture.

No muevas lógica entre capas sin justificarlo.

## Responsive

Conserva todos los escenarios que actualmente funcionan.

La interfaz debe seguir funcionando como mínimo en:

* Escritorio amplio.
* Portátil con poca altura.
* Tableta.
* Móvil vertical.
* Móvil horizontal.
* Contenedores estrechos.
* Contenedores amplios.
* Contenido corto.
* Contenido largo.
* Estados de carga.
* Estados con información opcional.
* Estados con controles adicionales.

No optimices únicamente para una captura específica.

Evita resolver el responsive mediante una cadena de correcciones para resoluciones individuales.

Busca reglas que funcionen por relaciones espaciales.

## Accesibilidad

Conserva y mejora cuando sea posible:

* Navegación por teclado.
* Foco visible.
* Etiquetas accesibles.
* Semántica HTML.
* Contraste.
* Tamaño de áreas táctiles.
* `prefers-reduced-motion`.
* Estados deshabilitados.
* Lectores de pantalla.

No cambies un elemento semántico por un `div` sin necesidad.

## Rendimiento

No añadas complejidad visual innecesaria.

Revisa especialmente:

* Sombras múltiples.
* `backdrop-filter`.
* Filtros.
* Animaciones continuas.
* Transformaciones 3D.
* Reflows innecesarios.
* Reglas duplicadas.
* Estilos globales de gran alcance.

No elimines efectos visuales existentes solo por optimización. Identifica primero si representan un costo real.

No hagas microoptimizaciones sin evidencia.

## Proceso obligatorio

Trabaja de forma incremental.

### Paso 1: análisis

Antes de modificar, entrega:

1. Mapa de componentes y responsabilidades.
2. Mapa de regiones visuales.
3. Propietario actual de cada dimensión y posición.
4. Reglas duplicadas.
5. Conflictos de especificidad.
6. Uso de `!important`.
7. Selectores globales.
8. Medidas rígidas que afectan el layout.
9. Media Queries existentes.
10. Casos donde conviene usar Container Queries.
11. Riesgos de regresión.
12. Elementos que no deben tocarse.

### Paso 2: propuesta

Propón:

1. La estructura Grid principal.
2. Las áreas nombradas.
3. Los grupos internos que utilizarán Flexbox.
4. Las variables CSS que actuarán como fuente de verdad.
5. Las variantes explícitas.
6. La separación propuesta de archivos.
7. La estrategia responsive.
8. El orden exacto de implementación.

No cambies todavía el código en esta etapa.

### Paso 3: refactorización incremental

Realiza cambios pequeños y verificables.

En cada cambio:

1. Explica qué responsabilidad estás reorganizando.
2. Indica qué reglas sustituyes.
3. Conserva el comportamiento.
4. No mezcles cambios funcionales con cambios visuales.
5. No refactorices componentes no relacionados.
6. No elimines estilos hasta confirmar que fueron reemplazados.
7. Evita cambiar simultáneamente JSX, estado, layout y lógica.

### Paso 4: limpieza

Después de validar la nueva estructura:

1. Elimina reglas obsoletas.
2. Elimina duplicaciones.
3. Reduce especificidad.
4. Elimina `!important` que ya no sean necesarios.
5. Elimina Media Queries reemplazadas por reglas más generales.
6. Conserva comentarios que expliquen decisiones importantes.
7. Elimina comentarios que solo describan parches antiguos.

### Paso 5: validación

Entrega una lista de comprobación que incluya:

* Apariencia antes y después.
* Escritorio.
* Portátil con poca altura.
* Tableta.
* Móvil.
* Orientación horizontal.
* Estados de carga.
* Contenido largo.
* Navegación por teclado.
* Interacciones.
* Animaciones.
* Scroll.
* Variantes.
* Ausencia de desbordamientos.
* Ausencia de regresiones funcionales.

## Restricciones estrictas

No debes:

* Reescribir todo el módulo.
* Cambiar tecnologías.
* Cambiar la arquitectura.
* Cambiar la lógica de negocio.
* Crear nuevas dependencias.
* Introducir un framework CSS.
* Añadir `!important` para hacer que una regla funcione.
* Añadir breakpoints para cada resolución.
* Usar medidas fijas como solución principal.
* Usar posicionamiento absoluto para construir el layout.
* Modificar contratos públicos sin autorización.
* Renombrar indiscriminadamente.
* Eliminar código que no entiendas.
* Cambiar apariencia por preferencia personal.
* Aplicar patrones innecesarios.
* Sobreingenierizar.
* Mezclar refactorización visual con nuevas funciones.

## Criterio de éxito

La refactorización será correcta cuando:

* Todo siga funcionando.
* La apariencia se mantenga.
* La estructura sea más simple.
* Cada caja tenga un propietario claro.
* Cada tamaño importante tenga una fuente de verdad.
* Las regiones puedan moverse mediante Grid sin alterar otras partes.
* Los elementos internos puedan alinearse mediante Flexbox.
* El componente se adapte a su contenedor.
* Existan menos excepciones.
* Exista menos duplicación.
* Exista menos dependencia del orden del CSS.
* Se reduzcan los efectos laterales.
* Un desarrollador pueda localizar rápidamente dónde modificar una posición, tamaño o espacio.

No busques demostrar que el código puede ser más sofisticado.

Busca que sea más predecible, modular, mantenible y seguro de modificar.

Ahora analiza los archivos proporcionados y comienza únicamente por el Paso 1

