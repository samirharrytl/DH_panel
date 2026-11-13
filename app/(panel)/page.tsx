import Link from 'next/link'
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react'
import { exigirUsuario } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { TIPOS_INMUEBLE, TIPOS_LEAD, etiqueta } from '@/lib/catalogos'
import { ZONA, ahoraMs, diaLargo, fecha, fechaCorta, hora, hoyLima } from '@/lib/formato'
import { Tarjeta, Vacio } from '@/components/campos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InsigniaVencimiento } from './inmuebles/compartido'

const diaSiguiente = (dia: string, n = 1) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
// Mismos estados que la bandeja excluye por defecto (app/(panel)/leads/page.tsx)
const CERRADOS = '(cliente,descartado,baja)'
const fMes = new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: ZONA })

export default async function PaginaHoy() {
  const usuario = await exigirUsuario()
  const supabase = await crearClienteServidor()
  const hoy = hoyLima()
  const finHoy = `${diaSiguiente(hoy)}T00:00:00-05:00`
  // Igual que la bandeja: pone al día los refuerzos antes de leer la próxima acción
  await supabase.rpc('procesar_cadencias')
  const { data: param } = await supabase.from('parametros').select('valor').eq('clave', 'contrato_aviso_dias').maybeSingle()
  const avisoDias = Number(param?.valor ?? 30)

  let contratos = supabase
    .from('v_inmuebles')
    .select('id, codigo, tipo, distrito, contrato_vence_el, propietario_nombre')
    .eq('estado', 'en_cartera')
    .lte('contrato_vence_el', diaSiguiente(hoy, avisoDias))
    .order('contrato_vence_el')
  if (!usuario.esAdmin) contratos = contratos.eq('asesor_id', usuario.id)
  // La seguridad por fila limita al asesor a sus leads, citas y compraventas
  const [{ data: leads }, { data: citas }, { data: porVencer }, { count: cierres }] = await Promise.all([
    supabase
      .from('v_bandeja')
      .select('id, nombre, tipo, proxima_accion, proxima_accion_at')
      .eq('vigente', true)
      .not('estado', 'in', CERRADOS)
      .not('proxima_accion_at', 'is', null)
      .lt('proxima_accion_at', finHoy)
      .order('proxima_accion_at')
      .limit(20),
    // Hoy y mañana (recordatorio de 24 horas)
    supabase
      .from('citas')
      .select('id, tipo, inicio, distrito, confirmacion_at, recordatorio_24h_at, recordatorio_dia_at, lead:leads(persona:personas(nombre))')
      .eq('estado', 'programada')
      .gte('inicio', `${hoy}T00:00:00-05:00`)
      .lt('inicio', `${diaSiguiente(hoy, 2)}T00:00:00-05:00`)
      .order('inicio'),
    contratos,
    supabase
      .from('compraventas')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'cerrada')
      .gte('fecha_cierre', `${hoy.slice(0, 8)}01`),
  ])
  const ahora = ahoraMs()
  const deHoy = (citas ?? []).filter((c) => Date.parse(c.inicio) < Date.parse(finHoy))
  const avisos = (citas ?? []).filter(
    (c) => Date.parse(c.inicio) > ahora && (!c.confirmacion_at || (deHoy.includes(c) ? !c.recordatorio_dia_at : !c.recordatorio_24h_at)),
  )
  const nombre = (c: (typeof deHoy)[number]) => (c.lead as unknown as { persona: { nombre: string } | null } | null)?.persona?.nombre ?? 'Lead'
  const mes = fMes.format(new Date(ahora))

  const cifras = [
    { valor: leads?.length ?? 0, texto: leads?.length === 1 ? 'lead por atender' : 'leads por atender', tope: (leads?.length ?? 0) >= 20 },
    { valor: deHoy.length, texto: deHoy.length === 1 ? 'cita o visita hoy' : 'citas y visitas hoy' },
    { valor: cierres ?? 0, texto: `${usuario.esAdmin ? 'cierres' : 'tus cierres'} de ${mes}` },
  ]

  return (
    <>
      <section
        aria-label="Resumen del día"
        className="mb-6 rounded-2xl bg-[linear-gradient(120deg,#012147_0%,#0f3466_60%,#0b6b52_100%)] px-5 py-6 text-white sm:px-7"
      >
        <p className="text-sm text-[#cfe0f0]">{diaLargo(new Date(ahora))}</p>
        <h1 className="mt-1 font-titulo text-3xl font-semibold">Hola, {usuario.nombre.split(' ')[0]}</h1>
        <dl className="mt-5 grid grid-cols-3 gap-3 sm:max-w-xl">
          {cifras.map((c) => (
            <div key={c.texto} className="border-l-2 border-[#3ddc97] pl-3">
              <dt className="sr-only">{c.texto}</dt>
              <dd className="font-titulo text-3xl leading-none font-semibold tabular-nums">
                {c.valor}
                {c.tope && '+'}
              </dd>
              <dd aria-hidden className="mt-1.5 text-xs leading-snug text-[#cfe0f0] sm:text-sm">
                {c.texto}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Tarjeta guia="hoy-atiende"
          titulo="Atiende primero"
          className="lg:col-span-3"
          acciones={
            <Link href="/leads" className="-my-2 inline-flex min-h-9 items-center text-sm text-muted-foreground hover:text-primary">
              Ver la bandeja
            </Link>
          }
        >
          {leads?.length ? (
            <ul className="-my-2 divide-y divide-border">
              {leads.map((l) => {
                const vencida = Date.parse(l.proxima_accion_at!) < ahora
                return (
                  <li key={l.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-foreground">{l.nombre}</span>
                        <Badge variant="gris">{TIPOS_LEAD[l.tipo as keyof typeof TIPOS_LEAD]}</Badge>
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {l.proxima_accion}
                        <span className="ml-2 inline-flex items-center gap-1.5 whitespace-nowrap">
                          {vencida ? <Badge variant="ambar">Vencida</Badge> : null}
                          <span className="text-xs">
                            {vencida ? fechaCorta(l.proxima_accion_at) : 'Hoy'} {hora(l.proxima_accion_at)}
                          </span>
                        </span>
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/leads/${l.id}`} aria-label={`Abrir la ficha de ${l.nombre}`}>
                        Abrir
                        <ChevronRight aria-hidden />
                      </Link>
                    </Button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Vacio
              accion={
                <Button asChild variant="outline" size="sm">
                  <Link href="/leads">Ver la bandeja</Link>
                </Button>
              }
            >
              No tienes acciones pendientes para hoy.
            </Vacio>
          )}
        </Tarjeta>

        <div className="space-y-4 lg:col-span-2">
          <Tarjeta guia="hoy-citas"
            titulo="Citas y visitas de hoy"
            acciones={
              <Link href="/agenda" className="-my-2 inline-flex min-h-9 items-center text-sm text-muted-foreground hover:text-primary">
                Ver agenda
              </Link>
            }
          >
            {deHoy.length ? (
              <ul className="space-y-3 text-sm">
                {deHoy.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <span className="w-12 shrink-0 font-titulo font-semibold text-primary tabular-nums">{hora(c.inicio)}</span>
                    <div className="min-w-0">
                      <p className="text-foreground">
                        {c.tipo === 'visita' ? 'Visita' : 'Cita'} con {nombre(c)}
                      </p>
                      {c.distrito && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin aria-hidden className="size-3.5" />
                          {c.distrito}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Vacio>Nada agendado para hoy.</Vacio>
            )}
          </Tarjeta>

          <Tarjeta titulo="Confirmaciones y recordatorios por enviar">
            {avisos.length ? (
              <ul className="space-y-3 text-sm">
                {avisos.map((c) => (
                  <li key={c.id}>
                    <Link href={`/agenda?dia=${deHoy.includes(c) ? hoy : diaSiguiente(hoy)}`} className="group block">
                      <p className="font-medium text-foreground group-hover:text-primary">
                        {!c.confirmacion_at ? 'Confirmación' : deHoy.includes(c) ? 'Recordatorio de hoy' : 'Recordatorio 24 h'} para{' '}
                        {nombre(c)}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays aria-hidden className="size-3.5" />
                        {deHoy.includes(c) ? 'Hoy' : 'Mañana'} a las {hora(c.inicio)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Vacio>Todo enviado.</Vacio>
            )}
          </Tarjeta>
        </div>

        <Tarjeta guia="hoy-contratos" titulo="Contratos por vencer" className="lg:col-span-5">
          {porVencer?.length ? (
            <ul className="-my-2 divide-y divide-border text-sm">
              {porVencer.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <Link href={`/inmuebles/${i.id}`} className="-my-2 py-2 font-medium text-primary hover:underline">
                    {i.codigo} {etiqueta(TIPOS_INMUEBLE, i.tipo)} en {i.distrito}
                  </Link>
                  <span className="text-muted-foreground">
                    {i.propietario_nombre ?? 'Sin propietario'}, vence el {fecha(i.contrato_vence_el)}
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
