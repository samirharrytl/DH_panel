// Guías interactivas del panel: cada paso dice en qué pantalla se hace y qué elemento señalar.
// Los nombres entre «» son los botones y pestañas tal como se ven en pantalla.

export type Donde = {
  // Ruta del panel; `:id` vale por cualquier ficha (lead o inmueble)
  ruta: string
  // Pestaña de la ficha del lead (parámetro ?tab=). Sin indicar: cualquiera
  tab?: string
}

export type Paso = {
  capitulo: string
  titulo: string
  texto: string
  donde: Donde
  // Valor de data-guia del elemento que se resalta
  objetivo?: string
  // Qué hacer dentro del diálogo que abre el paso: se muestra dentro del diálogo cuyo título empieza así
  dialogo?: { titulo: string; texto: string }
  // En pasos sobre una ficha: qué ficha abrir si aún no se está en una
  abre?: string
}

export type ClaveGuia = 'leads' | 'inmuebles'
export type Guia = { titulo: string; descripcion: string; pasos: Paso[] }

const HOY: Donde = { ruta: '/' }
const fichaLead = (tab?: string): Donde => ({ ruta: '/leads/:id', tab })
const FICHA_INMUEBLE: Donde = { ruta: '/inmuebles/:id' }

const UN_LEAD = 'Abre la ficha de un lead desde la bandeja.'
const UN_PROPIETARIO = 'Abre la ficha de un lead de tipo Propietario.'
const UN_INTERESADO = 'Abre la ficha de un lead de tipo Interesado.'
const UN_CLIENTE = 'Abre la ficha de un lead en estado Cliente.'
const UN_INMUEBLE = 'Abre la ficha de un inmueble desde la base de propiedades.'
const UN_INMUEBLE_EN_CARTERA = 'Abre la ficha de un inmueble En cartera.'

