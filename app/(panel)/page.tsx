import Link from 'next/link'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { TIPOS_INMUEBLE, etiqueta } from '@/lib/catalogos'
import { ahoraMs, fecha, hora, hoyLima } from '@/lib/formato'
import { EncabezadoPagina, Tarjeta, Vacio } from '@/components/legado'
import { InsigniaVencimiento } from './inmuebles/compartido'

const diaSiguiente = (dia: string, n = 1) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export default async function PaginaHoy() {
  const usuario = await exigirUsuario()
  const supabase = await crearClienteServidor()
  const hoy = hoyLima()
  const { data: param } = await supabase.from('parametros').select('valor').eq('clave', 'contrato_aviso_dias').maybeSingle()
  const avisoDias = Number(param?.valor ?? 30)

  let contratos = supabase
    .from('v_inmuebles')
    .select('id, codigo, tipo, distrito, contrato_vence_el, propietario_nombre')
    .eq('estado', 'en_cartera')
    .lte('contrato_vence_el', diaSiguiente(hoy, avisoDias))
    .order('contrato_vence_el')
  if (!usuario.esAdmin) contratos = contratos.eq('asesor_id', usuario.id)
  const [{ data: citas }, { data: porVencer }] = await Promise.all([
    // Hoy y mañana (recordatorio de 24 horas). La RLS limita al asesor a las suyas.
    supabase
      .from('citas')
      .select('id, tipo, inicio, distrito, confirmacion_at, recordatorio_24h_at, recordatorio_dia_at, lead:leads(persona:personas(nombre))')
      .eq('estado', 'programada')
      .gte('inicio', `${hoy}T00:00:00-05:00`)
      .lt('inicio', `${diaSiguiente(hoy, 2)}T00:00:00-05:00`)
      .order('inicio'),
    contratos,
  ])
  const finHoy = Date.parse(`${diaSiguiente(hoy)}T00:00:00-05:00`)
  const ahora = ahoraMs()
  const deHoy = (citas ?? []).filter((c) => Date.parse(c.inicio) < finHoy)
  const avisos = (citas ?? []).filter(
    (c) => Date.parse(c.inicio) > ahora && (!c.confirmacion_at || (deHoy.includes(c) ? !c.recordatorio_dia_at : !c.recordatorio_24h_at)),
  )
  const nombre = (c: (typeof deHoy)[number]) => (c.lead as unknown as { persona: { nombre: string } | null } | null)?.persona?.nombre ?? 'Lead'

  return (
    <>
      <EncabezadoPagina titulo={`Hola, ${usuario.nombre.split(' ')[0]}`} descripcion="Pendientes de hoy" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo={`Citas y visitas de hoy (${deHoy.length})`} acciones={<Link href="/agenda" className="text-sm text-marino-700 hover:underline">Ver agenda →</Link>}>
          {deHoy.length ? (
            <ul className="space-y-1 text-sm">
              {deHoy.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{hora(c.inicio)}</span> · {c.tipo === 'visita' ? 'Visita' : 'Cita'} con {nombre(c)}
                  {c.distrito && <span className="text-suave"> · {c.distrito}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Vacio>Nada agendado para hoy.</Vacio>
          )}
        </Tarjeta>

        <Tarjeta titulo={`Confirmaciones y recordatorios por enviar (${avisos.length})`}>
          {avisos.length ? (
            <ul className="space-y-1 text-sm">
              {avisos.map((c) => (
                <li key={c.id}>
                  <Link href={`/agenda?dia=${deHoy.includes(c) ? hoy : diaSiguiente(hoy)}`} className="hover:underline">
                    {!c.confirmacion_at ? 'Confirmación' : deHoy.includes(c) ? 'Recordatorio de hoy' : 'Recordatorio 24 h'} · {nombre(c)} ·{' '}
                    {deHoy.includes(c) ? 'hoy' : 'mañana'} {hora(c.inicio)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Vacio>Todo enviado.</Vacio>
          )}
        </Tarjeta>

        <Tarjeta titulo={`Contratos por vencer (${porVencer?.length ?? 0})`} className="lg:col-span-2">
          {porVencer?.length ? (
            <ul className="space-y-2 text-sm">
              {porVencer.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/inmuebles/${i.id}`} className="font-medium text-marino-800 hover:underline">
                    {i.codigo} · {etiqueta(TIPOS_INMUEBLE, i.tipo)} en {i.distrito}
                  </Link>
                  <span className="text-suave">
                    {i.propietario_nombre ?? '—'} · vence el {fecha(i.contrato_vence_el)}
                  </span>
                  <InsigniaVencimiento venceEl={i.contrato_vence_el} hoy={hoy} avisoDias={avisoDias} />
                </li>
              ))}
            </ul>
          ) : (
            <Vacio>Ningún contrato vence en los próximos {avisoDias} días.</Vacio>
          )}
        </Tarjeta>
      </div>
    </>
  )
}
