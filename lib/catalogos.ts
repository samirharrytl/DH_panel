// Etiquetas en español de los valores que guarda la base de datos.

export type TipoLead = 'propietario' | 'interesado'
export type EstadoLead =
  | 'nuevo'
  | 'contactado'
  | 'en_conversacion'
  | 'cita_agendada'
  | 'cita_realizada'
  | 'calificado'
  | 'match_enviado'
  | 'visita_agendada'
  | 'visita_realizada'
  | 'compraventa'
  | 'cliente'
  | 'no_responde'
  | 'descartado'
  | 'baja'

export const TIPOS_LEAD: Record<TipoLead, string> = { propietario: 'Propietario', interesado: 'Interesado' }

export const ESTADOS_LEAD: Record<EstadoLead, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  en_conversacion: 'En conversación',
  cita_agendada: 'Cita agendada',
  cita_realizada: 'Cita realizada',
  calificado: 'Calificado',
  match_enviado: 'Match enviado',
  visita_agendada: 'Visita agendada',
  visita_realizada: 'Visita realizada',
  compraventa: 'Compraventa en curso',
  cliente: 'Cliente',
  no_responde: 'No responde',
  descartado: 'Descartado',
  baja: 'Baja',
}

export const EMBUDO: Record<TipoLead, EstadoLead[]> = {
  propietario: ['nuevo', 'contactado', 'en_conversacion', 'cita_agendada', 'cita_realizada', 'cliente'],
  interesado: [
    'nuevo',
    'contactado',
    'en_conversacion',
    'calificado',
    'match_enviado',
    'visita_agendada',
    'visita_realizada',
    'compraventa',
    'cliente',
  ],
}
export const SALIDAS: EstadoLead[] = ['no_responde', 'descartado', 'baja']

// Estados que solo se alcanzan con su acción (agendar, contrato, cierre...)
export const ESTADOS_CON_ACCION: EstadoLead[] = ['cita_agendada', 'visita_agendada', 'compraventa', 'cliente']

export function colorEstado(estado: EstadoLead) {
  if (estado === 'cliente') return 'verde'
  if (estado === 'baja' || estado === 'descartado') return 'gris'
  if (estado === 'no_responde') return 'ambar'
  if (estado === 'nuevo') return 'azul'
  return 'marino'
}

export const CANALES = {
  whatsapp: 'WhatsApp',
  canal_whatsapp: 'Canal de WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  web: 'Sitio web',
  portal: 'Portal inmobiliario',
  referido: 'Referido',
  llamada: 'Llamada',
  otro: 'Otro',
} as const
export type Canal = keyof typeof CANALES

export const TIPOS_INMUEBLE = {
  departamento: 'Departamento',
  casa: 'Casa',
  terreno: 'Terreno',
  local: 'Local comercial',
  oficina: 'Oficina',
  otro: 'Otro',
} as const
export type TipoInmueble = keyof typeof TIPOS_INMUEBLE

export const ESTADOS_INMUEBLE = {
  en_captacion: 'En captación',
  en_cartera: 'En cartera',
  vendido: 'Vendido',
  retirado: 'Retirado',
} as const
export type EstadoInmueble = keyof typeof ESTADOS_INMUEBLE

export function colorEstadoInmueble(e: EstadoInmueble) {
  return e === 'en_cartera' ? 'verde' : e === 'en_captacion' ? 'azul' : e === 'vendido' ? 'marino' : 'gris'
}

export const URGENCIAS = {
  inmediata: 'Inmediata',
  menos_3_meses: 'Menos de 3 meses',
  '3_a_6_meses': 'De 3 a 6 meses',
  mas_6_meses: 'Más de 6 meses',
  sin_apuro: 'Sin apuro',
} as const

export const CONSERVACION = {
  estreno: 'Estreno',
  muy_bueno: 'Muy bueno',
  bueno: 'Bueno',
  regular: 'Regular',
  para_remodelar: 'Para remodelar',
} as const

export const MEDIOS_CONTACTO = {
  chat_whatsapp: 'Chat de WhatsApp',
  llamada_whatsapp: 'Llamada por WhatsApp',
  celular: 'Llamada al celular',
} as const

export const NIVELES = {
  no_validada: 'No validada',
  declarada: 'Declarada',
  precalificada: 'Precalificada',
  aprobada: 'Aprobada',
} as const
export type Nivel = keyof typeof NIVELES
export const ORDEN_NIVEL: Nivel[] = ['no_validada', 'declarada', 'precalificada', 'aprobada']

export const FORMAS_PAGO = { contado: 'Contado', credito: 'Crédito', mixto: 'Mixto' } as const

export const ESTADOS_DERIVACION = {
  derivado: 'Derivado',
  en_evaluacion: 'En evaluación',
  precalificado: 'Precalificado',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  desistio: 'Desistió',
} as const

export const RESPUESTAS_MATCH = {
  me_interesa: 'Me interesa',
  no_me_interesa: 'No me interesa',
  ver_parecidos: 'Ver parecidos',
} as const
export type RespuestaMatch = keyof typeof RESPUESTAS_MATCH

export const IMPRESCINDIBLES = ['cochera', 'ascensor', 'mascotas', 'terraza', 'jardín', 'piscina', 'amoblado', 'vista exterior']

export const INTENCIONES = { invertir: 'Invertir', comprar_otro: 'Comprar otro inmueble', vender: 'Vender' } as const

export const ESTADOS_CITA = {
  programada: 'Programada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
} as const

export const INTERES_VISITA = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo', ninguno: 'Ninguno' } as const

export const DISTRITOS_LIMA = [
  'Ate', 'Barranco', 'Breña', 'Callao', 'Carabayllo', 'Cercado de Lima', 'Chorrillos', 'Comas', 'El Agustino',
  'Independencia', 'Jesús María', 'La Molina', 'La Perla', 'La Victoria', 'Lince', 'Los Olivos', 'Lurín',
  'Magdalena del Mar', 'Miraflores', 'Pachacámac', 'Pueblo Libre', 'Puente Piedra', 'Rímac', 'San Borja',
  'San Isidro', 'San Juan de Lurigancho', 'San Juan de Miraflores', 'San Luis', 'San Martín de Porres',
  'San Miguel', 'Santa Anita', 'Santiago de Surco', 'Surquillo', 'Villa El Salvador', 'Villa María del Triunfo',
]

export const etiqueta = <T extends Record<string, string>>(catalogo: T, valor: string | null | undefined) =>
  valor ? (catalogo[valor as keyof T] ?? valor) : '—'