const LEADS: Paso[] = [
  {
    capitulo: 'Cada día',
    titulo: 'Empieza por la página Hoy',
    texto:
      'En «Atiende primero» están los leads con una acción pendiente, con la más atrasada arriba. Toca «Abrir» para ir a la ficha de cada uno.',
    donde: HOY,
    objetivo: 'hoy-atiende',
  },
  {
    capitulo: 'Cada día',
    titulo: 'Revisa las citas y visitas del día',
    texto: 'Aquí ves lo agendado para hoy. Más abajo están las confirmaciones y recordatorios que faltan enviar.',
    donde: HOY,
    objetivo: 'hoy-citas',
  },
  {
    capitulo: 'Cada día',
    titulo: 'Responde los chats sin leer',
    texto:
      'El número junto a Chats en el menú indica cuántos mensajes de clientes faltan leer. Abre cada conversación y responde desde aquí.',
    donde: { ruta: '/chats' },
  },
  {
    capitulo: 'Cada día',
    titulo: 'Busca a alguien en la bandeja',
    texto:
      'Busca por nombre o teléfono y filtra por estado, tipo, canal y fecha. La bandeja muestra los leads activos ordenados por próxima acción.',
    donde: { ruta: '/leads' },
    objetivo: 'leads-filtros',
  },
  {
    capitulo: 'Registrar y dar la bienvenida',
    titulo: 'Registra el lead apenas entra',
    texto: 'Toca «Registrar lead».',
    donde: { ruta: '/leads' },
    objetivo: 'leads-registrar',
  },
  {
    capitulo: 'Registrar y dar la bienvenida',
    titulo: 'Llena sus datos',
    texto:
      'Teléfono, nombre, tipo (propietario o interesado) y canal de origen. Marca el consentimiento que haya dado y toca «Registrar lead». Si el teléfono ya existe, se une a su registro.',
    donde: { ruta: '/leads/nuevo' },
    objetivo: 'lead-form',
  },
  {
    capitulo: 'Registrar y dar la bienvenida',
    titulo: 'Envía la bienvenida',
    texto: 'Toca «Enviar bienvenida» (Día 0). Al enviarla se programan los refuerzos.',
    donde: fichaLead('resumen'),
    objetivo: 'lead-seguimiento',
    abre: UN_LEAD,
  },
  {
    capitulo: 'Registrar y dar la bienvenida',
    titulo: 'Si no responde, envía los refuerzos',
    texto:
      'Cada refuerzo aparece aquí en su día: toca «Enviar refuerzo». Tras el último sin respuesta, el lead pasa solo a No responde. Si respondió por llamada u otro medio, toca «Respondió por otro medio».',
    donde: fichaLead('resumen'),
    objetivo: 'lead-seguimiento',
    abre: UN_LEAD,
  },
  {
    capitulo: 'Registrar y dar la bienvenida',
    titulo: 'Conversa por el chat',
    texto:
      'Escribe aquí y la conversación queda en la ficha. Pasadas 24 horas desde su último mensaje, solo se pueden enviar plantillas.',
    donde: fichaLead('chat'),
    abre: UN_LEAD,
  },
  {
    capitulo: 'Registrar y dar la bienvenida',
    titulo: 'Completa su contacto',
    texto: 'Con «Editar», anota el horario preferido y el medio por el que prefiere que lo contacten.',
    donde: fichaLead('resumen'),
    objetivo: 'lead-contacto',
    dialogo: {
      titulo: 'Datos de contacto',
      texto: 'Llena el horario preferido y el medio de contacto, y toca «Guardar».',
    },
    abre: UN_LEAD,
  },
  {
    capitulo: 'Registrar y dar la bienvenida',
    titulo: 'Deja notas de lo que pasó',
    texto:
      'Escribe qué pasó o qué acordaron y toca «Agregar nota». Si quedaste en hacer algo en una fecha, usa «Programar acción» en Seguimiento: aparecerá en Hoy ese día.',
    donde: fichaLead('resumen'),
    objetivo: 'lead-notas',
    abre: UN_LEAD,
  },
  {
    capitulo: 'Propietario: de la calificación al contrato',
    titulo: 'Llena la calificación',
    texto:
      'Rol, hipoteca, datos del inmueble, precio esperado, urgencia y situación legal. Los campos pendientes llevan la marca «Falta». Toca «Guardar calificación».',
    donde: fichaLead('calificacion'),
    objetivo: 'lead-calificacion',
    abre: UN_PROPIETARIO,
  },
  {
    capitulo: 'Propietario: de la calificación al contrato',
    titulo: 'Agenda la cita',
    texto: 'Toca «+ Agendar cita». El lead pasa a Cita agendada y la cita aparece en la Agenda.',
    donde: fichaLead('citas'),
    objetivo: 'lead-citas',
    dialogo: {
      titulo: 'Agendar cita',
      texto: 'Llena fecha y hora, dirección y las consideraciones de acceso (llave, código, DNI), y toca «Agendar».',
    },
    abre: UN_PROPIETARIO,
  },
  {
    capitulo: 'Propietario: de la calificación al contrato',
    titulo: 'Envía la confirmación y los recordatorios',
    texto:
      'En la cita, toca «Enviar confirmación»; luego «Recordatorio 24 h» y «Recordatorio de hoy» cuando toquen. Si cambian los planes, usa «Reprogramar» o «Cancelar».',
    donde: fichaLead('citas'),
    objetivo: 'lead-citas',
    abre: UN_PROPIETARIO,
  },
  {
    capitulo: 'Propietario: de la calificación al contrato',
    titulo: 'Registra el resultado de la cita',
    texto: 'Después de la cita, toca «Registrar resultado». Con eso se crea la ficha del inmueble, En captación.',
    donde: fichaLead('citas'),
    objetivo: 'lead-citas',
    dialogo: {
      titulo: 'Resultado de la cita',
      texto:
        'Anota cómo fue la cita, el estado del inmueble, el precio acordado y sus características, y toca «Guardar y crear ficha del inmueble».',
    },
    abre: UN_PROPIETARIO,
  },
  {
    capitulo: 'Propietario: de la calificación al contrato',
    titulo: 'Cuando firme, registra el contrato',
    texto:
      'Abre la ficha del inmueble desde aquí y toca «Registrar contrato». El propietario pasa a Cliente y el inmueble a En cartera. La guía de inmuebles sigue desde ahí.',
    donde: fichaLead('citas'),
    objetivo: 'lead-inmueble',
    abre: UN_PROPIETARIO,
  },
  {
    capitulo: 'Interesado: del perfil a la compraventa',
    titulo: 'Registra su perfil de búsqueda',
    texto:
      'Finalidad, distritos, tipo de inmueble, rango de precio, dormitorios, metraje e imprescindibles. Toca «Guardar perfil».',
    donde: fichaLead('perfil'),
    objetivo: 'lead-perfil',
    abre: UN_INTERESADO,
  },
  {
    capitulo: 'Interesado: del perfil a la compraventa',
    titulo: 'Registra su capacidad financiera',
    texto:
      'Presupuesto máximo, forma de pago y cuota inicial; toca «Guardar capacidad». Con presupuesto y forma de pago el nivel sube solo a Declarada. Si paga con crédito y no tiene precalificación, regístralo abajo con «+ Derivar».',
    donde: fichaLead('perfil'),
    objetivo: 'lead-capacidad',
    abre: UN_INTERESADO,
  },
  {
    capitulo: 'Interesado: del perfil a la compraventa',
    titulo: 'Envíale los inmuebles que hacen match',
    texto:
      'La lista viene ordenada por puntaje, sin los que están fuera de su capacidad ni los que ya rechazó. Marca hasta tres y toca «Enviar opciones».',
    donde: fichaLead('matches'),
    objetivo: 'lead-matches',
    abre: UN_INTERESADO,
  },
  {
    capitulo: 'Interesado: del perfil a la compraventa',
    titulo: 'Registra su respuesta a cada opción',
    texto:
      'En cada inmueble enviado, marca «Me interesa», «No me interesa» o «Ver parecidos». Si le interesan varios, el panel señala el recomendado.',
    donde: fichaLead('matches'),
    objetivo: 'lead-envios',
    abre: UN_INTERESADO,
  },
  {
    capitulo: 'Interesado: del perfil a la compraventa',
    titulo: 'Agenda la visita',
    texto:
      'Elige el inmueble, la fecha y la hora, y toca «Agendar visita». La visita toma la dirección y el acceso de la ficha del inmueble. Si su nivel financiero no alcanza, el panel no deja agendar.',
    donde: fichaLead('visitas'),
    objetivo: 'lead-agendar-visita',
    abre: UN_INTERESADO,
  },
  {
    capitulo: 'Interesado: del perfil a la compraventa',
    titulo: 'Marca la visita y registra su opinión',
    texto:
      'Envía la confirmación y los recordatorios igual que en una cita. Tras la visita, toca «Marcar realizada», luego «Pedir opinión» y, cuando responda, «Registrar opinión».',
    donde: fichaLead('visitas'),
    objetivo: 'lead-visitas',
    abre: UN_INTERESADO,
  },
  {
    capitulo: 'Interesado: del perfil a la compraventa',
    titulo: 'Inicia la compraventa',
    texto:
      'Cuando decida comprar, toca «Iniciar compraventa». Se exige el nivel financiero configurado (por defecto, Precalificada). No existe la separación del inmueble.',
    donde: fichaLead('cierre'),
    objetivo: 'lead-compraventa',
    dialogo: {
      titulo: 'Iniciar compraventa',
      texto: 'Elige el inmueble, agrega notas si hace falta y toca «Iniciar compraventa».',
    },
    abre: UN_INTERESADO,
  },
  {
    capitulo: 'Interesado: del perfil a la compraventa',
    titulo: 'Registra el cierre',
    texto:
      'Firmada la compraventa, toca «Registrar cierre»: el comprador pasa a Cliente y el inmueble a Vendido. Si no se concreta, toca «Se cayó».',
    donde: fichaLead('cierre'),
    objetivo: 'lead-compraventa',
    dialogo: {
      titulo: 'Registrar cierre',
      texto: 'Anota la fecha de cierre, el precio de venta y la comisión pagada, y toca «Registrar cierre».',
    },
    abre: UN_INTERESADO,
  },
  {
    capitulo: 'Postventa',
    titulo: 'Pide el testimonio y la reseña',
    texto:
      'Pasado el plazo configurado (por defecto, 7 días tras el cierre), toca «Pedir testimonio y reseña». Cuando conteste, usa «Registrar respuesta». En un propietario, la pestaña se llama Postventa.',
    donde: fichaLead('cierre'),
    objetivo: 'lead-testimonio',
    dialogo: {
      titulo: 'Respuesta del cliente',
      texto: 'Indica si dio testimonio, si dejó reseña y si autoriza usarlo en redes, y toca «Guardar».',
    },
    abre: UN_CLIENTE,
  },
  {
    capitulo: 'Postventa',
    titulo: 'Registra su intención',
    texto: 'Con «Editar», elige Invertir, Comprar otro inmueble o Vender. Según eso queda en la lista de marketing.',
    donde: fichaLead('cierre'),
    objetivo: 'lead-intencion',
    abre: UN_CLIENTE,
  },
  {
    capitulo: 'Postventa',
    titulo: 'Envía novedades',
    texto:
      'Filtra a los clientes por intención y toca «Enviar novedades». Abajo están los leads en No responde a los que ya les toca. Solo reciben quienes aceptaron marketing y no están en Baja.',
    donde: { ruta: '/marketing' },
    objetivo: 'mk-pendientes',
  },
  {
    capitulo: 'En cualquier momento',
    titulo: 'Cambia el estado, asigna o marca Baja',
    texto:
      '«Cambiar estado» pide una nota (obligatoria para descartar). «Baja» es para quien pide no ser contactado: desde ese momento no recibe ningún mensaje. «Asignar» solo lo ve el administrador.',
    donde: fichaLead(),
    objetivo: 'lead-acciones',
    abre: UN_LEAD,
  },
  {
    capitulo: 'En cualquier momento',
    titulo: 'Revisa todo lo que pasó',
    texto: 'Cambios de estado, notas y eventos, cada uno con su fecha y su autor.',
    donde: fichaLead('historial'),
    objetivo: 'lead-historial',
    abre: UN_LEAD,
  },
]

