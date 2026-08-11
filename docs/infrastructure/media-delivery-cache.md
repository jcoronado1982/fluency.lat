# Entrega y caché de imágenes y audio

> Guía canónica para configurar el modo `oracle` (origen directo — hoy GCP en producción,
> nombre de modo legado de cuando el origen era Oracle, ver `tools/oracle-legacy/`) o
> `cloudflare` como proveedor de entrega de media.
> Alcance: `/card_images/*` y `/card_audio/*` en el estudio autenticado y en
> `landing-demo`, tanto en producción/QA como en la revisión local contra el origen.

## Objetivo

El sistema puede cambiar la política de entrega mediante una sola variable, sin acoplar los casos
de uso ni los endpoints a un CDN concreto:

```text
MEDIA_DELIVERY_MODE=oracle | cloudflare
```

El valor de respaldo de la aplicación y de los scripts manuales es `oracle`. El pipeline de
producción selecciona explícitamente `cloudflare`. Un valor diferente de los dos anteriores detiene
el arranque o el despliegue para evitar una configuración parcial.

## Estado operativo registrado — 14 de julio de 2026

| Componente | Estado | Decisión que no se debe cambiar por accidente |
|---|---|---|
| DNS autoritativo | Cloudflare | Spaceship continúa solo como registrador y correo. |
| Producción | `fluency.lat` y `www.fluency.lat` proxyados (nube naranja) | El tráfico público pasa por Cloudflare. |
| QA | `qa.fluency.lat` A `35.188.162.50` (GCP `fluency-proxy-backend`, migrado y verificado en vivo 4 ago 2026; antes `157.151.199.170` en Oracle), DNS-only (nube gris) | QA llega directo al proxy GCP y no usa CDN. |
| TLS de producción | Cloudflare **Full (strict)** | No cambiar a `Full` ni `Flexible`. |
| Regla Cloudflare | `Media versionada`, activa, orden 1 | Solo `fluency.lat`/`www` y `/card_images/`/`/card_audio/`. |
| Cache key | Standard/Default | Conserva toda la query, incluido `v`/`t`; nunca usar `Ignore Query String`. |
| Aplicación | `MEDIA_DELIVERY_MODE=cloudflare` desplegado en backend y Caddy | El pipeline comprueba que ambos contenedores coincidan. |

La configuración externa y la política del origen están activas. El cambio de modo sigue requiriendo
un nuevo despliegue: modificar solo Cloudflare o solo una variable local no actualiza contenedores ya
iniciados.

## Comportamiento por modo

| Modo | URL versionada (`?v=` o `?t=`) | URL sin versión | Requisito de red |
|---|---|---|---|
| `oracle` | El navegador puede conservarla 1 año como `immutable` | `no-cache`; revalida con ETag | DNS-only o hostname directo al origen |
| `cloudflare` | Cloudflare puede conservarla 1 año; el navegador revalida contra el edge | `no-cache` en navegador y CDN | Registro proxyado por Cloudflare |

En `cloudflare`, el origen envía `Cloudflare-CDN-Cache-Control` para separar la política del CDN de
la política del navegador. El navegador recibe `Cache-Control: public, no-cache`, por lo que no se
queda aislado durante un año con una copia antigua.

## Cómo funciona el versionado

Los archivos mantienen su nombre. La identidad de caché cambia mediante la query:

```text
/card_images/tarjeta-123.avif?v=1784036000000000000-28452
/card_audio/tarjeta-123.ogg?v=1784036000000000000-91234
```

El backend es responsable de agregar la versión cuando construye la URL:

- Archivo local: fecha de modificación en nanosegundos más tamaño.
- Archivo consultado remotamente: ETag de Caddy, calculado con fecha de modificación de alta
  precisión y tamaño, mediante un `HEAD` HTTP. Si el origen no entrega ETag, usa
  `Last-Modified` más `Content-Length` como respaldo.
- Audio recién generado: UUID de la generación; evita una consulta adicional después del TTS.
- Si no se puede obtener una versión, devuelve la URL sin `?v=` y la política segura es `no-cache`.

