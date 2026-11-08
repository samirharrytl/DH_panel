import type { EstadoInmueble, TipoInmueble } from '@/lib/catalogos'

// Fila de la vista v_inmuebles (inmuebles + propietario, asesor, portada, contrato vigente e interés)
export type InmuebleVista = {
  id: string
  numero: number
  codigo: string
  propietario_lead_id: string | null
  persona_id: string | null
  asesor_id: string | null
  estado: EstadoInmueble
  tipo: TipoInmueble
  direccion: string
  distrito: string
  referencia: string | null
  metraje: number | null
  dormitorios: number | null
  banos: number | null
  cocheras: number
  ascensor: boolean
  mascotas: boolean
  caracteristicas: string[]
  precio_esperado: number | null
  precio: number | null
  conservacion: string | null
  descripcion: string | null
  acceso_llave: string | null
  acceso_codigo: string | null
  acceso_dni: boolean
  acceso_otros: string | null
  autoriza_publicar: boolean
  en_cartera_at: string | null
  vendido_at: string | null
  retirado_at: string | null
  motivo_retiro: string | null
  created_at: string
  propietario_nombre: string | null
  asesor_nombre: string | null
  foto_portada: string | null
  contrato_vence_el: string | null
  contrato_id: string | null
  leads_interesados: number
  veces_match: number
  me_interesa: number
  visitas_realizadas: number
}

export type Contrato = {
  id: string
  inmueble_id: string
  fecha_firma: string
  exclusividad: boolean
  plazo_meses: number
  vence_el: string
  comision_pct: number
  autoriza_publicar: boolean
  archivo_ruta: string | null
  estado: 'vigente' | 'renovado' | 'terminado'
  contrato_anterior_id: string | null
  notas: string | null
  created_at: string
}

export type Acceso = {
  acceso_llave: string | null
  acceso_codigo: string | null
  acceso_dni: boolean
  acceso_otros: string | null
}
