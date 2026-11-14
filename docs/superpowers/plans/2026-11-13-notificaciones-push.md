# Notificaciones push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada aviso de `notificaciones` llega como push al celular y a la computadora del usuario, y con el panel abierto aparece un toast.

**Architecture:** Un trigger `after insert on notificaciones` llama con `pg_net` a `POST /api/push`. Esa ruta envía el aviso con `web-push` a las suscripciones del usuario guardadas en `suscripciones_push`. Un service worker (`public/sw.js`) muestra el aviso, y el manifest permite instalar el panel (obligatorio en iPhone).

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres, pg_net, Vault, Realtime), `web-push`, Sonner.

**Spec:** `docs/superpowers/specs/2026-11-13-notificaciones-push-design.md`

## Global Constraints

- Sin secretos en el repo: las claves VAPID van en el entorno, y la URL del panel y el secreto en Vault (`panel_url`, `panel_cron_secret`).
- `npm run test:sql` sigue pasando en PGlite, que no tiene `pg_net` ni Vault: el trigger no hace nada sin ellos.
- Interfaz en español (Perú) y usable desde el celular.
- La ruta `/api/push` se autentica con `Authorization: Bearer <CRON_SECRET>`.

## Review Focus

- **Dispositivo compartido:** si el usuario B activa los avisos en un navegador que ya tenía suscrito el usuario A, el dispositivo pasa a B. Lo prueba `guardar_suscripcion_push` en la tarea 1.
- **iPhone en Safari sin instalar:** no existe `PushManager`, así que se muestran las instrucciones de instalación y no un error. Se revisa a mano en la tarea 3.
- **Suscripción vencida (404/410):** se borra y el envío a las demás sigue. Lo cubre el código de la tarea 2.
- **Usuario desactivado:** no recibe push. Lo cubre la tarea 2.
- **Rutas sin sesión:** `sw.js`, `manifest.webmanifest` y `/api/push` no deben redirigir al login. Lo cubre la tarea 2 (proxy).

---

### Task 1: Modelo de datos y trigger

**Files:**
- Create: `supabase/migrations/20261113000200_notificaciones_push.sql`
- Test: `scripts/probar-sql-fases.mjs` (escenario nuevo al final)

**Interfaces:**
- Produces:
  - Tabla `suscripciones_push(endpoint text pk, usuario_id uuid → perfiles on delete cascade, p256dh text, auth text, created_at)`. RLS: `select` y `delete` solo de las propias; sin `insert` directo.
  - `guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text) returns void`: security definer, exige `es_usuario_activo()` y hace upsert por `endpoint` con `usuario_id = auth.uid()`.
  - Trigger `notificaciones_push`: con `net` y Vault disponibles, llama a `net.http_post(panel_url || '/api/push', {id}, Bearer panel_cron_secret)`.

- [ ] Escenario "Push: la suscripción es del último usuario que la activa y cada uno ve solo las suyas":
  - ASESORA guarda `https://push.test/1`.
  - OTRO guarda el mismo endpoint, y la fila pasa a ser de OTRO.
  - ASESORA ve 0 filas y OTRO ve 1.
  - Un usuario `anon` no puede llamar a la función.
  - Insertar en `notificaciones` sigue funcionando sin `pg_net`.
- [ ] Correr `npm run test:sql` y ver que falla (la función no existe).
- [ ] Escribir la migración: `create extension pg_net`, protegido con `pg_available_extensions`.
- [ ] Correr `npm run test:sql`: todos los escenarios en `ok`.

### Task 2: Envío del push en el servidor

**Files:**
- Create: `app/api/push/route.ts`
- Modify: `proxy.ts` (`RUTAS_PUBLICAS`), `.env.example`, `package.json` (`web-push`, `@types/web-push`)

**Interfaces:**
- Consumes: `notificaciones`, `suscripciones_push`, `perfiles.activo`.
- Produces: `POST /api/push` con el cuerpo `{ id: number }`. Envía al service worker el payload `{"titulo","cuerpo","enlace"}` con TTL de 86400 y urgencia `high`.

- [ ] Ruta:
  - Valida el Bearer.
  - Carga el aviso y el perfil con `crearClienteAdmin()`.
  - Si el perfil no está activo o faltan las claves VAPID, responde `{ ok: true, enviados: 0 }`.
  - Envía a cada suscripción y borra las que respondan 404 o 410.
- [ ] Agregar `/api/push`, `/sw.js` y `/manifest.webmanifest` a `RUTAS_PUBLICAS`.
- [ ] Ver que `npm run typecheck` y `npm run lint` pasan.

### Task 3: Dispositivo (PWA, service worker, activación y toast)

**Files:**
- Create: `app/manifest.ts`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png`, `app/apple-icon.png` (generados con `sharp` desde `app/icon.svg`), `components/avisos-dispositivo.tsx`
- Modify: `components/campana.tsx`, `app/(panel)/acciones-comunes.ts`

**Interfaces:**
- Consumes: `guardar_suscripcion_push` (tarea 1) y el payload de la tarea 2.
- Produces:
  - `guardarSuscripcionPush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<{ ok: boolean }>`, que valida un endpoint `https:` y claves no vacías.
  - `borrarSuscripcionPush(endpoint: string): Promise<void>`.

- [ ] `sw.js`:
  - `push`: `showNotification(titulo, { body, icon: '/icon-192.png', tag: enlace, renotify: true, data: { enlace } })`.
  - `notificationclick`: enfoca una ventana del panel y navega al enlace, o abre una nueva.
- [ ] `AvisosDispositivo`, con estos estados:
  - `ios-instalar`: iPhone o iPad sin `display-mode: standalone`.
  - `no-soportado`.
  - `denegado`.
  - `inactivo`.
  - `activo`.

  Al montarse registra `/sw.js` y, si ya hay suscripción y permiso, la vuelve a guardar. Activar pide el permiso desde un toque y luego suscribe y guarda; desactivar quita la suscripción y la borra.
- [ ] Campana: agregar `AvisosDispositivo` al pie del popover. En el callback de Realtime, mostrar `toast(titulo)` con la acción "Ver" cuando el permiso de notificaciones no es `granted`.
- [ ] Ver que `npm run typecheck`, `npm run lint` y `npm run build` pasan.

### Task 4: Documentación y commit

**Files:**
- Modify: `README.md` (sección "Notificaciones push": claves VAPID, Vault, cómo instalar en iPhone y Android), `CLAUDE.md` (una línea sobre push), `docs/especificacion.md` (cómo llegan las alertas)

- [ ] Escribir la documentación.
- [ ] Correr `graphify update .`.
- [ ] Commit: `Notificaciones push en celular y computadora`, con la spec y el plan.