No se regeneran imágenes o audios existentes, no se cambia el nombre del archivo, no se calcula un
hash del contenido, no se crea un sidecar y no se agrega una caché binaria en RAM. En modo `oracle`
(origen directo, hoy GCP en producción), Caddy sigue leyendo el archivo directamente del disco. La consulta de metadatos ocurre al construir la
URL, no en cada descarga servida por Caddy. Reemplazar bytes bajo el mismo nombre cambia el ETag o
la combinación fecha/tamaño y, por tanto, produce otro `?v=`.

### Actualizar un archivo sin cambiar su nombre

1. Se sobrescribe el archivo normal en `card_images/` o `card_audio/`; no se renombra ni se vuelve
   a generar todo el catálogo.
2. El siguiente `resolve-image` o `resolve-audio` obtiene sus metadatos y devuelve la misma ruta
   física con un `?v=` nuevo.
3. El frontend pide esa URL nueva. El navegador la revalida en Cloudflare y Cloudflare hace `MISS`
   para esa identidad nueva, obtiene los bytes actuales desde Caddy/el origen y luego responde `HIT`.
4. Una copia de la URL anterior puede vivir temporalmente en el edge, pero no se entrega a la
   aplicación porque esta ya pide otra URL. La caché normal no es almacenamiento reservado: el edge
   la expulsa automáticamente según uso/espacio. No hace falta purgar en una actualización normal.

Si se necesita retirar un archivo por una incidencia de seguridad o derechos, purgar la **URL exacta**
en Cloudflare es válido. No usar `Purge Everything` como flujo ordinario.

La resolución de una imagen o audio comprueba existencia y versión en una sola consulta de metadatos
en el camino normal. El cliente precarga únicamente la imagen y el audio ya existentes de la
siguiente tarjeta con un margen corto, evitando que la latencia del origen quede en el camino visible
al avanzar y sin iniciar generación de medios.
La navegación y el volteo de tarjetas no se bloquean mientras esa imagen termina de cargar; las
respuestas que pertenecen a una tarjeta anterior se descartan por la secuencia del flujo de estudio.
Al abandonar una tarjeta, el cliente aborta las solicitudes HTTP y descargas activas de resolución
de imagen y audio. El audio automático espera un margen corto antes de comenzar, de modo que una
secuencia rápida de “Siguiente” no acumula trabajo de tarjetas que el usuario decidió saltar. La
precarga de audio usa exclusivamente `resolve-audio`: un 404 no sintetiza, genera ni reintenta. Los
bytes anticipados viven en la caché HTTP del navegador; JavaScript guarda solo metadatos con un tope
de 24 entradas. La síntesis ocurre únicamente cuando una reproducción solicitada no encuentra un
archivo existente.
La reproducción directa tampoco crea una segunda descarga de calentamiento ni conserva copias
completas como `Blob` en memoria JavaScript. Un error HTTP 4xx no se reintenta: evita esperas largas
cuando el archivo no existe o el rol no permite generarlo.
Una descarga que ya contiene `?v=` reutiliza esa versión como ETag y no vuelve a consultar la fecha
del archivo remoto. Esto evita un segundo `HEAD` al origen antes de entregar audio o imagen.
Para audio, el backend consulta en paralelo el nombre determinista actual y su equivalente del layout
legado sin dirección, y prefiere siempre el actual. Viewer/guest no consulta una ruta personal que su
rol nunca puede generar. La misma respuesta `HEAD` alimenta existencia y versión, evitando repetirla.
La anticipación de la siguiente tarjeta comienza solo cuando los medios de la tarjeta visible ya
están listos, para que una descarga de baja prioridad no compita con el audio que el usuario espera.

## Cobertura: estudio normal y landing demo

Ambas superficies usan los mismos puertos/adaptadores HTTP y los mismos hooks de precarga y
cancelación. Solo cambia el namespace y el proveedor que genera contenido cuando se solicita de
forma explícita:

| Superficie | Namespace | Imagen/audio existente | Si falta al reproducir/generar | Precarga siguiente |
|---|---|---|---|---|
| Estudio normal | Categoría y deck activos, con `es_en`/`en_es` | Origen directo o Cloudflare según `MEDIA_DELIVERY_MODE` | Reglas de rol; proveedor normal de imagen/TTS | Imagen + audio, solo `resolve`, cancelable |
| Landing demo | `landing-demo/verbs-essentials` | Misma entrega (origen/Cloudflare) y mismo versionado | Gemini para imagen y ElevenLabs para audio | Imagen + audio, solo `resolve`, cancelable |

La precarga del demo no llama a Gemini ni a ElevenLabs. Si `resolve-image` o `resolve-audio` responde
404, la operación termina silenciosamente. La generación continúa siendo responsabilidad del flujo
visible de la tarjeta y conserva las reglas existentes del demo.

## Secuencia completa en el cliente

1. Cambia la tarjeta y se cancela el `AbortController` asociado a la anterior.
2. La navegación permanece disponible; no espera imagen, audio, resolución ni decodificación.
3. El audio automático deja un margen de 50 ms. Otro cambio dentro de ese margen elimina el timer.
4. La tarjeta visible resuelve sus URLs. Una ruta histórica sin query se convierte en la misma ruta
   versionada mediante `resolve-image`/`resolve-audio`.
5. La descarga con `?v=` no hace otro `HEAD`; reutiliza la versión como ETag.
6. Cuando imagen y audio visibles ya están listos, se anticipan únicamente los medios existentes de
   la tarjeta siguiente. Los bytes quedan en la caché HTTP; JavaScript solo guarda como máximo 24
   entradas pequeñas de metadatos durante cinco minutos.
7. Al avanzar, una precarga terminada se reutiliza. Una precarga todavía en curso se aborta y el
   flujo de la nueva tarjeta continúa sin esperar el trabajo abandonado.

No se precargan tarjeta anterior, varias tarjetas futuras, definiciones secundarias ni formas
`v2`/`v3`. Es un presupuesto deliberado para no multiplicar red, CPU o memoria con 100 usuarios.

## Resolución optimizada de audio legado

La biblioteca histórica de audio usa rutas sin dirección de curso, mientras el formato actual usa
`es_en` o `en_es`. El backend:

- omite la ruta personal para `viewer`/`guest`, porque esos roles no pueden haberla generado;
- consulta en paralelo el nombre determinista actual y su equivalente legado exacto;
- prefiere el archivo actual si ambos existen;
- usa la búsqueda costosa por prefijo solo para formatos o hashes realmente antiguos;
- reutiliza el resultado del mismo `HEAD` para existencia y versión;
- no reintenta errores HTTP 4xx en reproducción.

Medición local contra Oracle realizada el 14 de julio de 2026 con un audio existente:

| Etapa | Antes | Después |
|---|---:|---:|
| `POST /api/resolve-audio` | ~3.0 s | ~0.16 s primera consulta; ~0.08 s siguientes |
| Descarga versionada del audio | ~0.08 s | ~0.08 s |

Es una medición diagnóstica, no un SLA; la distancia al origen y el estado del CDN pueden variar.

## Memoria, CPU y regeneración

- El backend no mantiene bytes de imagen/audio en una caché propia de RAM.
- El versionado consulta metadatos; no lee el contenido ni calcula hashes completos.
- La consulta remota reutiliza el pool HTTP y hace un solo `HEAD`; no crea procesos SSH.
- La precarga no regenera archivos y no ejecuta IA.
- El adaptador de audio consume la descarga por fragmentos y no conserva un `Blob` completo en
  JavaScript.
- Los mapas de metadatos del cliente tienen TTL y tope de 24 entradas.
- Caddy/Cloudflare y la caché HTTP del navegador realizan el trabajo de entrega y reutilización.

Esto aplica por igual al estudio normal y al landing demo.

### Coste de Cloudflare

