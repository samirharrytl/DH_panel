# Especificación del sistema de seguimiento – DepaHost

Nov 7, 2026 · @Samir Huamán

## Objetivo y alcance

El sistema de seguimiento es una plataforma a la que el equipo de DepaHost ingresa para seguir a propietarios e interesados, desde el primer contacto hasta el cierre y la postventa. En esta primera fase, una persona de DepaHost maneja el seguimiento desde la plataforma, y puede haber un par de usuarios adicionales; más adelante un bot podrá asumir parte del trabajo.

El bot entrará por etapas: primero la bienvenida y los refuerzos, luego la publicación diaria en redes y, por último, la conversación y la calificación.

La plataforma reúne seis módulos, que se operan desde un mismo panel:

1. Captación de propietarios
2. Interesados (compradores)
3. Difusión en redes y Canal de WhatsApp
4. Motor de match
5. Insights al propietario
6. Cierre y postventa

### Glosario

| Término | Definición |
| --- | --- |
| Lead | Persona que dejó sus datos o su intención en un canal y aún no es cliente |
| Propietario | Dueño del inmueble, o su encargado, que quiere vender |
| Encargado | Persona que gestiona el inmueble en nombre del dueño |
| Interesado | Persona que quiere comprar un inmueble |
| Asesor | Persona de DepaHost que lleva el seguimiento: bienvenida, chat, publicaciones, citas, visitas y cierres. Por ahora es una persona principal, y puede haber un par de usuarios adicionales |
| Cliente | Propietario que firmó contrato con DepaHost, o interesado que cerró una compraventa |
| Base de propiedades | Inmuebles con contrato firmado, disponibles para match y difusión |
| Bot | Agente automático previsto para una fase posterior: publicará en redes, dará la bienvenida y conversará por WhatsApp |

## Plataforma de seguimiento

La persona responsable del seguimiento ingresa con su usuario y ve en un solo lugar el estado de cada lead, inmueble, cita y visita. Esa persona tiene los roles de administrador y asesor, y la plataforma admite un par de usuarios adicionales, cada uno con su propio acceso. Los usuarios adicionales tienen rol de asesor y ven los leads que se les asignan; por ahora, la asignación es manual desde el rol administrador.

### Accesos y roles

| Rol | Qué ve y qué hace |
| --- | --- |
| Administrador | Todo: mensajes y cadencias, asignación de asesores, métricas del piloto de match |
| Asesor | Sus leads, su agenda y las fichas de inmuebles; da la bienvenida y lleva el chat con cada lead |
| Propietario (por definir) | Los insights de su inmueble, si se le da acceso en vez de recibirlos por WhatsApp |

### Vistas principales

- **Bandeja de leads:** propietarios e interesados con estado, origen, asesor y próxima acción; filtros por estado, canal y fecha.
- **Ficha del lead:** datos de calificación, historial completo de WhatsApp, citas, matches enviados y respuestas.
- **Agenda:** citas con propietarios y visitas de interesados, por asesor y por día, con dirección y consideraciones de acceso.
- **Base de propiedades:** ficha de cada inmueble con fotos, estado, contrato e interés acumulado.
- **Tablero:** leads por etapa, leads sin respuesta, conversiones y métricas del piloto de match.

### Seguimiento

- Cada lead muestra su próxima acción y su fecha: refuerzo, cita, visita o envío de novedades.
- El asesor recibe alertas de leads nuevos, mensajes, citas agendadas o reprogramadas y refuerzos pendientes, en la campana del panel y como notificación push en el celular o la computadora, aunque el panel esté cerrado.
- El asesor chatea con el lead desde la plataforma, y toda la conversación queda en el historial de su ficha.
- Cada cambio de estado queda registrado con fecha y autor.

Queda resuelto si se ingresa a un panel web propio o a otro sistema: será un panel web propio de DepaHost, construido a partir de esta especificación.

## Módulo 1: Captación de propietarios

El propietario pasa de lead a cliente cuando firma el contrato, y en ese momento su inmueble entra a la base de propiedades.

### 1.1 Bienvenida

- La envía el asesor en cuanto entra el lead, idealmente en minutos; la plataforma le avisa de cada lead nuevo.
- Mensaje base: "Hola \[nombre\], vemos que dejaste tu intención en uno de nuestros canales."
- Se personaliza con el canal de origen y, si lo hay, el inmueble mencionado.

### 1.2 Conversación y calificación

Antes de agendar la cita, el asesor recaba estos datos y los registra en la ficha del lead:

