'use client'

import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { AreaTexto, Campo, Entrada } from '@/components/legado'
import { BotonEnviar, Formulario, type Resultado } from '@/components/formulario'
import { SelectorArchivos, subirArchivos, useArchivos } from '@/components/subir-archivos'
import { registrarContrato, renovarContrato } from '../acciones'

const SI_NO = [
  ['si', 'Sí'],
  ['no', 'No'],
] as const

// HU-16 y HU-17: registrar o renovar el contrato. La copia escaneada (opcional) se sube antes desde el
// navegador y se borra si el registro falla, para no dejar archivos huérfanos.
export function FormularioContrato({ inmuebleId, contratoId, hoy }: { inmuebleId: string; contratoId?: string; hoy: string }) {
  const copia = useArchivos('contratos', false)

  async function accion(previo: Resultado | null, f: FormData): Promise<Resultado> {
    let ruta: string | null = null
    if (copia.archivos.length) {
      const { subidos, errores } = await subirArchivos('contratos', inmuebleId, copia.archivos)
      if (errores.length) return { ok: false, error: errores.join(' · ') }
      ruta = subidos[0].ruta
      f.set('archivo_ruta', ruta)
    }
    const r = await (contratoId ? renovarContrato : registrarContrato)(previo, f)
    if (!r.ok && ruta) await crearClienteNavegador().storage.from('contratos').remove([ruta])
    if (r.ok) copia.limpiar()
    return r
  }

  return (
    <Formulario accion={accion}>
      <input type="hidden" name="inmueble_id" value={inmuebleId} />
      {contratoId && <input type="hidden" name="contrato_id" value={contratoId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha de firma">
          <Entrada type="date" name="fecha_firma" defaultValue={hoy} required />
        </Campo>
        <Campo etiqueta="Plazo (meses)">
          <Entrada type="number" name="plazo_meses" min={1} required />
        </Campo>
        <Campo etiqueta="Comisión (%)">
          <Entrada type="number" name="comision_pct" min={0} max={100} step="0.01" required />
        </Campo>
      </div>
      {(
        [
          ['exclusividad', '¿Con exclusividad?'],
          ['autoriza_publicar', '¿Autoriza publicar el inmueble en redes?'],
        ] as const
      ).map(([name, texto]) => (
        <fieldset key={name}>
          <legend className="mb-1 text-sm font-medium text-tinta">{texto}</legend>
          <div className="flex gap-4">
            {SI_NO.map(([v, t]) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input type="radio" name={name} value={v} required className="accent-marino-800" /> {t}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <Campo etiqueta="Notas">
        <AreaTexto name="notas" rows={2} />
      </Campo>
      <div>
        <p className="mb-1 text-sm font-medium text-tinta">Copia escaneada (opcional)</p>
        <SelectorArchivos control={copia} etiqueta="Elegir archivo" />
      </div>
      <BotonEnviar>{contratoId ? 'Renovar contrato' : 'Registrar contrato'}</BotonEnviar>
    </Formulario>
  )
}
