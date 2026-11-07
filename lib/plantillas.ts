// Plantillas de mensajes (HU-04). Variables entre corchetes, por ejemplo [nombre]. Lo que va entre
// llaves { } solo aparece si todas las variables que contiene tienen valor.

export const VARIABLES: Record<string, string> = {
  nombre: 'Nombre del lead',
  asesor: 'Nombre del asesor',
  canal: 'Canal de origen',
  inmueble: 'Inmueble (tipo, distrito y código)',
  distrito: 'Distrito',
  tema: 'Inmueble o búsqueda de la última conversación',
  opciones: 'Lista de inmuebles del envío',
  fecha: 'Fecha de la cita',
  hora: 'Hora de la cita',
  direccion: 'Dirección de la cita',
  resumen: 'Resumen de insights',
  enlace_resena: 'Enlace para la reseña en Google',
}

export type Variables = Partial<Record<keyof typeof VARIABLES | string, string | null | undefined>>

const RE_VARIABLE = /\[([a-z_]+)\]/g
const RE_SEGMENTO = /\{([^{}]*)\}/g

export function renderizar(cuerpo: string, vars: Variables) {
  const valor = (k: string) => {
    const v = vars[k]
    return v === null || v === undefined ? '' : String(v).trim()
  }
  const conSegmentos = cuerpo.replace(RE_SEGMENTO, (_, seg: string) => {
    const usadas = [...seg.matchAll(RE_VARIABLE)].map((m) => m[1])
    return usadas.every((k) => valor(k) !== '') ? seg : ''
  })
  return conSegmentos
    .replace(RE_VARIABLE, (m, k: string) => (k in vars ? valor(k) : m))
    .replace(/[ \t]+([.,;:!?)])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// Variables en orden de aparición: son los parámetros {{1}}, {{2}}... de la plantilla aprobada en Meta
export function variablesEnOrden(cuerpo: string) {
  const vistas: string[] = []
  for (const m of cuerpo.matchAll(RE_VARIABLE)) if (!vistas.includes(m[1])) vistas.push(m[1])
  return vistas
}

export function variablesDesconocidas(cuerpo: string) {
  return variablesEnOrden(cuerpo).filter((k) => !(k in VARIABLES))
}
