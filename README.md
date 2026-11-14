# Panel de seguimiento DepaHost

Panel interno para seguir a propietarios (captación) e interesados (compradores) desde el primer contacto
hasta el cierre y la postventa. Next.js 16, Supabase y Tailwind CSS. Ver [docs/plan.md](docs/plan.md) para la
arquitectura y el modelo de datos, y [docs/supuestos.md](docs/supuestos.md) para las reglas que se asumieron.

## Probar en local

Requisitos: Node 24 y un proyecto de Supabase (el plan gratuito sirve). No hace falta Docker.

1. **Variables de entorno.** Copia `.env.example` a `.env.local` y completa:
   - `NEXT_PUBLIC_SUPABASE_URL`: Project Settings → Data API.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`: Project Settings → API Keys.
   - `DATABASE_URL`: botón **Connect** → **Session pooler** (con la contraseña de la base).
   - Deja `WHATSAPP_MODE=simulado` mientras no haya credenciales de Meta.

2. **Ajustes de Supabase Auth** (una vez, en el dashboard):
   - Authentication → Sign In / Providers → **desactiva "Allow new users to sign up"**: los usuarios los crea el
     administrador desde el panel.
   - Authentication → URL Configuration → Site URL `http://localhost:3000` y, en Redirect URLs,
     `http://localhost:3000/**` (lo usan la recuperación de contraseña y las invitaciones).
   - Los correos de recuperación salen con el servidor de correo de prueba de Supabase, que tiene un límite bajo
     por hora. Para producción, configura un SMTP propio en Authentication → Emails.

3. **Instala y prepara la base:**

   ```bash
   npm install
   npm run db:migrar
   npm run crear-admin
   ```

   `db:migrar` aplica las migraciones de `supabase/migrations` que falten. `crear-admin` te pide nombre, correo y
   contraseña en la terminal y crea tu usuario administrador.

4. **(Opcional) Datos de demostración:** `npm run db:demo` carga inmuebles, propietarios e interesados de prueba
   con números ficticios `51900000XXX`. Se borran con `npm run db:demo -- --borrar`.

5. **Levanta el panel:** `npm run dev` y entra a <http://localhost:3000>.

## WhatsApp

La integración vive en `lib/whatsapp` y usa la API oficial de WhatsApp Cloud (Meta).

- **Modo simulado** (`WHATSAPP_MODE=simulado`): no llama a Meta. Los envíos quedan en el chat como enviados y,
  en la pestaña **Chat** de cada lead, **Simular cliente** crea un mensaje entrante como si llegara por el
  webhook (abre la ventana de 24 horas, cancela refuerzos, permite pulsar los botones de respuesta rápida).
  Fuera de la ventana se permiten plantillas sin nombre de Meta, con un aviso de que en producción no saldrían.
- **Modo meta** (`WHATSAPP_MODE=meta`): completa `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET`. Con el número de prueba
  de Meta solo se puede escribir a los destinatarios de prueba registrados en la app de Meta.
  - Webhook: `https://<tu-dominio>/api/whatsapp/webhook`, campo `messages`. En local necesitas un túnel (por
    ejemplo `cloudflared tunnel --url http://localhost:3000`).
  - Fuera de la ventana de 24 horas solo salen plantillas aprobadas: registra su nombre en
    **Configuración → Plantillas**. Sus parámetros `{{1}}`, `{{2}}`… siguen el orden de las variables del mensaje.

## Recordatorios automáticos (cron externo)

`/api/cron/recordatorios` envía por WhatsApp el recordatorio de 24 horas y el del mismo día de cada cita y visita
programada, entre las 8:00 y las 21:00 de Lima. Llámalo cada 15 minutos desde un servicio externo (por ejemplo
cron-job.org) con el encabezado `Authorization: Bearer <CRON_SECRET>`. Fuera de la ventana de 24 horas solo sale
si la plantilla tiene su nombre aprobado en Meta (Configuración → Plantillas); si no, queda en `errores`.

## Notificaciones push (celular y computadora)

Cada aviso de la campana (lead nuevo o asignado, mensaje de WhatsApp, cita, etc.) también llega como notificación
del sistema a los dispositivos donde el usuario activó los avisos, aunque el panel esté cerrado. Con el panel
abierto, en los dispositivos sin push activado aparece un aviso emergente.

Cómo funciona: el trigger `notificaciones_push` llama con `pg_net` a `POST /api/push`, que envía el aviso con
`web-push` a cada dispositivo guardado en `suscripciones_push`. `public/sw.js` lo muestra y, al tocarlo, abre el
lead o el chat.

