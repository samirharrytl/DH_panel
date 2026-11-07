# Historias de usuario del panel

Estas 35 historias describen lo que el panel debe hacer en la fase 1, agrupadas por módulo de la especificación. Cada una trae criterios de aceptación para probarla. Los roles son Administrador y Asesor; por ahora, la persona principal tiene ambos.

## Acceso, usuarios y configuración

| ID | Historia | Criterios de aceptación |
| --- | --- | --- |
| HU-01 | Como usuario, quiero iniciar sesión con mi correo y contraseña para entrar al panel desde el navegador. | Recuperación de contraseña por correo. La sesión se cierra tras un tiempo de inactividad. |
| HU-02 | Como administrador, quiero crear, desactivar y cambiar el rol de los usuarios para que cada persona tenga su propio acceso. | Roles: Administrador y Asesor. Un usuario desactivado no puede entrar, pero su historial se conserva. |
| HU-03 | Como administrador, quiero configurar los parámetros del sistema sin tocar el código. | Parámetros: días y cantidad de refuerzos, frecuencia de novedades, plazo del lead que regresa, frecuencia de insights, plazo para pedir testimonio, anticipación del aviso de vencimiento de contrato y nivel financiero exigido por paso. Cada parámetro muestra su valor por defecto. |
| HU-04 | Como administrador, quiero editar las plantillas de mensajes para mantener un tono uniforme. | Plantillas de bienvenida, refuerzos, novedades, recordatorios, insights y testimonio. Admiten variables como \[nombre\] e \[inmueble\]. |

## Leads y seguimiento

| ID | Historia | Criterios de aceptación |
| --- | --- | --- |
| HU-05 | Como asesor, quiero registrar un lead con nombre, teléfono, canal de origen y tipo (propietario o interesado) para empezar su seguimiento. | Si el teléfono ya existe, el lead se une al registro existente y se muestra su historial. Se registra el consentimiento para datos y marketing. |
| HU-06 | Como asesor, quiero ver dónde quedó el interés de un lead que regresa para retomar la conversación. | Dentro del plazo configurado, se muestra su último estado, inmueble o búsqueda y horario preferido. Pasado el plazo, se trata como nuevo, con su historial visible. |
| HU-07 | Como asesor, quiero una bandeja con mis leads, su estado, origen y próxima acción para saber a quién atender hoy. | Filtros por estado, tipo, canal y fecha. Orden por próxima acción. El administrador ve todos los leads. |
| HU-08 | Como asesor, quiero que la plataforma me recuerde cada refuerzo según la cadencia configurada para no perder seguimientos. | Si el lead responde, se cancelan los refuerzos pendientes. Tras el último refuerzo sin respuesta, el lead pasa a "No responde". |
| HU-09 | Como asesor, quiero cambiar el estado de un lead y dejar notas para que el historial refleje lo que pasó. | Cada cambio guarda fecha y autor. Los estados siguen el diagrama de la especificación. |
| HU-10 | Como administrador, quiero asignar leads a los asesores para repartir el trabajo. | Asignación manual. Cada asesor ve solo sus leads asignados. |
| HU-11 | Como asesor, quiero marcar a un lead como "Baja" cuando pide no ser contactado. | Un lead en Baja no aparece en recordatorios, novedades ni insights. |
| HU-12 | Como asesor, quiero chatear con el lead desde el panel y que la conversación quede en su ficha. | Depende de la integración con WhatsApp que se defina en infraestructura. Mientras tanto, el asesor registra a mano los mensajes clave. |

## Propietarios, citas e inmuebles

| ID | Historia | Criterios de aceptación |
| --- | --- | --- |
| HU-13 | Como asesor, quiero llenar la ficha de calificación del propietario para tener los datos antes de la cita. | Campos del Módulo 1.2 de la especificación. La ficha marca qué datos faltan. |
| HU-14 | Como asesor, quiero agendar una cita con dirección, fecha, hora y consideraciones de acceso para coordinarla con el propietario. | La cita aparece en la agenda del asesor. Recordatorios 24 horas antes y el mismo día. Se puede reprogramar o cancelar. |
| HU-15 | Como asesor, quiero registrar el resultado de la cita con fotos, estado del inmueble y precio acordado para crear la ficha del inmueble. | Se pueden subir varias fotos. El inmueble queda en estado "En captación". |
| HU-16 | Como asesor, quiero registrar el contrato firmado para que el inmueble pase a la base de propiedades y el propietario a Cliente. | Campos: exclusividad, plazo, comisión y autorización para publicar. Copia escaneada opcional. El inmueble pasa a "En cartera". |
| HU-17 | Como asesor, quiero que la plataforma me avise antes de que venza un contrato para renovarlo o retirar el inmueble. | La anticipación del aviso es un parámetro configurable. |
| HU-18 | Como asesor, quiero ver la base de propiedades con filtros para gestionarla. | Filtros por estado, distrito, tipo y precio. Estados: En captación, En cartera, Vendido y Retirado. |

