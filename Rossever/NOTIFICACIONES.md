# Notificaciones push para Rossever (Android/Chrome)

Con esto, cuando publiques, a Rossi le llega una notificación normal
del celular (como cualquier app), sin Telegram de por medio.

Ya viene todo escrito. Solo faltan pasos de configuración en Supabase
y subir dos archivos nuevos: `sw.js` (raíz del sitio) y la carpeta
`supabase/functions/send-push/`.

## 1. Base de datos

Ejecuta `setup.sql` completo en Supabase → SQL Editor (ya incluye la
tabla nueva `push_subscriptions`). Se puede volver a ejecutar sin problema
aunque ya lo hayas corrido antes.

## 2. Claves VAPID (ya generadas, no las cambies)

La clave **pública** ya está puesta en `app.js` (`CONFIG.VAPID_PUBLIC_KEY`).
La clave **privada** nunca va en el frontend: solo en la Edge Function (paso 4).

Solo si perdieras la privada tendrías que generar un par nuevo:

```
npx web-push generate-vapid-keys
```

En ese caso: pega la pública nueva en `app.js`, guarda ambas con
`supabase secrets set` (paso 4), vacía la tabla `push_subscriptions` y pídele
a Rossi que vuelva a activar las notificaciones (las suscripciones viejas
quedan inválidas con claves nuevas).

## 3. Instala el CLI de Supabase y conecta el proyecto

En tu computador, en la carpeta del proyecto:

```bash
npm install -g supabase
supabase login
supabase link --project-ref trsyyewfzmssytucuxpx
```

## 4. Sube la Edge Function y sus variables secretas

```bash
supabase functions deploy send-push --no-verify-jwt

supabase secrets set VAPID_PUBLIC_KEY=<tu_clave_publica>
supabase secrets set VAPID_PRIVATE_KEY=<tu_clave_privada>
supabase secrets set WEBHOOK_SECRET=<inventa_un_texto_largo>
supabase secrets set VAPID_CONTACT=mailto:tucorreo@real.com
supabase secrets set SITE_URL=https://tu-sitio.netlify.app/
```

(`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya existen solas dentro
de toda Edge Function, no hace falta configurarlas.)

## 5. Conecta el disparador: Database Webhook

En el panel de Supabase:

1. **Database → Webhooks → Create a new hook**
2. Tabla: `posts` · Evento: `Insert`
3. Tipo: **Supabase Edge Functions** → elige `send-push`
4. En HTTP Headers añade `x-webhook-secret` con el mismo valor de WEBHOOK_SECRET.
5. Guarda.

Desde ahora, cada vez que se inserta una fila en `posts` (o sea, cada
vez que publicas), Supabase llama sola a la función y esta le manda
el push a todos los celulares suscritos.

## 6. Sube los archivos del sitio

Asegúrate de subir también `sw.js` junto a `index.html`, `admin.html`,
`app.js`, `style.css`, `manifest.webmanifest`, `icon.svg` y los PNG (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `badge-96.png`) — todos en
la misma carpeta raíz del sitio.

## 7. Pruébalo desde el celular de Rossi

1. Abre `index.html` en Chrome de Android (ideal: ya instalada a la
   pantalla de inicio).
2. Va a aparecer un aviso abajo: "Activa las notificaciones…" con un
   botón. Rossi lo toca y acepta el permiso que pide Chrome.
3. Publica algo desde `admin.html`. En unos segundos debería sonar la
   notificación en su celular, aunque tenga la app cerrada.

## Notas

- Si Rossi le da "Bloquear" al permiso por error, tiene que entrar a
  los ajustes del sitio en Chrome (ícono del candado → Permisos →
  Notificaciones) y ponerlo en "Permitir" de nuevo.
- Las notificaciones son push normales del celular; ya no se usa Telegram.
- Si cambias el dominio donde vive el sitio, actualiza `SITE_URL` con
  `supabase secrets set SITE_URL=...` otra vez.