const INMUEBLES: Paso[] = [
  {
    capitulo: 'Ingresar el inmueble',
    titulo: 'Registra el inmueble',
    texto:
      'Si el contrato ya está firmado, toca «Nuevo inmueble». Si aún no firma, el inmueble se crea desde la ficha del lead propietario, al registrar el resultado de la cita (lo explica la guía de leads).',
    donde: { ruta: '/inmuebles' },
    objetivo: 'inm-nuevo',
    dialogo: {
      titulo: 'Nuevo inmueble',
      texto:
        'Llena los datos del propietario, del inmueble y del contrato, y toca «Registrar inmueble». Entra En cartera y se abre su ficha.',
    },
  },
  {
    capitulo: 'Completar la ficha',
    titulo: 'Sube las fotos',
    texto:
      'Toca «Elegir fotos»; puedes subir varias a la vez. La primera es la portada: para cambiarla, toca «Portada» en otra.',
    donde: FICHA_INMUEBLE,
    objetivo: 'inm-fotos',
    abre: UN_INMUEBLE,
  },
  {
    capitulo: 'Completar la ficha',
    titulo: 'Revisa los datos',
    texto: 'Con «Editar», completa lo que falte. La dirección no se publica.',
    donde: FICHA_INMUEBLE,
    objetivo: 'inm-datos',
    dialogo: {
      titulo: 'Editar inmueble',
      texto:
        'Completa tipo, conservación, precio, metraje, dormitorios, baños, cocheras y características. En la descripción escribe la zona, nunca la dirección exacta. Toca «Guardar».',
    },
    abre: UN_INMUEBLE,
  },
  {
    capitulo: 'Completar la ficha',
    titulo: 'Registra los datos de acceso',
    texto:
      'Con «Editar», anota llave, código, si piden DNI y otras consideraciones. Las visitas toman estos datos al agendarse.',
    donde: FICHA_INMUEBLE,
    objetivo: 'inm-acceso',
    abre: UN_INMUEBLE,
  },
  {
    capitulo: 'Contrato',
    titulo: 'Registra el contrato firmado',
    texto:
      'Si el inmueble está En captación, toca «Registrar contrato». Al guardar, pasa a En cartera y el propietario a Cliente. Si entró con «Nuevo inmueble», ya lo tiene.',
    donde: FICHA_INMUEBLE,
    objetivo: 'inm-contrato',
    dialogo: {
      titulo: 'Registrar contrato firmado',
      texto:
        'Llena fecha de firma, plazo en meses, comisión, si es con exclusividad y si autoriza publicar. La copia escaneada es opcional.',
    },
    abre: UN_INMUEBLE,
  },
  {
    capitulo: 'Difundir',
    titulo: 'Publícalo en el sitio web',
    texto:
      'Los inmuebles En cartera con autorización para publicar salen en el sitio web. Después de registrar o editar uno, toca «Actualizar web».',
    donde: { ruta: '/inmuebles' },
    objetivo: 'inm-web',
  },
  {
    capitulo: 'Difundir',
    titulo: 'Publica el sugerido del día',
    texto:
      'El panel rota los inmuebles: primero los nuevos, luego los de menor interés. Publícalo en redes y en el Canal de WhatsApp, y después toca «Registrar publicación».',
    donde: { ruta: '/difusion' },
    objetivo: 'dif-sugerido',
    dialogo: {
      titulo: 'Registrar publicación',
      texto: 'Marca dónde lo publicaste, la fecha y el texto, y toca «Confirmar publicación».',
    },
  },
  {
    capitulo: 'Difundir',
    titulo: 'Usa el enlace de cada publicación',
    texto:
      'Cada red tiene su propio enlace de WhatsApp: toca «Copiar texto con enlace» y pégalo en la publicación, así cada lead queda asociado al inmueble. Con «Editar enlace y métricas», anota las vistas e interacciones.',
    donde: { ruta: '/difusion' },
    objetivo: 'dif-publicaciones',
  },
  {
    capitulo: 'Difundir',
    titulo: 'Avisa a los interesados a los que les encaja',
    texto:
      'La lista muestra a los interesados activos cuyo perfil y capacidad encajan. Toca «Enviar novedad» en cada uno. El panel respeta el tope de frecuencia y las bajas.',
    donde: FICHA_INMUEBLE,
    objetivo: 'inm-encajan',
    abre: UN_INMUEBLE_EN_CARTERA,
  },
  {
    capitulo: 'Informar al propietario',
    titulo: 'Revisa el interés acumulado',
    texto: 'Leads generados, veces enviado como match, respuestas «Me interesa» y visitas realizadas.',
    donde: FICHA_INMUEBLE,
    objetivo: 'inm-interes',
    abre: UN_INMUEBLE_EN_CARTERA,
  },
  {
    capitulo: 'Informar al propietario',
    titulo: 'Envía el resumen de insights',
    texto:
      'Revisa el resumen del periodo y toca «Enviar al propietario». La frecuencia es configurable (por defecto, semanal); el panel avisa cuántos días faltan para el siguiente.',
    donde: FICHA_INMUEBLE,
    objetivo: 'inm-insights',
    abre: UN_INMUEBLE_EN_CARTERA,
  },
  {
    capitulo: 'Vencimiento del contrato',
    titulo: 'Atiende los contratos por vencer',
    texto:
      'El panel avisa aquí con la anticipación configurada (por defecto, 30 días). Toca el inmueble para abrir su ficha.',
    donde: HOY,
    objetivo: 'hoy-contratos',
  },
  {
    capitulo: 'Vencimiento del contrato',
    titulo: 'Renueva o retira',
    texto:
      '«Renovar» registra el nuevo contrato. «Retirar» pide el motivo y saca el inmueble de la base: deja de publicarse y de ofrecerse en el match.',
    donde: FICHA_INMUEBLE,
    objetivo: 'inm-contrato',
    abre: UN_INMUEBLE_EN_CARTERA,
  },
  {
    capitulo: 'Venta',
    titulo: 'El cierre se registra en la ficha del comprador',
    texto:
      'Abre al interesado que compra y, en su pestaña Compraventa, toca «Registrar cierre». El inmueble pasa solo a Vendido y sale de la base: no hay que cambiar nada en su ficha.',
    donde: { ruta: '/leads' },
    objetivo: 'leads-lista',
  },
  {
    capitulo: 'Consultar la base',
    titulo: 'Filtra la base de propiedades',
    texto:
      'Filtra por estado, distrito, tipo y rango de precio. Por defecto se ven los En captación y En cartera; para ver Vendidos y Retirados, cambia el filtro de estado.',
    donde: { ruta: '/inmuebles' },
    objetivo: 'inm-filtros',
  },
]

