import Link from 'next/link'
import { fecha, fechaHora, num } from '@/lib/formato'
import { Campo, Entrada, Insignia, claseBoton } from '@/components/ui'
import { BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { Copiar } from '@/components/copiar'
import { guardarMetricas } from './acciones'
import { describirCorto, enlaceWhatsApp, textoParaRed, type Publicacion } from './texto'

// Publicaciones con su enlace único de WhatsApp (HU-29) y métricas editables a mano (HU-30)
export function ListaPublicaciones({
  publicaciones,
  numero,
  hoy,
  mostrarInmueble = true,
}: {
  publicaciones: Publicacion[]
  numero: string
  hoy: string
  mostrarInmueble?: boolean
}) {
  return (
    <ul className="space-y-3">
      {publicaciones.map((p) => (
        <ItemPublicacion key={p.id} p={p} numero={numero} hoy={hoy} mostrarInmueble={mostrarInmueble} />
      ))}
    </ul>
  )
}

function ItemPublicacion({ p, numero, hoy, mostrarInmueble }: { p: Publicacion; numero: string; hoy: string; mostrarInmueble: boolean }) {
  const enlace = enlaceWhatsApp(numero, p.inmueble?.codigo ?? '', p.codigo)
  const paraRed = textoParaRed(p.texto, enlace)
  const esDeHoy = p.publicada_el === hoy

  return (
    <li className={esDeHoy ? 'rounded-lg border border-emerald-300 bg-emerald-50/40 p-3' : 'rounded-lg border border-borde-suave p-3'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Insignia color={esDeHoy ? 'verde' : 'marino'}>{p.red}</Insignia>
            <span className="text-sm text-tinta">{esDeHoy ? 'Hoy' : fecha(p.publicada_el)}</span>
            <span className="font-mono text-xs text-suave" title="Código de la publicación">
              {p.codigo}
            </span>
          </div>
          {mostrarInmueble && p.inmueble && (
            <Link href={`/inmuebles/${p.inmueble_id}`} className="mt-1 block truncate text-sm font-medium text-marino-800 hover:underline">
              {p.inmueble.codigo} · {describirCorto(p.inmueble)}
            </Link>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center">
          <Metrica etiqueta="Vistas" valor={p.vistas} />
          <Metrica etiqueta="Interacc." valor={p.interacciones} />
          <Metrica etiqueta="Leads" valor={p.leads} />
        </dl>
      </div>

      <div className="mt-3 space-y-1">
        <p className="text-xs text-suave">Enlace de WhatsApp de esta publicación</p>
        {enlace ? (
          <div className="flex items-center gap-2">
            <a
              href={enlace}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate rounded-md bg-fondo px-2 py-1.5 font-mono text-xs text-marino-700 hover:underline"
            >
              {enlace}
            </a>
            <Copiar texto={enlace} etiqueta="Copiar" />
          </div>
        ) : (
          <p className="text-xs text-amber-800">Falta configurar el número de WhatsApp de DepaHost.</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {p.url ? (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className={claseBoton('fantasma', 'sm')}>
            Ver publicación ↗
          </a>
        ) : (
          <span className="text-xs text-tenue">Sin enlace a la publicación</span>
        )}
        <Dialogo titulo={`Publicación ${p.codigo} · ${p.red}`} boton="Editar enlace y métricas" variante="fantasma">
          <Formulario accion={guardarMetricas}>
            <input type="hidden" name="id" value={p.id} />
            <Campo etiqueta="Enlace a la publicación">
              <Entrada type="url" name="url" defaultValue={p.url ?? ''} placeholder="https://www.instagram.com/p/…" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Vistas">
                <Entrada type="number" name="vistas" min={0} step={1} defaultValue={p.vistas} />
              </Campo>
              <Campo etiqueta="Interacciones">
                <Entrada type="number" name="interacciones" min={0} step={1} defaultValue={p.interacciones} />
              </Campo>
            </div>
            <p className="text-xs text-suave">
              Se ingresan a mano mientras no haya integración con las redes. Anota el total acumulado que muestra la red.
              {p.metricas_at && ` Última actualización: ${fechaHora(p.metricas_at)}.`}
            </p>
            <BotonEnviar>Guardar</BotonEnviar>
          </Formulario>
        </Dialogo>
      </div>

      {paraRed && (
        <details open={esDeHoy} className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-marino-700">Texto para publicar</summary>
          <div className="mt-2 space-y-2">
            <p className="rounded-lg bg-fondo p-3 text-sm break-words whitespace-pre-wrap text-tinta">{paraRed}</p>
            <Copiar texto={paraRed} etiqueta="Copiar texto con enlace" variante="primario" />
          </div>
        </details>
      )}
    </li>
  )
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-suave">{etiqueta}</dt>
      <dd className="text-base font-semibold text-tinta">{num(valor)}</dd>
    </div>
  )
}