La regla creada usa la caché edge normal incluida en el plan Free; no reserva almacenamiento ni
activa un producto facturable. Las versiones antiguas se evictan automáticamente y no generan un
cobro por GB almacenado. No activar **Cache Reserve**, **Cloudflare Images** ni **R2** para este
flujo salvo que se tome una decisión explícita de producto: son productos distintos de la caché CDN
normal.

El frontend debe conservar la query al normalizar extensiones antiguas. Quitar `?v=` rompe la
identidad de caché y puede volver a mostrar una copia anterior.

Los `imagePath` guardados dentro de JSON históricos no se reescriben. Al mostrarlos, el cliente
extrae su identidad, pide al backend la misma ruta versionada y usa la respuesta `?v=`. Si un JSON
ilegible o un archivo legado no puede resolverse, usa la ruta original con `no-cache`: sigue siendo
correcto, aunque no obtiene la caché larga del CDN.

## Diseño hexagonal

```text
Endpoint HTTP
    -> MediaDeliveryProvider (puerto en core)
        -> OracleMediaDeliveryProvider (adaptador)
        -> CloudflareMediaDeliveryProvider (adaptador)
```

Componentes:

- Puerto: `backend/core/src/ports/media_delivery.rs`.
- Adaptadores: `backend/api_main/src/infrastructure/media_delivery/`.
- Selección en el composition root: `backend/api_main/src/main.rs`.
- Traducción de la variable para Caddy: `infra/proxy/deploy-caddy.sh`.
- Política de archivos estáticos: snippet `asset_cache_policy` en `infra/proxy/Caddyfile`.
- Conservación de la versión en el cliente: `client/src/utils/mediaUrl.js`.

Para incorporar otro proveedor se crea un adaptador que implemente `MediaDeliveryProvider` y se
registra en la factory del composition root. Los casos de uso y handlers no deben conocer el nombre
del proveedor.

## Cambio mediante Azure Pipeline

La fuente de verdad del despliegue es la variable superior de `azure-pipelines.yml`:

```yaml
- name: MEDIA_DELIVERY_MODE
  value: 'cloudflare' # producción actual; cambiar a oracle para reversión
```

El pipeline propaga el mismo valor a Caddy, al backend del proxy real, Cloud Run y AWS. El cambio
requiere un nuevo despliegue; no es un interruptor dinámico dentro de contenedores que ya están
ejecutándose. ⚠️ Esta verificación vivía en el job `Mirror_Oracle`, deshabilitado el 4 ago 2026
(`condition: false`, ver `tools/oracle-legacy/README.md`) — hoy no hay ningún job de pipeline que
corra esta comparación automáticamente para el proxy real. Cuando el job estaba activo: comparaba
el valor real de los contenedores de Caddy/backend y probaba una imagen y un audio existentes, con
y sin versión, directamente contra el origen. El
pipeline falla si los modos difieren, si una URL sin versión no revalida o si falta la política larga
exclusiva del CDN. Las pruebas solo hacen `HEAD`; no cargan los archivos en RAM.
La prueba conecta a `127.0.0.1` mediante `curl --resolve`, conservando el hostname y SNI de Caddy;
no sustituirlo por `https://127.0.0.1` con un header `Host`, porque TLS no seleccionaría el
certificado del sitio.

## Cambio manual en Oracle (procedimiento archivado)

> Esto describe el procedimiento tal como existía en Oracle (rutas `/root/smart-proxy/...`,
> `bootstrap-oracle.sh`) — ver `tools/oracle-legacy/oracle-local-backend-deploy.md` para el
> contexto completo. En el proxy real de GCP hoy no existe un script equivalente: el despliegue
> manual se hizo con `docker run` directo (ver historial de `git log` de esta sesión, 4 ago 2026);
> si hace falta repetirlo, adaptar el patrón de abajo a las rutas reales de GCP
> (`/mnt/sda/infra-proxy/`, ver `docs/infrastructure/server_inventory.md`).

Los scripts debían estar actualizados en `/root/smart-proxy/infra-proxy`. Para mantener backend y
Caddy en el mismo modo:

