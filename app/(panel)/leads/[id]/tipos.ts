import type { Usuario } from '@/lib/auth'
import type { LeadFicha } from '@/lib/datos/lead'

// Props comunes de todas las secciones de la ficha del lead
export type PropsSeccion = { lead: LeadFicha; usuario: Usuario }
