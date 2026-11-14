# Notificaciones en tiempo real en celular y computadora

## Por qué

El asesor debe enterarse en el momento de un lead nuevo o de un mensaje de WhatsApp, esté en la computadora o en el celular, para dar la bienvenida "idealmente en minutos" (especificación 1.1). Hoy la campana se actualiza en vivo solo con el panel abierto; con el panel cerrado o el celular bloqueado no llega nada.

## Objetivos

- Aviso del sistema (push) en computadora, Android y iPhone, aunque el panel esté cerrado.
- Con el panel abierto, aviso emergente dentro del panel.
- Se envía push de **todos** los avisos que hoy crea `notificar()` (leads, mensajes, citas, etc.), no solo leads y WhatsApp.

## No objetivos

- No se cambia qué genera avisos ni su texto: eso ya lo hacen los triggers SQL existentes.
- Sin preferencias por tipo de aviso ni horarios de silencio.
- Sin avisos por correo, SMS ni WhatsApp al asesor.

## Restricciones

- Usuarios con iPhone y Android. En iPhone el push solo funciona con el panel instalado en la pantalla de inicio (iOS 16.4+); ya está aceptado instalarlo.
- Sin costos nuevos: el push del navegador es gratis y la ruta en Vercel se ejecuta una vez por aviso.
- Ningún secreto en el repositorio: las claves VAPID van en variables de entorno, y la URL y el secreto que usa la base en Vault de Supabase.
- Las migraciones deben seguir pasando `npm run test:sql` (PGlite no tiene `pg_net` ni Vault).

## Enfoques considerados

| Enfoque | Qué cambia | Por qué sí o no |
| --- | --- | --- |
| **A. Trigger en la base con `pg_net` → `/api/push`** (elegido) | Al insertar en `notificaciones`, la base llama a una ruta del panel que envía el push | Cubre cualquier aviso, venga del webhook, del formulario web, de acciones del panel o de crons. Requiere una configuración única en Supabase. |
| B. Enviar desde el código tras cada punto de entrada | Webhook, formulario web y crons llaman al envío | No requiere configurar Supabase, pero los avisos que nacen de acciones del panel (asignación, citas) quedan sin push, salvo que se agregue una llamada en cada acción. |
| C. Edge Function de Supabase | Lo mismo que A, pero en Deno | Suma otro entorno y otro despliegue sin ganar nada. |

Samir eligió A.

## Diseño

1. **Panel instalable:** `app/manifest.ts` (`display: standalone`) e íconos PNG 192, 512 y apple-touch 180 generados a partir de `app/icon.svg`.
2. **Service worker** `public/sw.js`:
   - Muestra la notificación de cada push (título, cuerpo, enlace).
   - Usa el enlace como `tag`, para que varios mensajes de un mismo chat se agrupen.
   - Al tocarla, enfoca o abre el panel en ese enlace.
3. **Tabla `suscripciones_push`:**
   - Una fila por dispositivo: `usuario_id`, `endpoint` (único), `p256dh`, `auth`, `created_at`.
   - RLS: cada usuario lee, crea y borra solo las suyas.
4. **Activación en la campana:**
   - Botón "Activar avisos en este dispositivo" (pide permiso desde un toque, como exige iOS) y opción para desactivarlos.
   - En iPhone sin instalar, muestra cómo agregarlo a la pantalla de inicio en lugar del botón.
   - Si el permiso ya está concedido, cada carga del panel vuelve a registrar la suscripción (upsert por `endpoint`), por si el navegador la renovó.
5. **Trigger** `after insert on notificaciones`:
   - Llama con `net.http_post` a `<url del panel>/api/push` con `{ id }` y `Authorization: Bearer <secreto>`.
   - Lee la URL y el secreto de `vault.decrypted_secrets`.
   - Si `pg_net` o los secretos no existen (en local o en PGlite), no hace nada.
6. **Ruta `POST /api/push`:**
   - Valida el secreto (reutiliza `CRON_SECRET`).
   - Carga el aviso con el cliente admin y lo envía con `web-push` a cada suscripción del usuario, solo si el usuario está activo.
   - Borra las suscripciones que respondan 404 o 410.
7. **Aviso emergente dentro del panel:** la suscripción de Realtime que ya tiene la campana muestra un toast (Sonner) con enlace cuando en ese dispositivo no se concedió el permiso de notificaciones. Así no se duplica con el push.
8. **Variables nuevas:**
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`, en `.env.example` sin valores.
   - Pasos para generar las claves y cargar los secretos en Vault.

**Dependencia nueva:** `web-push`. Cifra el contenido del push (RFC 8291) y firma VAPID; no conviene hacerlo a mano.

## Decisiones del constructor (revisables)

- **Contenido en la pantalla bloqueada:** la notificación muestra el mismo título y cuerpo que la campana (nombre del lead y el inicio del mensaje).
- **Cierre de sesión:** cerrar sesión o vencer la inactividad no borra la suscripción. El objetivo es avisar justamente cuando no se está usando el panel. Para dejar de recibir avisos en un dispositivo se usa "Desactivar".
- **Usuario desactivado (HU-02):** no recibe push aunque tenga suscripciones.
- **Endpoint de push:** como la URL y el secreto se leen de Vault, si cambia el dominio del panel solo se actualiza ese secreto.