| Dato | Para qué sirve |
| --- | --- |
| Rol: propietario o encargado | Saber quién firma el contrato |
| Si es encargado: poder o autorización para firmar | Evitar citas sin firmante |
| Hipoteca: sí o no, banco y saldo pendiente | Anticipar los plazos de la venta |
| Tipo de inmueble, dirección y distrito | Ficha de la propiedad y agenda de la cita |
| Metraje, dormitorios, baños, cochera | Ficha de la propiedad y match |
| Precio esperado | Comparar con inmuebles similares |
| Urgencia o plazo | Priorizar el lead |
| Situación legal: inscripción en SUNARP y copropietarios | Detectar trabas antes del contrato |
| Preferencia de contacto: llamada por WhatsApp o al celular, y horario | Contactarlo por el medio que prefiere |

### 1.3 Refuerzos si no responde

Si el lead no responde a la bienvenida (Día 0), recibe refuerzos, cada uno distinto. Los días y la cantidad de refuerzos son parámetros que el administrador configura; por defecto, los Días 1, 3 y 4. La plataforma le recuerda al asesor cuándo enviar cada uno:

| Día | Objetivo | Ejemplo |
| --- | --- | --- |
| 0 | Bienvenida (ver 1.1) | Mensaje de bienvenida |
| 1 | Recordar sin presionar | "Hola \[nombre\], te escribimos ayer y no pudimos encontrarte. Sé que tienes el día lleno." |
| 3 | Aportar valor | Cómo ayuda DepaHost a vender en su distrito |
| 4 | Último intento, puerta abierta | "Te dejamos este mensaje por si quieres retomarlo cuando te acomode." |

- Si responde en cualquier momento, sale de la cadencia y vuelve a la conversación.
- Los mensajes son neutros en género, salvo que ese dato esté confirmado.
- Sin respuesta tras el último refuerzo, el lead pasa a "No responde" y sale del seguimiento diario. Sigue recibiendo novedades con una frecuencia configurable (por defecto, una vez al mes), solo si aceptó recibir marketing.

### 1.4 Agenda de la cita

- La cita se agenda directamente desde WhatsApp; no hace falta pasar por una llamada.
- Opcionalmente, el asesor pregunta si prefiere que lo llamen por WhatsApp o al celular.
- La cita muestra la dirección del inmueble, la fecha, la hora y las consideraciones de acceso: llave, código, DNI u otras.
- Al agendar se envía una confirmación, y luego recordatorios 24 horas antes y el mismo día (propuesta).
- El propietario puede reprogramar o cancelar desde el mismo WhatsApp.
- El asesor ve las mismas consideraciones de acceso en su ficha.

### 1.5 Citas con el propietario y contrato

- Hay una o dos citas: la primera para conocer el inmueble y la segunda, si hace falta, para dejar listo el contrato.
- Tras la primera cita se registran fotos, estado del inmueble y precio acordado.
- El contrato se firma en físico y luego se registra en la plataforma con sus datos: exclusividad, plazo, comisión y autorización para publicar.
- Al firmar, el lead pasa a Cliente y el inmueble entra a la base de propiedades.
- La plataforma avisa antes de que venza el plazo del contrato, para renovarlo o retirar el inmueble (propuesta).

## Módulo 2: Interesados

El interesado recibe inmuebles que encajan con su búsqueda y su capacidad de pago, y agenda visita cuando uno en concreto le interesa.

### 2.1 Bienvenida y lead que regresa

- Un lead nuevo recibe la bienvenida y, si no responde, la misma cadencia de refuerzos del Módulo 1 (por confirmar).
- Un lead que ya había dejado sus datos se identifica por su número y se une a su historial. Si escribe dentro de un plazo configurable (por defecto, 6 meses), se retoma la conversación donde quedó; si escribe después, se trata como nuevo, pero conserva su historial.
- El asesor le pregunta dónde quedó su interés, por dónde seguir la conversación y en qué horario prefiere que le escriban.
- Ejemplo: "Hola \[nombre\], la última vez conversamos sobre \[inmueble o búsqueda\]. ¿Seguimos por ahí o buscas algo distinto? ¿En qué horario te escribimos?"
- Si ya tenía asesor asignado, vuelve con el mismo.

### 2.2 Perfil de búsqueda

El perfil es la base del match y contiene:

- Finalidad: vivir o invertir
- Zonas o distritos
- Tipo de inmueble
- Rango de precio
- Dormitorios y metraje
- Imprescindibles: cochera, ascensor, mascotas u otros