export const GUIAS: Record<ClaveGuia, Guia> = {
  leads: {
    titulo: 'Gestión de leads',
    descripcion: 'Del primer contacto al cierre y la postventa, para propietarios e interesados.',
    pasos: LEADS,
  },
  inmuebles: {
    titulo: 'Gestión de inmuebles',
    descripcion: 'Del ingreso a la base de propiedades a la difusión, los insights y la venta.',
    pasos: INMUEBLES,
  },
}

// Capítulos de una guía con el índice de su primer paso
export function capitulos(guia: Guia) {
  const lista: { titulo: string; inicio: number; pasos: number }[] = []
  guia.pasos.forEach((p, i) => {
    const ultimo = lista.at(-1)
    if (ultimo?.titulo === p.capitulo) ultimo.pasos++
    else lista.push({ titulo: p.capitulo, inicio: i, pasos: 1 })
  })
  return lista
}

// Entrada del menú que lleva a cada ruta (data-guia="nav-…")
export const MENU_DE: Record<string, string> = {
  '/': 'hoy',
  '/leads': 'leads',
  '/leads/nuevo': 'leads',
  '/leads/:id': 'leads',
  '/chats': 'chats',
  '/agenda': 'agenda',
  '/inmuebles': 'inmuebles',
  '/inmuebles/:id': 'inmuebles',
  '/difusion': 'difusion',
  '/marketing': 'marketing',
}