```bash
# Activar Cloudflare
MEDIA_DELIVERY_MODE=cloudflare \
  bash /root/smart-proxy/infra-proxy/bootstrap-oracle.sh --all

# Volver a entrega directa desde el origen
MEDIA_DELIVERY_MODE=oracle \
  bash /root/smart-proxy/infra-proxy/bootstrap-oracle.sh --all
```

El despliegue manual del backend continúa necesitando variables y secretos equivalentes a los
descritos en `tools/oracle-legacy/oracle-local-backend-deploy.md`. El pipeline es el procedimiento
normal cuando está activo.

## Revisión local contra el origen de producción (solo lectura)

Para levantar el backend y la interfaz local usando el origen de producción como repositorio de
lectura (el modo/flag se llama `oracle` por legado — hoy apunta a GCP), sin escribir ni sincronizar
archivos a producción:

```bash
./start.sh oracle
```

Este modo fija `ORACLE_REPOSITORY_ONLY=true` y `SYNC_TO_ORACLE=false`. Si se dispone de un hostname
directo al origen, usarlo para no atravesar Cloudflare:

```bash
ORACLE_PUBLIC_BASE_URL=https://<hostname-directo-oracle> ./start.sh oracle
```

Sin `ORACLE_PUBLIC_BASE_URL`, el modo usa `https://fluency.lat`. El modo histórico `./start.sh remoto`
sí permite sincronización hacia el origen (nombre de variable legado) y no debe usarse solo para
revisar contenido.

## Topología DNS actual (14 de julio de 2026)

- Registrador del dominio: Spaceship.
- DNS autoritativo: `heather.ns.cloudflare.com` y `lennon.ns.cloudflare.com`.
- `fluency.lat`: registro A proxyado por Cloudflare (nube naranja).
- `www.fluency.lat`: CNAME proxyado por Cloudflare (nube naranja).
- `qa.fluency.lat`: registro A `35.188.162.50` (GCP `fluency-proxy-backend`, migrado 4 ago 2026;
  antes `157.151.199.170` en Oracle), DNS-only (nube gris).
- MX de Spaceship Email Forwarding y TXT SPF: DNS-only.

QA no atraviesa el proxy ni la caché de Cloudflare. Como Caddy comparte el modo de producción,
recibe `Cache-Control: public, no-cache`; el header exclusivo de Cloudflare es ignorado por el
navegador. Esto mantiene QA actualizado, pero **DNS-only no significa privado**: publica la IP del
origen y permite llegar directamente a Caddy. La advertencia “origin IP partially exposed” de
Cloudflare es esperada mientras se conserve esta decisión.

## Configuración externa de Cloudflare

La variable no administra el DNS ni llama la API de Cloudflare. Para `cloudflare` se debe comprobar:

1. El registro de `fluency.lat` está proxyado (nube naranja).
2. `SSL/TLS > Overview` usa **Full (strict)**; Caddy presenta un certificado público válido.
3. La cache key permanece en **Standard/Default**, que incluye la query completa. No elegir
   `Ignore Query String` ni crear una clave que excluya `v` o `t`.
4. Las rutas `/card_images/*` y `/card_audio/*` son elegibles para caché.
5. Las reglas no sobrescriben `Edge TTL`, `Browser TTL` ni las cabeceras del origen.

Crear una única regla en `Caching > Cache Rules > Create rule`:

```text
Nombre: Media versionada (imágenes y audio)

(http.host eq "fluency.lat" or http.host eq "www.fluency.lat")
and (
  starts_with(http.request.uri.path, "/card_images/")
  or starts_with(http.request.uri.path, "/card_audio/")
)

Cache eligibility: Eligible for cache
```

No agregar otras acciones. En particular, no activar `Cache Everything` para todo el dominio, no
incluir `/api`, `/db`, JSON ni HTML, no forzar TTL y no modificar Cache Key. El origen decide:

