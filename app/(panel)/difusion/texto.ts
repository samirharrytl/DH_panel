// Textos y enlaces de las publicaciones (HU-28, HU-29). Sin dependencias del servidor: también los usan
// componentes de cliente.
import { TIPOS_INMUEBLE, etiqueta } from '@/lib/catalogos'
import { num, soles } from '@/lib/formato'

export type InmuebleDifusion = {
  id: string
  codigo: string
  tipo: string
  distrito: string
  precio: number | null
  metraje: number | null
  dormitorios: number | null
  banos: number | null
  cocheras: number
  ascensor: boolean
  mascotas: boolean
  caracteristicas: string[]
}

export const COLUMNAS_INMUEBLE =
  'id, codigo, tipo, distrito, precio, metraje, dormitorios, banos, cocheras, ascensor, mascotas, caracteristicas'

export type Publicacion = {
  id: string
  inmueble_id: string
  red: string
  codigo: string
  publicada_el: string
  url: string | null
  texto: string | null
  vistas: number
  interacciones: number
  metricas_at: string | null
  created_at: string
  inmueble: { codigo: string; tipo: string; distrito: string } | null
  leads: number
}

// Con el conteo de leads atribuidos (leads.publicacion_id); RLS: el asesor solo cuenta los suyos
export const COLUMNAS_PUBLICACION =
  'id, inmueble_id, red, codigo, publicada_el, url, texto, vistas, interacciones, metricas_at, created_at, inmueble:inmuebles(codigo, tipo, distrito), leads(count)'

type FilaPublicacion = Omit<Publicacion, 'leads'> & { leads: { count: number }[] | null }

export function aPublicaciones(filas: unknown[] | null): Publicacion[] {
  return ((filas ?? []) as FilaPublicacion[]).map((p) => ({ ...p, leads: p.leads?.[0]?.count ?? 0 }))
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export const describirCorto = (i: { tipo: string; distrito: string }) => `${etiqueta(TIPOS_INMUEBLE, i.tipo)} en ${i.distrito}`

// Módulo 3: tipo, zona (nunca la dirección exacta), precio, características principales y la mención del
// enlace, que se agrega al final con el código de cada publicación.
export function textoSugerido(i: InmuebleDifusion) {
  const medidas = [
    i.metraje ? `${num(i.metraje)} m²` : null,
    i.dormitorios ? plural(i.dormitorios, 'dormitorio', 'dormitorios') : null,
    i.banos ? plural(i.banos, 'baño', 'baños') : null,
    i.cocheras ? plural(i.cocheras, 'cochera', 'cocheras') : null,
  ].filter(Boolean)
  const extras = [
    i.ascensor ? 'Ascensor' : null,
    i.mascotas ? 'Acepta mascotas' : null,
    ...(i.caracteristicas ?? []).filter((c) => c.trim()).map((c) => mayuscula(c.trim())),
  ].filter(Boolean)
  return [
    `🏠 ${describirCorto(i)}, en venta`,
    i.precio ? `💰 ${soles(i.precio)}` : null,
    medidas.length ? `📐 ${medidas.join(' · ')}` : null,
    extras.length ? `✅ ${extras.join(' · ')}` : null,
    `Código: ${i.codigo}`,
    '',
    '📲 Escríbenos por WhatsApp para más información o para agendar una visita:',
  ]
    .filter((l) => l !== null)
    .join('\n')
}

// El parámetro whatsapp_numero se guarda con código de país y sin "+"
export const normalizarNumero = (valor: unknown) => (typeof valor === 'string' ? valor.replace(/\D/g, '') : '')

// HU-29: el código de la publicación viaja en el mensaje y el webhook atribuye el lead
export function enlaceWhatsApp(numero: string, codigoInmueble: string, codigoPublicacion: string) {
  if (!numero) return null
  const mensaje = `Hola, me interesa el inmueble ${codigoInmueble} (ref. ${codigoPublicacion})`
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
}

export function textoParaRed(texto: string | null, enlace: string | null) {
  return [texto?.trim(), enlace].filter(Boolean).join('\n')
}

// HU-30: resumen de insights para el propietario a partir de insights_inmueble()
export type DatosInsights = {
  vistas: number
  interacciones: number
  publicaciones: number
  leads_generados: number
  veces_match: number
  pct_me_interesa: number | null
  visitas_agendadas: number
  visitas_realizadas: number
  opiniones: { interes: string; le_gusto: string | null; no_le_gusto: string | null }[]
  precio_m2: number | null
  precio_m2_zona: number | null
  similares: number
  diferencia_zona_pct: number | null
}

export function textoInsights(d: DatosInsights) {
  const zona =
    d.diferencia_zona_pct === null
      ? 'Aún no hay inmuebles similares en la zona para comparar el precio.'
      : `Precio por m²: ${soles(d.precio_m2)} frente a ${soles(d.precio_m2_zona)} de ${plural(d.similares, 'inmueble similar', 'inmuebles similares')} en la zona (${d.diferencia_zona_pct > 0 ? '+' : ''}${d.diferencia_zona_pct} %).`
  const comentarios = d.opiniones
    .flatMap((o) => [o.le_gusto && `👍 ${o.le_gusto}`, o.no_le_gusto && `👎 ${o.no_le_gusto}`])
    .filter(Boolean)
  return [
    `• Publicaciones: ${d.publicaciones} (${num(d.vistas)} vistas, ${num(d.interacciones)} interacciones en total)`,
    `• Personas interesadas que nos escribieron: ${d.leads_generados}`,
    `• Enviado a compradores: ${plural(d.veces_match, 'vez', 'veces')}${d.pct_me_interesa !== null ? `, ${d.pct_me_interesa} % respondió «Me interesa»` : ''}`,
    `• Visitas: ${d.visitas_agendadas} agendadas, ${d.visitas_realizadas} realizadas`,
    ...(comentarios.length ? [`• Lo que dijeron: ${comentarios.join(' · ')}`] : []),
    `• ${zona}`,
  ].join('\n')
}