export const NOMBRE_RUTA: Record<string, string> = {
  '/': 'Hoy',
  '/leads': 'Leads',
  '/leads/nuevo': 'Registrar lead',
  '/chats': 'Chats',
  '/agenda': 'Agenda',
  '/inmuebles': 'Inmuebles',
  '/difusion': 'Difusión',
  '/marketing': 'Marketing',
}

export const NOMBRE_TAB: Record<string, string> = {
  resumen: 'Seguimiento',
  chat: 'Chat',
  calificacion: 'Calificación',
  citas: 'Citas e inmueble',
  perfil: 'Perfil y capacidad',
  matches: 'Matches',
  visitas: 'Visitas',
  cierre: 'Compraventa',
  historial: 'Historial',
}

// Lista desde la que se abre una ficha, con el elemento que la señala
export const LISTA_DE: Record<string, { ruta: string; objetivo: string }> = {
  '/leads/:id': { ruta: '/leads', objetivo: 'leads-lista' },
  '/inmuebles/:id': { ruta: '/inmuebles', objetivo: 'inm-lista' },
}

export function coincideRuta(ruta: string, pathname: string) {
  if (!ruta.includes(':id')) return ruta === pathname
  const base = ruta.replace('/:id', '')
  if (!pathname.startsWith(`${base}/`)) return false
  const resto = pathname.slice(base.length + 1)
  return resto.length > 0 && !resto.includes('/') && resto !== 'nuevo'
}
