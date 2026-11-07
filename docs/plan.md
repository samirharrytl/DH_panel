# Plan de construcción y modelo de datos

Panel de seguimiento de DepaHost, fase 1 (HU-01 a HU-35). Este documento resume cómo está armado el
panel y qué guarda la base de datos. Los supuestos de negocio que no estaban en la especificación
están en [supuestos.md](supuestos.md).

## Arquitectura

| Pieza | Decisión |
| --- | --- |
| Front y servidor | Next.js 16 (App Router), TypeScript, Server Components y Server Actions |
| Estilos | Tailwind CSS 4, diseño responsive (celular primero) con los colores de marca de DepaHost |
| Datos | Supabase Postgres. El panel consulta como el usuario con sesión, así que las políticas RLS deciden qué ve cada uno |
| Lógica crítica | Funciones SQL (`registrar_lead`, `cambiar_estado_lead`, `agendar_visita`, `cerrar_compraventa`...) para que las reglas valgan también fuera del panel |
| Auth | Supabase Auth con correo y contraseña. Sin registro público: el administrador crea los usuarios |
| Archivos | Supabase Storage, buckets privados `inmuebles` (fotos) y `contratos` (escaneos) |
| WhatsApp | Módulo `lib/whatsapp` con dos modos: `simulado` (local, sin credenciales) y `meta` (Cloud API) |
| Tareas diarias | `/api/cron/diario` (Vercel Cron) pasa a "No responde" a quien terminó la cadencia. La misma función corre al abrir el panel |
| Zona horaria | America/Lima en SQL (`hoy_lima()`) y en la interfaz |

Caché de Next: `cacheComponents` desactivado. Todo el panel depende de la sesión y se renderiza en cada
petición.

## Fases y migraciones

Cada fase tiene su migración en `supabase/migrations/`.

| Fase | Historias | Migración |
| --- | --- | --- |
| 1. Base, auth, usuarios, parámetros y plantillas | HU-01 a HU-04 | `..._fase1_base.sql` |
| 2. Leads y seguimiento | HU-05 a HU-11 | `..._fase2_leads.sql` |
| 3. Propietarios, citas e inmuebles | HU-13 a HU-18 | `..._fase3_inmuebles.sql` |
| 4. Interesados y match | HU-19 a HU-27 | `..._fase4_match.sql` |
| 5. WhatsApp | HU-12 | `..._fase5_whatsapp.sql` |
| 6. Difusión e insights | HU-28 a HU-30 | `..._fase6_difusion.sql` |
| 7. Cierre, postventa y tablero | HU-31 a HU-35 | `..._fase7_cierre.sql` |

## Modelo de datos

### Fase 1

- **perfiles**: un registro por usuario de Supabase Auth. `nombre`, `email`, `rol` (administrador o
  asesor), `activo`. El administrador también trabaja como asesor.
- **parametros**: `clave`, `valor` y `valor_defecto` en JSON, con nombre, descripción y tipo para
  mostrarlos en la pantalla de configuración.
- **plantillas**: `clave`, `categoria`, `cuerpo` y `cuerpo_defecto`, con variables entre corchetes
  (`[nombre]`, `[inmueble]`...), y `meta_nombre` / `meta_idioma` para la plantilla aprobada en Meta.

### Fase 2

- **personas**: una por número de teléfono (`telefono` único, normalizado a `51XXXXXXXXX`). Guarda
  nombre, horario y medio de contacto preferidos, género solo si está confirmado, `no_contactar`
  (baja), `intencion` de postventa y `ultimo_entrante_at` (ventana de 24 horas).
- **leads**: un lead por persona y tipo (`propietario` o `interesado`) y por ciclo. `estado`, `canal`,
  `asesor_id`, consentimiento de datos y de marketing con fecha, `bienvenida_at`, `respondio_at`,
  `ultima_interaccion_at`, próxima acción manual y `vigente`. Solo un lead vigente por persona y
  tipo; un lead que regresa después del plazo abre un ciclo nuevo y conserva el historial.
- **lead_historial**: cada cambio de estado con estado anterior, nuevo, nota, autor y fecha (lo
  escribe un trigger, así no se puede saltar).
- **notas**, **eventos** (bitácora de todo lo que pasa: alimenta el historial de la ficha y el
  modelo predictivo) y **notificaciones** (alertas para cada usuario).
- **refuerzos**: la cadencia de cada lead, creada al enviar la bienvenida según el parámetro de días.
  Estado `pendiente`, `enviado` o `cancelado`.