## Interesados y match

| ID | Historia | Criterios de aceptación |
| --- | --- | --- |
| HU-19 | Como asesor, quiero registrar el perfil de búsqueda del interesado para que el motor de match encuentre inmuebles. | Campos del Módulo 2.2: finalidad, zonas, tipo, rango de precio, dormitorios, metraje e imprescindibles. |
| HU-20 | Como asesor, quiero registrar la capacidad financiera del interesado y su nivel para saber qué pasos habilita. | Niveles: no validada, declarada, precalificada y aprobada. La plataforma no permite agendar visita ni iniciar la compraventa si el nivel no alcanza el parámetro. |
| HU-21 | Como asesor, quiero registrar la derivación de un interesado a un banco o bróker y el estado de su evaluación. | Al confirmarse la precalificación, el nivel se actualiza. |
| HU-22 | Como asesor, quiero ver los inmuebles que hacen match con cada interesado, ordenados por ajuste, para enviarle hasta tres opciones. | Excluye inmuebles fuera de su capacidad y los que ya rechazó. Registra qué se envió y cuándo. |
| HU-23 | Como asesor, quiero registrar la respuesta a cada opción enviada para mejorar el match. | Respuestas: Me interesa, No me interesa y Ver parecidos. Quedan guardadas para el piloto. |
| HU-24 | Como asesor, quiero que la plataforma me avise cuando entra un inmueble que encaja con interesados activos para enviarles la novedad. | Respeta el tope de frecuencia y las bajas. |
| HU-25 | Como asesor, quiero priorizar el mejor inmueble cuando a un interesado le interesan varios. | Orden por ajuste al perfil, precio frente a capacidad y disponibilidad de visita. |
| HU-26 | Como asesor, quiero agendar visitas con los datos de acceso del inmueble y agruparlas por zona en un mismo día. | La visita toma llave, código y DNI de la ficha del inmueble. La agenda muestra las visitas del día agrupadas por distrito. |
| HU-27 | Como asesor, quiero registrar la opinión del interesado tras la visita para alimentar los insights del propietario. | La opinión queda asociada al inmueble y a la visita. |

## Difusión e insights

| ID | Historia | Criterios de aceptación |
| --- | --- | --- |
| HU-28 | Como asesor, quiero que la plataforma me sugiera cada día qué inmueble publicar para mantener la rotación. | Solo inmuebles con autorización. Prioriza los nuevos y los de menor interés. El asesor confirma y la publicación queda registrada con fecha y red. |
| HU-29 | Como asesor, quiero un enlace de WhatsApp único por publicación e inmueble para saber de dónde viene cada lead. | Un lead que llega por ese enlace queda asociado al inmueble y a la publicación. |
| HU-30 | Como asesor, quiero generar el resumen de insights de cada inmueble con la frecuencia configurada para enviárselo al propietario. | Incluye leads generados, veces enviado como match, porcentaje de "Me interesa", visitas, opiniones y precio frente a inmuebles similares. Las vistas en redes se ingresan a mano mientras no haya integración. |

## Cierre, postventa y tablero

| ID | Historia | Criterios de aceptación |
| --- | --- | --- |
| HU-31 | Como asesor, quiero registrar el cierre de una compraventa para que el inmueble pase a Vendido y el comprador a Cliente. | Campos: fecha, comprador, inmueble y comisión pagada. No existe estado de separación. |
| HU-32 | Como asesor, quiero que la plataforma me recuerde pedir testimonio y reseña tras el plazo configurado. | Se registra si se pidió, si el cliente lo dio y si autorizó su uso en redes. |
| HU-33 | Como asesor, quiero que los clientes sigan en la lista de marketing según su intención para mantener la relación. | Intención registrada en la ficha: invertir, comprar otro inmueble o vender. Respeta las bajas. |
| HU-34 | Como administrador, quiero un tablero con el estado del negocio para seguir el rendimiento. | Leads por etapa, leads sin respuesta, conversiones por etapa y métricas del piloto de match. |
| HU-35 | Como administrador, quiero ver la probabilidad estimada de firma de cada propietario para priorizar a quién atender. | Se activa cuando haya historial suficiente. Mientras tanto, el panel guarda todos los datos que necesitará el modelo. |

## Fase 2: lo que asumirá el bot

Estas funciones quedan fuera de la fase 1 y entran en este orden:

1. Bienvenida y refuerzos automáticos con las plantillas aprobadas
2. Publicación diaria automática en redes y en el Canal de WhatsApp
3. Conversación y calificación de leads, con traspaso al asesor cuando haga falta
