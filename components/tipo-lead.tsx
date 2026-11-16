import { House, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TIPOS_LEAD, type TipoLead as Tipo } from '@/lib/catalogos'
import { cn } from '@/lib/utils'

// El tipo de lead se reconoce a simple vista: un color y un ícono estables en todas las pantallas
const ESTILOS: Record<Tipo, { clase: string; Icono: typeof House; borde: string }> = {
  propietario: { clase: 'bg-violet-100 text-violet-800', Icono: House, borde: 'border-l-4 border-l-violet-400' },
  interesado: { clase: 'bg-teal-100 text-teal-800', Icono: Search, borde: 'border-l-4 border-l-teal-400' },
}

export function bordeTipo(tipo: Tipo) {
  return ESTILOS[tipo].borde
}

export function TipoLead({ tipo, corto = false }: { tipo: Tipo; corto?: boolean }) {
  const { clase, Icono } = ESTILOS[tipo]
  const texto = TIPOS_LEAD[tipo]
  return (
    <Badge
      className={cn(clase, corto && 'px-1.5')}
      aria-label={corto ? texto : undefined}
      title={corto ? texto : undefined}
    >
      <Icono aria-hidden />
      {!corto && texto}
    </Badge>
  )
}