- **mensajes**: todo el historial de WhatsApp de la persona, entrante y saliente, con estado de
  entrega y origen (`whatsapp`, `panel`, `manual`, `simulado`).

### Fase 3

- **calificacion_propietario**: los datos del Módulo 1.2 (rol, poder, hipoteca, inmueble, precio,
  urgencia, SUNARP, copropietarios).
- **inmuebles**: código `DH-0001`, propietario, asesor, estado (`en_captacion`, `en_cartera`,
  `vendido`, `retirado`), características, precio esperado y acordado, conservación y datos de
  acceso (llave, código, DNI, otros).
- **inmueble_fotos**: rutas en Storage.
- **contratos**: fecha de firma, exclusividad, plazo, vencimiento, comisión, autorización para
  publicar y copia escaneada opcional.
- **citas**: citas con propietarios y visitas de interesados en una sola tabla (`tipo`), con
  dirección, consideraciones de acceso, estado, reprogramaciones y marcas de confirmación y
  recordatorios enviados.

### Fase 4

- **busquedas**: perfil de búsqueda del interesado (Módulo 2.2).
- **capacidad_financiera**: presupuesto, forma de pago, cuota inicial, precalificación, Fondo
  MiVivienda, Techo Propio y `nivel` (`no_validada` < `declarada` < `precalificada` < `aprobada`).
- **derivaciones**: derivación a banco o bróker y estado de la evaluación. Al quedar precalificado o
  aprobado, sube el nivel.
- **match_envios** y **match_opciones**: cada envío (match o novedad), sus opciones (máximo según
  parámetro), el puntaje con su detalle y la respuesta.
- **visita_opiniones**: opinión del interesado tras la visita, ligada a la visita y al inmueble.
- **compraventas**: compraventa en curso y su cierre.

### Fases 6 y 7

- **publicaciones**: inmueble, red, fecha, código único para el enlace de WhatsApp, vistas e
  interacciones ingresadas a mano.
- **insights_resumenes**: resumen generado por inmueble y periodo, y su envío.
- **testimonios**: pedido de testimonio y reseña tras el cierre, con lo que dio el cliente y si
  autorizó su uso en redes.

## Seguridad (RLS)

- `es_admin()` y `es_usuario_activo()` son la base de todas las políticas. Un usuario desactivado no
  ve nada aunque tenga sesión, y además queda bloqueado en Supabase Auth.
- **Leads y todo lo que cuelga de ellos** (calificación, búsqueda, capacidad, citas, matches, notas,
  mensajes): el administrador ve todo; el asesor, solo lo de sus leads asignados. Solo el
  administrador cambia el asesor.
- **Inmuebles**: todos los usuarios activos ven la base (la necesitan para el match y las visitas);
  editan el administrador y el asesor del inmueble. Los contratos escaneados solo los ven el
  administrador y el asesor del inmueble.
- **Parámetros, plantillas y usuarios**: lectura para todos, edición solo para el administrador.
- El webhook de WhatsApp y el cron usan la clave secreta en el servidor, nunca en el navegador.

## Pantallas

| Ruta | Qué hace | Historias |
| --- | --- | --- |
| `/login`, `/recuperar`, `/restablecer` | Acceso y recuperación de contraseña | HU-01 |
| `/` | Hoy: pendientes del día (bienvenidas, refuerzos, citas, recordatorios, mensajes, contratos, novedades, insights, testimonios) | HU-08, HU-14, HU-17, HU-24, HU-30, HU-32 |
| `/leads` | Bandeja con filtros y orden por próxima acción | HU-07, HU-10 |
| `/leads/nuevo` | Registro de lead | HU-05, HU-06 |
| `/leads/[id]` | Ficha: estado, notas, cadencia, chat, calificación o perfil, citas, matches, cierre | HU-06, HU-08 a HU-16, HU-19 a HU-27, HU-31 a HU-33 |
| `/agenda` | Citas y visitas por día y asesor, agrupadas por distrito | HU-14, HU-26 |
| `/inmuebles`, `/inmuebles/[id]` | Base de propiedades y ficha del inmueble | HU-15 a HU-18, HU-29, HU-30 |
| `/difusion` | Sugerencia diaria y registro de publicaciones | HU-28, HU-29 |
| `/marketing` | Clientes por intención y novedades para leads sin respuesta | HU-33 |
| `/tablero` | Métricas del negocio y del piloto de match | HU-34, HU-35 |
| `/configuracion/*` | Usuarios, parámetros y plantillas | HU-02 a HU-04 |
