# Supuestos de negocio

Reglas que la especificación y las historias no fijan y que el panel necesitaba para funcionar. Las
que dependen de un número viven en la tabla de parámetros y el administrador las cambia desde
**Configuración → Parámetros**. Las demás se cambian en código; avísame si alguna no es así.

## Estados del lead

El diagrama de la especificación no venía en el documento. Se usa la propuesta aprobada el
2026-11-07:

| Embudo | Estados |
| --- | --- |
| Propietario | Nuevo → Contactado → En conversación → Cita agendada → Cita realizada → Cliente |
| Interesado | Nuevo → Contactado → En conversación → Calificado → Match enviado → Visita agendada → Visita realizada → Compraventa en curso → Cliente |
| Salidas | No responde · Descartado · Baja (desde cualquier estado antes de Cliente) |

- Algunos estados solo se alcanzan con su acción, para que el dato quede completo: **Cita agendada** y
  **Visita agendada** al agendar, **Compraventa en curso** al iniciarla (con el nivel financiero
  exigido), **Cliente** al registrar el contrato (propietario) o el cierre (interesado). Los demás se
  pueden cambiar a mano, hacia adelante o hacia atrás, con nota.
- Las acciones avanzan el estado solas (enviar bienvenida → Contactado, responder → En conversación,
  perfil y capacidad completos → Calificado, etc.), pero nunca lo retroceden.
- **No responde**: el lead pasa a este estado al día siguiente del último refuerzo enviado si no
  respondió. Si escribe después, vuelve a En conversación.
- **Baja** aplica a la persona: se pasan a Baja todos sus leads abiertos y no se le envía nada más.
  Solo se reactiva si la persona lo pide, y queda registrado.
- Si se cancela una cita o visita y el lead no tiene otra programada, vuelve al estado que tenía
  antes de agendarla.

## Leads

- Un lead que registra un asesor queda asignado a él (si no, no lo vería). El administrador puede
  asignarlo a quien quiera. Los que llegan solos por WhatsApp quedan sin asignar y se avisa al
  administrador.
- Si el teléfono ya existe y el lead lo lleva otro asesor, se une al registro existente, se queda con
  su asesor (la especificación pide que vuelva con el mismo) y se le avisa a ese asesor.
- Lead que regresa dentro del plazo: vuelve al estado donde quedó antes de salir (o a En
  conversación). Pasado el plazo: se abre un ciclo nuevo con el mismo asesor y el historial anterior
  visible. Un Cliente que vuelve siempre abre un ciclo nuevo.
- Un mensaje de un número desconocido queda en el chat de esa persona, sin lead, y se avisa al
  administrador para que lo registre eligiendo el tipo. Si el mensaje trae el código de una
  publicación, se crea directamente un lead interesado asociado al inmueble y a la publicación.

## Mensajes

- En la fase 1 el asesor envía bienvenida, refuerzos, recordatorios, novedades, insights y pedidos de
  testimonio con un clic desde el panel; la plataforma solo le recuerda cuándo. El envío automático
  es del bot (fase 2).
- Las novedades a interesados activos no exigen consentimiento de marketing, porque responden a la
  búsqueda que pidieron; sí respetan las bajas, el tope de frecuencia y la opción "no recibir
  novedades". Las novedades a leads en No responde y el marketing de postventa sí exigen
  consentimiento de marketing.
- Fuera de la ventana de 24 horas solo se envían plantillas que tengan configurado su nombre aprobado
  en Meta. En modo simulado se aplica la misma regla.

## Match y priorización

- Filtros obligatorios: inmueble En cartera, precio dentro del presupuesto máximo (si está
  registrado), tipo buscado (si lo indicó) y que no lo haya rechazado antes.
- Puntaje de 0 a 100: zona 30, precio dentro del rango 25, dormitorios 15, metraje 10,
  imprescindibles 20. Suma 5 puntos si se parece (mismo distrito y tipo) a un inmueble que le
  interesó y resta 5 si se parece a uno que rechazó.
- Novedades: se avisa cuando un inmueble En cartera encaja con 50 puntos o más con un interesado
  activo que aún no lo recibió.
- Priorización entre varios "Me interesa": 50 % ajuste al perfil, 30 % precio frente al presupuesto
  (más holgura, mejor), 20 % disponibilidad de visita (el inmueble tiene llave o código registrado).

## Valores por defecto que no estaban en los documentos

| Parámetro | Valor |
| --- | --- |
| Cierre de sesión por inactividad | 30 minutos |
| Aviso antes del vencimiento del contrato | 30 días |
| Tope de novedades a un interesado activo | una cada 7 días |
| Máximo de opciones por envío de match | 3 (la especificación lo marca como propuesta) |
| Redes de difusión diaria | Facebook, Instagram, TikTok y Canal de WhatsApp |

## Otros

- Los precios se manejan en soles (S/), como en el sitio de DepaHost.
- El contrato vence en la fecha de firma más el plazo en meses. Renovar registra un contrato nuevo.
- Precio frente a similares: precio por m² del inmueble contra el promedio de los inmuebles del mismo
  distrito y tipo en la base (En cartera o Vendido).
- Probabilidad de firma (HU-35): el modelo no se calcula en la fase 1. El tablero muestra cuántos datos
  hay y permite exportarlos para entrenarlo después.