- URL con `?v=`/`?t=`: `Cloudflare-CDN-Cache-Control: public, max-age=31536000`.
- URL sin versión: `Cloudflare-CDN-Cache-Control: public, no-cache`.
- Navegador en ambos casos: `Cache-Control: public, no-cache`.

Cloudflare puede consumir y ocultar `Cloudflare-CDN-Cache-Control` en la respuesta que llega al
navegador; la prueba funcional es `CF-Cache-Status`, no la presencia downstream de ese header.
Además, su Browser Cache TTL puede elevar el `max-age` visible: el valor por defecto observado fue
4 horas. La identidad `?v=` sigue evitando contenido anterior después de reemplazar un archivo, pero
no se debe afirmar que el navegador siempre verá `no-cache` sin revisar ese ajuste del panel.

### Procedimiento del panel aplicado

1. En `DNS > Records`: A de raíz y CNAME `www` proxyados; A `qa` DNS-only; MX/TXT DNS-only.
2. En `Caching > Cache Rules`: crear `Media versionada`, pegar la expresión anterior, seleccionar
   `Eligible for cache` y desplegarla sin agregar `Edge TTL`, `Browser TTL`, `Cache key` ni `Vary`.
3. En `SSL/TLS > Overview > Configure`: seleccionar y guardar **Full (strict)**.

No crear reglas adicionales de “Cache everything”, ni reglas que incluyan `/api`, `/db`, `/json` o
HTML. No cambiar la regla existente para ignorar parámetros de query.

Para acceso realmente directo con `oracle`, usar DNS-only (nube gris) o un hostname de origen
separado. Ese acceso no recibe WAF, bloqueo por país/IP ni mitigación de bots de Cloudflare; debe
protegerse por separado y no conviene publicar innecesariamente el hostname de origen.

## Verificación posterior al despliegue

Usar una ruta real existente y probar primero sin versión, luego con dos versiones distintas:

```bash
curl -sI 'https://fluency.lat/card_images/<archivo>.avif'
curl -sI 'https://fluency.lat/card_images/<archivo>.avif?v=prueba-1'
curl -sI 'https://fluency.lat/card_images/<archivo>.avif?v=prueba-2'
```

Resultados esperados:

- Sin versión: `Cache-Control: public, no-cache`.
- `oracle` con versión: `Cache-Control: public, max-age=31536000, immutable`.
- `cloudflare` con versión: el origen Caddy entrega `Cache-Control: public, no-cache`; Cloudflare
  puede devolver al navegador ese valor o elevarlo al Browser Cache TTL configurado (4 horas en la
  observación del 14 de julio de 2026). Al repetir, `CF-Cache-Status` debe evolucionar según la caché
  del edge (`MISS`, luego `HIT`, salvo reglas o estado previo del punto de presencia).
- Cambiar `v=prueba-1` por `v=prueba-2` debe producir identidades de caché diferentes.

Comprobación realizada después del despliegue, el 14 de julio de 2026: producción respondió con
`server: cloudflare`; una imagen AVIF versionada respondió `MISS` desde el POP de Miami y
`Cache-Control: public, max-age=14400`. La misma ruta por QA directo mostró las cabeceras de origen:
`Cache-Control: public, no-cache` y
`Cloudflare-CDN-Cache-Control: public, max-age=31536000`. La página/API permanece `DYNAMIC`.
Los 14.400 segundos proceden del Browser Cache TTL predeterminado de Cloudflare, que toma el valor
mayor. Para revalidación estricta del navegador, seleccionar **Respect Existing Headers** o definir
una regla específica y volver a medir. El versionado actual sigue siendo correcto porque una
actualización cambia la URL solicitada.

Comprobar el modo de los contenedores:

```bash
docker inspect caddy-smart --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep MEDIA_DELIVERY_MODE
docker inspect flashcard-backend-node --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep MEDIA_DELIVERY_MODE
```

### Lista de entrega para el operador

1. Revisar y publicar los cambios a la rama `main`; no hacer `git add .` a ciegas en un árbol con
   media de trabajo sin revisar.
