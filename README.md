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

## Sitio web (landing en Astro)

El panel es el backend del sitio `depahostcapital`. Expone, sin sesión, las rutas que el sitio usa de su contrato
(`openapi/depahost-api.json` del sitio):

- `GET /api/v1/properties`: inmuebles En cartera con autorización para publicar. Muestra el distrito, nunca la
  dirección ni los datos de acceso. Las fotos van como URLs firmadas por 6 horas; Astro las copia al construir.
- `POST /api/v1/leads`: formularios del sitio. Con celular crea o une el lead (canal Web); sin celular solo guarda el
  interés por cada inmueble. Los de alquiler no se registran.

Variables: `WEB_ORIGINS` (orígenes del sitio, separados por comas, para CORS) y `TURNSTILE_SECRET_KEY` (captcha).
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