### 2.3 Capacidad financiera

Saber si el interesado tiene dinero suficiente para comprar es requisito central, y el trámite avanza según cómo va a pagar.

El asesor pregunta por el presupuesto máximo, la forma de pago (contado, crédito o mixto), la cuota inicial disponible, si tiene precalificación bancaria y si aplica a Fondo MiVivienda o Techo Propio.

| Nivel | Significa | Qué habilita (por defecto) |
| --- | --- | --- |
| No validada | Aún no hay datos de pago | Solo contenido general |
| Declarada | Indicó presupuesto y forma de pago | Recibir matches y agendar visita |
| Precalificada | Tiene evaluación o carta del banco | Iniciar la compraventa |
| Aprobada | Crédito aprobado o fondos verificados | Iniciar la compraventa |

El nivel exigido para cada paso es un parámetro configurable. Por defecto, basta la capacidad declarada para visitar, y la compraventa exige capacidad precalificada o aprobada.

- Pago al contado: avanza directo.
- Crédito sin precalificación: se deriva a un banco o bróker aliado, y la plataforma registra la derivación y el estado de su evaluación. Aún no hay socios definidos.

### 2.4 Envío de matches y novedades

- El asesor envía los inmuebles que sugiere el motor de match: "Tengo estos, que hacen match con lo que buscas."
- Máximo tres opciones por envío (propuesta), cada una con fotos, precio y zona.
- Cada opción tiene respuestas rápidas: "Me interesa", "No me interesa" y "Ver parecidos". Se guardan como feedback del match.
- Según va respondiendo, recibe novedades: inmuebles nuevos que entran a la base y encajan con su perfil y su capacidad.
- Las novedades tienen un tope de frecuencia y opción de darse de baja.

### 2.5 Priorización

- Si le interesan varias opciones, el sistema prioriza el mejor inmueble según ajuste al perfil, precio frente a capacidad y disponibilidad de visita.
- Propuesta: agrupar las visitas por zona en un mismo día.

### 2.6 Visita al inmueble

- Se agenda cuando el interesado ya quiere un inmueble específico.
- Solo asisten los intermediarios; el propietario no va.
- El asesor usa los datos de acceso registrados en la captación: llave, código, DNI.
- Tras la visita se pide la opinión del interesado, que alimenta los insights del propietario.

## Módulo 3: Difusión en redes y Canal de WhatsApp

Por ahora, la persona responsable publica a diario las propiedades de la base en redes sociales y en el Canal de WhatsApp de DepaHost; más adelante lo hará un bot.

- Frecuencia: diaria.
- Canales: todas las redes sociales donde DepaHost tenga presencia, y el Canal de WhatsApp.
- Cada publicación lleva fotos, tipo de inmueble, zona, precio, características principales y un enlace a WhatsApp.
- Se muestra la zona, nunca la dirección exacta.
- Solo se publican inmuebles cuyo propietario lo autorizó en el contrato.
- La plataforma sugiere el inmueble de cada día de forma rotativa, con prioridad para los nuevos y los que han generado menos interés; la persona responsable confirma la publicación.
- Cuando se automatice, por definir si hay revisión humana antes de publicar.
- Cada enlace identifica la publicación y el inmueble de origen. Así se atribuye cada lead y se mide el interés por propiedad.

## Módulo 4: Motor de match

El motor trabaja con parámetros y se pilotean dos metodologías en paralelo para ir mejorando el match.

| Metodología | Qué hace | Parámetros | Cuándo arranca |
| --- | --- | --- | --- |
| Cruce inmueble–interesado | Envía a cada interesado los inmuebles que encajan con su perfil | Operación, zona, tipo, precio frente a capacidad, dormitorios, imprescindibles | Desde el inicio, con reglas |
| Predicción sobre propietarios | Estima qué leads propietarios tienen más probabilidad de firmar contrato | Rol, hipoteca, urgencia, precio frente a la zona, respuesta a los mensajes | Cuando haya historial suficiente |

- Desde el primer día se registra cada envío, respuesta, visita y resultado. Ese historial entrena la parte predictiva.
- Las respuestas "Me interesa", "No me interesa" y "Ver parecidos" ajustan el cruce de cada interesado.
- La predicción sirve para priorizar los leads con más probabilidad de firmar.
- Métricas del piloto: porcentaje de "Me interesa" por envío, visitas por match enviado, cierres, y acierto de la predicción frente a las firmas reales.

## Módulo 5: Insights al propietario