Configuración (una sola vez):

1. Genera las claves: `npx web-push generate-vapid-keys`. Pon `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y
   `VAPID_SUBJECT` (`mailto:<correo>` o la URL `https://` del panel) en `.env.local` y en Vercel. Si cambias las
   claves, cada usuario debe volver a activar los avisos.
2. Aplica las migraciones (`npm run db:migrar`). Habilitan `pg_net`.
3. En el SQL Editor de Supabase, guarda en Vault la URL del panel y el mismo `CRON_SECRET` de Vercel:

   ```sql
   select vault.create_secret('https://<panel>', 'panel_url');
   select vault.create_secret('<CRON_SECRET>', 'panel_cron_secret');
   ```

   Para cambiarlos: `select vault.update_secret(id, '<nuevo valor>') from vault.secrets where name = 'panel_url';`.
   Sin estos secretos no salen pushes, pero la campana sigue funcionando.

Activar en cada dispositivo: abre la campana y toca **Activar avisos en este dispositivo**.

- **iPhone (iOS 16.4+):** primero instala el panel. En Safari toca **Compartir → Agregar a inicio**, ábrelo desde ese
  ícono y activa los avisos ahí.
- **Android:** funciona en Chrome. Si quieres, instálalo con **⋮ → Agregar a la pantalla principal**.
- **Computadora:** Chrome, Edge, Firefox o Safari. Los avisos llegan mientras el navegador esté abierto, aunque no
  tenga la pestaña del panel.

Cerrar sesión no apaga los avisos del dispositivo; para eso está **Desactivar** en la campana. Si otro usuario los
activa en el mismo navegador, el dispositivo pasa a ser suyo. Los usuarios desactivados no reciben pushes.

En local: los pushes los envía el panel cuya URL está en `panel_url` (no `localhost`), así que para probarlos
activa los avisos en ese panel. Revisa las llamadas de la base en `net._http_response`.

## Sitio web (landing en Astro)

El panel es el backend del sitio `depahostcapital`. Expone, sin sesión, las rutas que el sitio usa de su contrato
(`openapi/depahost-api.json` del sitio):

- `GET /api/v1/properties`: inmuebles En cartera con autorización para publicar. Muestra el distrito, nunca la
  dirección ni los datos de acceso. Las fotos van como URLs firmadas por 6 horas; Astro las copia al construir.
- `POST /api/v1/leads`: formularios del sitio. Con celular crea o une el lead (canal Web); sin celular solo guarda el
  interés por cada inmueble. Los de alquiler no se registran.

Para publicar un inmueble: **Inmuebles → Nuevo inmueble** registra al propietario, el inmueble y el contrato en un
paso (queda En cartera). Sube las fotos en su ficha y presiona **Actualizar web**, que llama al deploy hook de
Cloudflare para recompilar el sitio (unos 2 minutos).

Variables: `WEB_ORIGINS` (orígenes del sitio, separados por comas, para CORS), `TURNSTILE_SECRET_KEY` (captcha) y
`CLOUDFLARE_DEPLOY_HOOK_URL` (deploy hook del sitio).
En el sitio, `API_URL` y `PUBLIC_API_URL` apuntan a `https://<panel>/api`. La rentabilidad, los años de recupero y
«Destacado» se editan en la ficha del inmueble.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Panel en <http://localhost:3000> |
| `npm run build` | Build de producción |
| `npm run typecheck` | Revisión de tipos |
| `npm run lint` | ESLint |
| `npm run test:recordatorios` | Prueba qué recordatorio automático toca según la hora de Lima |
| `npm run test:sql` | Aplica las migraciones en un Postgres embebido (PGlite) y recorre los criterios de aceptación de las reglas de negocio |
| `npm run db:migrar` | Aplica las migraciones pendientes a `DATABASE_URL` |
| `npm run crear-admin` | Crea o promueve un usuario administrador |
| `npm run db:demo` | Carga (o borra con `-- --borrar`) datos de demostración |

## Despliegue en Vercel

Configura las mismas variables en Vercel (más `CRON_SECRET` con un valor aleatorio). `vercel.json` programa
`/api/cron/diario` todos los días a las 7:00 de Lima para pasar a "No responde" a quien terminó su cadencia; la
misma revisión corre al abrir la bandeja y la página Hoy. Agrega el dominio de producción a las Redirect URLs de
Supabase Auth y cambia `NEXT_PUBLIC_SITE_URL`.