2. Esperar Azure Pipeline en verde. El pipeline despliega frontend, Caddy y backend; luego verifica
   que ambos contenedores usan el mismo `MEDIA_DELIVERY_MODE` y hace `HEAD` de una imagen y un audio
   con y sin versión.
3. Repetir un `curl -sI` real o abrir DevTools: asset versionado → `CF-Cache-Status: MISS`/`HIT`;
   el `Cache-Control` visible depende del Browser Cache TTL. HTML/API → `DYNAMIC`.
4. Probar QA por separado: debe responder directo desde Caddy, sin cabeceras `server: cloudflare` ni
   `CF-Cache-Status`.

## Reversión y diagnóstico

- Reversión segura: fijar `MEDIA_DELIVERY_MODE=oracle`, redesplegar backend y Caddy y usar el DNS
  directo correspondiente.
- Si aparece contenido anterior, confirmar primero que la URL contiene una versión nueva y que el
  frontend no eliminó la query.
- Si se reemplazó el archivo bajo el mismo nombre, volver a resolver la tarjeta: la URL nueva debe
  mostrar otro `?v=`. No reutilizar manualmente una URL vieja, porque esa URL identifica
  deliberadamente los bytes anteriores.
- Si Cloudflare no entrega `HIT`, revisar la cache key, reglas de caché, respuesta `Set-Cookie` y las
  cabeceras observadas desde el origen.
- No purgar toda la caché como mecanismo normal de actualización. El cambio de `?v=` debe crear la
  nueva identidad; una purga queda reservada para incidentes o reglas configuradas incorrectamente.
- No declarar `immutable` para archivos sin versión: estos conservan el mismo nombre al regenerarse.
- Si la imagen parece instantánea pero el audio no, medir por separado `resolve-audio` y el GET
  versionado. Una resolución lenta apunta a búsqueda de metadatos/layout; un GET lento apunta al
  origen/CDN. No resolverlo agregando una caché binaria en RAM al backend.
- En DevTools, una navegación rápida debe mostrar solicitudes anteriores como canceladas y no debe
  aparecer `synthesize-speech`/`generate-image` causado por la precarga.

## Pruebas relacionadas

- Rust: políticas de origen directo/Cloudflare, selección del adaptador, URLs con y sin versión y parámetros
  de nombre parecido como `preview`.
- Frontend: normalización AVIF conservando query y fragmento; cachés acotadas de imagen/audio;
  build del estudio normal y del landing demo compartiendo los hooks de precarga.
- Infraestructura: validación del Caddyfile en ambos modos, sintaxis de scripts y parseo YAML del
  pipeline.

## Referencias oficiales de Cloudflare

- [Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)
- [Ajustes de Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)
- [Niveles de caché y query string](https://developers.cloudflare.com/cache/how-to/set-caching-levels/)
- [Edge y Browser Cache TTL](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/)
- [CDN-Cache-Control](https://developers.cloudflare.com/cache/concepts/cdn-cache-control/)
- [Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- [Retención y expulsión de la caché edge](https://developers.cloudflare.com/cache/concepts/retention-vs-freshness/)
- [Planes de caché y Cache Reserve](https://developers.cloudflare.com/cache/plans/)

## Acceso por API y Credenciales

Las credenciales para interactuar con la API de Cloudflare (gestión de zonas, purga de caché y Workers) se encuentran centralizadas en `SECRETS_MAP.md` y en las variables de entorno de desarrollo local (`backend/.env`):

* `CLOUDFLARE_ACCOUNT_ID`: `8127a6393b7301b89874e61c60f7bab8`
* `CLOUDFLARE_API_TOKEN`: Configurado en `backend/.env`
* `CLOUDFLARE_ZONE_ID_FLUENCY_LAT`: `7de7e2a37c47a7233fd87491450ecd7a`

Para purgar la caché de una URL específica desde la terminal:

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/7de7e2a37c47a7233fd87491450ecd7a/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://fluency.lat/card_images/tarjeta-ejemplo.avif"]}'
```