DepaHost informa a cada propietario cuánto interés está generando su inmueble, con datos que el sistema ya registra en los otros módulos.

| Indicador | De dónde sale |
| --- | --- |
| Vistas e interacciones de las publicaciones | Módulo 3 |
| Leads generados por su inmueble | Enlaces con atribución, Módulo 3 |
| Veces enviado como match y porcentaje de "Me interesa" | Módulo 4 |
| Visitas agendadas y realizadas | Módulo 2 |
| Opinión de quienes visitaron | Consulta tras la visita, Módulo 2 |
| Precio frente a inmuebles similares de la zona | Base de propiedades |

Se envía un resumen por WhatsApp con frecuencia configurable; por defecto, semanal.

## Módulo 6: Cierre y postventa

La compraventa se hace con acompañamiento de DepaHost y, una vez cerrada, se paga la comisión a los intermediarios.

### 6.1 Cierre

- No se permite separar el inmueble: no hay reservas ni pagos de separación antes de la compraventa.
- Un asesor de DepaHost acompaña la firma de la compraventa.
- Tras la transacción, se paga la comisión a los intermediarios.
- El inmueble sale de la base de propiedades como vendido.

### 6.2 Postventa

- Se sigue enviando marketing a quien compró y a quien vendió.
- El marketing es el mismo en ambos casos; lo que lo define es la intención del cliente, por ejemplo invertir, comprar otro inmueble o vender.
- Se pide testimonio y reseña para generar respaldo a la marca.
- Se piden por WhatsApp unos días después del cierre (plazo configurable; por defecto, 7 días), con un enlace directo para dejar la reseña en Google. También se pide permiso para usar el testimonio en redes, y la plataforma registra si se pidió y si el cliente lo dio.

## Estados del lead y del inmueble

&#91;embedded content: estados del lead · 2 embudos, 1 postventa\]

El contrato del propietario mete su inmueble en la base, que alimenta los matches del interesado; ambos terminan como clientes en postventa.

Desde cualquier estado previo al cierre, un lead puede salir a:

- **No responde:** sin respuesta tras el último refuerzo
- **Descartado:** no califica o no le interesa
- **Baja:** pidió no ser contactado

El inmueble pasa por estos estados:

1. En captación: el propietario aún no firma
2. En cartera: contrato firmado; se publica y entra al match
3. Vendido: compraventa cerrada
4. Retirado: el propietario lo saca o vence el contrato

## Reglas transversales

Estas reglas aplican a todos los módulos.

- **Ventana de WhatsApp:** pasadas 24 horas desde el último mensaje del cliente, solo se le escribe con plantillas aprobadas por Meta. Aplica a refuerzos, novedades, recordatorios e insights.
- **Bajas:** si alguien pide no ser contactado, se detienen todos los envíos de inmediato.
- **Consentimiento:** el lead acepta el uso de sus datos y el envío de marketing, conforme a la Ley 29733 de Protección de Datos Personales.
- **Una persona, un registro:** el número de teléfono identifica a la persona; alguien puede ser propietario e interesado a la vez.
- **Horarios:** se respeta el horario preferido del lead.
- **Mensajes:** personalizados con el nombre y neutros en género.
- **Registro:** cada mensaje, respuesta, cita, visita y resultado queda guardado con fecha. Alimenta los insights y el modelo predictivo.

## Puntos pendientes

Todas las decisiones están tomadas; solo queda conseguir un banco o bróker aliado.

- [x] Definir en qué fase entra el bot y qué pasos asume: publicación, bienvenida, chat, calificación o agenda
- [x] Definir si el Día 0 es la bienvenida misma o un segundo mensaje ese día
- [x] Definir qué pasa con un lead tras el último refuerzo sin respuesta
- [x] Fijar el nivel mínimo de capacidad financiera para agendar una visita
- [x] Definir qué rol tienen los usuarios adicionales y cómo se reparten los leads entre ellos
- [x] Elegir las redes donde se publica a diario
- [x] Cerrar las condiciones del contrato: exclusividad, plazo, comisión y autorización para publicar
- [x] Definir frecuencia y canal de los insights
- [x] Fijar desde cuánto tiempo un lead que regresa se trata como nuevo
- [x] Definir cuándo y dónde se piden testimonios y reseñas
- [ ] Conseguir un banco o bróker aliado para interesados con crédito (aún no hay socios)

Fuera de alcance por ahora: firma virtual del contrato y reparto de la comisión entre intermediarios. DepaHost no gestiona alquileres, solo compraventas.

Historias de usuario para construir el panel: Historias de usuario
