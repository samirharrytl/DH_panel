'use client'

import { useRef, useState } from 'react'
import { renderizar, VARIABLES } from '@/lib/plantillas'
import { Campo } from '@/components/campos'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { BotonEnviar, Formulario, type Resultado } from '@/components/formulario'

const EJEMPLO = {
  nombre: 'María',
  asesor: 'Samir',
  canal: 'Instagram',
  inmueble: 'departamento en Miraflores (DH-0012)',
  distrito: 'Miraflores',
  tema: 'el departamento de 2 dormitorios en Surco',
  opciones: '1. Departamento en Miraflores · S/ 420,000 · 2 dorm.\n2. Departamento en Barranco · S/ 395,000 · 2 dorm.',
  fecha: 'jueves 12/11',
  hora: '10:00',
  direccion: 'Av. Larco 123, Miraflores',
  resumen: '· 3 leads nuevos\n· Enviado 5 veces como match, 60 % "Me interesa"\n· 2 visitas',
  enlace_resena: 'https://g.page/r/depahost/review',
}

export function EditorPlantilla({
  clave,
  cuerpo,
  metaNombre,
  metaIdioma,
  accion,
}: {
  clave: string
  cuerpo: string
  metaNombre: string | null
  metaIdioma: string
  accion: (p: Resultado | null, f: FormData) => Promise<Resultado>
}) {
  const [texto, setTexto] = useState(cuerpo)
  const ref = useRef<HTMLTextAreaElement>(null)

  const insertar = (variable: string) => {
    const el = ref.current
    if (!el) return
    const inicio = el.selectionStart
    const nuevo = `${texto.slice(0, inicio)}[${variable}]${texto.slice(el.selectionEnd)}`
    setTexto(nuevo)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = inicio + variable.length + 2
    })
  }

  return (
    <Formulario accion={accion}>
      <input type="hidden" name="clave" value={clave} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Campo etiqueta="Mensaje" ayuda="Lo que va entre llaves { } solo aparece si sus variables tienen valor.">
            <Textarea ref={ref} name="cuerpo" value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} />
          </Campo>
          <div className="flex flex-wrap gap-1">
            {Object.entries(VARIABLES).map(([k, d]) => (
              <button
                key={k}
                type="button"
                title={d}
                onClick={() => insertar(k)}
                className="rounded border border-border bg-white px-2 py-2 font-mono text-xs text-primary hover:bg-accent sm:px-1.5 sm:py-0.5"
              >
                [{k}]
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">Vista previa</p>
          <div className="rounded-lg bg-[#e7f6e9] p-3 text-sm whitespace-pre-wrap text-foreground">{renderizar(texto, EJEMPLO)}</div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Campo
          etiqueta="Nombre de la plantilla aprobada en Meta"
          ayuda="Necesario para escribir fuera de la ventana de 24 horas. Sus parámetros {{1}}, {{2}}… deben seguir el orden de las variables del mensaje."
        >
          <Input name="meta_nombre" defaultValue={metaNombre ?? ''} placeholder="ej. refuerzo_dia_1" />
        </Campo>
        <Campo etiqueta="Idioma">
          <Input name="meta_idioma" defaultValue={metaIdioma} />
        </Campo>
      </div>
      <BotonEnviar>Guardar plantilla</BotonEnviar>
    </Formulario>
  )
}
