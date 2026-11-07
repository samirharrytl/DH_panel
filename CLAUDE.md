# Panel de seguimiento DepaHost

Panel web interno de DepaHost (inmobiliaria en Perú, solo compraventas) para hacer seguimiento a dos tipos de lead: propietarios que quieren vender (captación) e interesados que quieren comprar. Cubre desde el primer contacto hasta el cierre y la postventa.

Usuarios: una persona principal (roles Administrador y Asesor a la vez) y hasta un par de asesores adicionales.

## Documentos fuente

- Especificación funcional: @docs/especificacion.md
- Historias de usuario HU-01 a HU-35, con criterios de aceptación: @docs/historias-de-usuario.md

Si una regla de negocio no está en estos documentos, pregunta antes de inventarla.

## Stack

- Next.js (App Router) con TypeScript, desplegado en Vercel
- Supabase: Postgres, Auth con correo y contraseña, Storage para fotos de inmuebles y contratos escaneados
- Tailwind CSS
- Interfaz en español (Perú), usable desde el celular
- Fechas y recordatorios en la zona horaria America/Lima

## WhatsApp

- API oficial de WhatsApp Cloud (Meta), conexión directa, con número dedicado: ese número no se usa en la app del celular y todo el chat pasa por el panel.
- El número (nuevo o el actual) está por definir antes de producción.
- Aún no hay credenciales de producción. Desarrolla contra el número de prueba de Meta y aísla la integración en un módulo propio (`lib/whatsapp`) con un modo simulado para trabajar en local sin credenciales.
- Mensajes entrantes por webhook; cada mensaje entrante y saliente se guarda en el historial del lead.
- Pasadas 24 horas desde el último mensaje del cliente, solo se envían plantillas aprobadas por Meta.

## Secretos

- Nunca escribas claves en el código, en el repositorio ni en el chat.
- Variables de entorno en `.env.local` (ignorado por git) y en Vercel. Mantén un `.env.example` con los nombres y sin valores.
- WhatsApp: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.

## Reglas de negocio clave

- Roles: Administrador y Asesor. El asesor ve solo sus leads asignados; la asignación es manual.
- Todo valor configurable vive en una tabla de parámetros editable por el administrador (HU-03). Valores por defecto:
  - Refuerzos: Días 1, 3 y 4 (el Día 0 es la bienvenida)
  - Novedades a leads sin respuesta: una vez al mes
  - Plazo para retomar a un lead que regresa: 6 meses
  - Insights al propietario: semanal
  - Pedido de testimonio: 7 días después del cierre
  - Nivel financiero mínimo: "declarada" para visitar, "precalificada" para iniciar la compraventa
- Un número de teléfono identifica a una persona; puede ser propietario e interesado a la vez.
- No existe la separación del inmueble. No hay alquileres.
- Cada cambio de estado se registra con fecha y autor.
- Un lead en Baja nunca recibe mensajes.
- El consentimiento para datos y marketing (Ley 29733) se registra por lead.
- Guarda cada evento del match (envío, respuesta, visita, resultado): alimentará el modelo predictivo futuro.

## Fuera de alcance en la fase 1

Bot conversacional, publicación automática en redes, firma virtual, reparto de comisión, alquileres y el modelo predictivo (por ahora solo se guardan sus datos).

## Forma de trabajo

Construye por fases, en este orden:

1. Base del proyecto, autenticación, usuarios, parámetros y plantillas (HU-01 a HU-04)
2. Leads y seguimiento (HU-05 a HU-11)
3. Propietarios, citas e inmuebles (HU-13 a HU-18)
4. Interesados y match (HU-19 a HU-27)
5. Integración con WhatsApp (HU-12)
6. Difusión e insights (HU-28 a HU-30)
7. Cierre, postventa y tablero (HU-31 a HU-35)

En cada fase:

- Propón el plan y los cambios al modelo de datos antes de escribir código.
- Versiona las migraciones de base de datos en el repositorio.
- Aplica políticas de seguridad por fila (RLS) de Supabase según el rol.
- Al terminar una historia, verifica sus criterios de aceptación y haz commit con su ID, por ejemplo: `HU-07: bandeja de leads`.
