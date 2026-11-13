import type { Metadata } from 'next'
import { crearClienteServidor } from '@/lib/supabase/server'
import { NIVELES } from '@/lib/catalogos'
import { fechaHora } from '@/lib/formato'
import { AreaTexto, Entrada, Seleccion, Tarjeta } from '@/components/legado'
import { BotonAccion, BotonEnviar, Formulario } from '@/components/formulario'
import { guardarParametro, restablecerParametro } from './acciones'

export const metadata: Metadata = { title: 'Parámetros' }

type Parametro = {
  clave: string
  nombre: string
  descripcion: string
  grupo: string
  tipo: string
  unidad: string | null
  valor: unknown
  valor_defecto: unknown
  updated_at: string
  updated_by: string | null
}

function mostrar(p: Parametro, valor: unknown) {
  if (p.tipo === 'lista_enteros' && Array.isArray(valor)) return `${valor.length ? valor.join(', ') : 'ninguno'}`
  if (p.tipo === 'lista_texto' && Array.isArray(valor)) return valor.join(', ')
  if (p.tipo === 'nivel_financiero') return NIVELES[valor as keyof typeof NIVELES] ?? String(valor)
  if (valor === '') return '(vacío)'
  return `${valor}${p.unidad ? ` ${p.unidad}` : ''}`
}

function Control({ p }: { p: Parametro }) {
  if (p.tipo === 'nivel_financiero') {
    return (
      <Seleccion name="valor" defaultValue={String(p.valor)} className="sm:w-56">
        {Object.entries(NIVELES).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Seleccion>
    )
  }
  if (p.tipo === 'lista_texto') {
    return <AreaTexto name="valor" defaultValue={(p.valor as string[]).join('\n')} rows={4} className="sm:w-72" />
  }
  if (p.tipo === 'lista_enteros') {
    return <Entrada name="valor" defaultValue={(p.valor as number[]).join(', ')} className="sm:w-56" placeholder="1, 3, 4" />
  }
  if (p.tipo === 'entero') {
    return <Entrada type="number" min={0} step={1} name="valor" defaultValue={String(p.valor)} className="sm:w-32" />
  }
  if (p.tipo === 'decimal') {
    return <Entrada type="number" min={0} step="any" name="valor" defaultValue={String(p.valor)} className="sm:w-32" />
  }
  return <Entrada name="valor" defaultValue={String(p.valor ?? '')} className="sm:w-96" />
}

export default async function PaginaParametros() {
  const supabase = await crearClienteServidor()
  const [{ data }, { data: perfiles }] = await Promise.all([
    supabase.from('parametros').select('*').order('orden'),
    supabase.from('perfiles').select('id, nombre'),
  ])
  const nombres = new Map(perfiles?.map((p) => [p.id, p.nombre]))
  const parametros = (data ?? []) as Parametro[]
  const grupos = [...new Set(parametros.map((p) => p.grupo))]

  return (
    <div className="space-y-5">
      <p className="text-sm text-suave">
        Los cambios aplican de inmediato. Por ejemplo, los días de refuerzo nuevos se usan para las bienvenidas que se
        envíen desde ahora; las cadencias ya creadas se mantienen.
      </p>
      {grupos.map((g) => (
        <Tarjeta key={g} titulo={g}>
          <ul className="divide-y divide-borde-suave">
            {parametros
              .filter((p) => p.grupo === g)
              .map((p) => {
                const cambiado = JSON.stringify(p.valor) !== JSON.stringify(p.valor_defecto)
                return (
                  <li key={p.clave} className="py-4 first:pt-0 last:pb-0">
                    <div className="mb-2">
                      <p className="font-medium text-tinta">{p.nombre}</p>
                      <p className="text-sm text-suave">{p.descripcion}</p>
                      <p className="mt-1 text-xs text-suave">
                        Valor por defecto: <strong>{mostrar(p, p.valor_defecto)}</strong>
                        {cambiado && p.updated_by && (
                          <> · Cambiado por {nombres.get(p.updated_by) ?? '—'} el {fechaHora(p.updated_at)}</>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      <Formulario accion={guardarParametro} className="flex flex-wrap items-start gap-2">
                        <input type="hidden" name="clave" value={p.clave} />
                        <input type="hidden" name="tipo" value={p.tipo} />
                        <Control p={p} />
                        <BotonEnviar variante="secundario">Guardar</BotonEnviar>
                      </Formulario>
                      {cambiado && (
                        <BotonAccion accion={restablecerParametro.bind(null, p.clave)} variante="fantasma" tamano="md">
                          Restablecer
                        </BotonAccion>
                      )}
                    </div>
                  </li>
                )
              })}
          </ul>
        </Tarjeta>
      ))}
    </div>
  )
}
