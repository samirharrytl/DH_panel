'use client'

import { useRouter } from 'next/navigation'
import { Play } from 'lucide-react'
import { Tarjeta } from '@/components/campos'
import { Button } from '@/components/ui/button'
import { iniciarGuia, useGuia } from '@/components/guia/estado'
import { GUIAS, capitulos, type ClaveGuia } from '@/components/guia/guias'

// Inicia una guía interactiva, completa o desde un capítulo, y lleva a la pantalla de su primer paso
export function Lanzador() {
  const router = useRouter()
  const enCurso = useGuia()

  const empezar = (clave: ClaveGuia, paso: number) => {
    iniciarGuia(clave, paso)
    const { ruta } = GUIAS[clave].pasos[paso].donde
    // Los pasos sobre una ficha se abren desde su lista: la guía indica cuál elegir
    router.push(ruta.replace('/:id', ''))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(Object.keys(GUIAS) as ClaveGuia[]).map((clave) => {
        const guia = GUIAS[clave]
        return (
          <Tarjeta
            key={clave}
            titulo={guia.titulo}
            acciones={
              <Button variant="exito" size="sm" onClick={() => empezar(clave, 0)}>
                <Play aria-hidden />
                Empezar
              </Button>
            }
          >
            <p className="mb-3 text-sm text-muted-foreground">
              {guia.descripcion} {guia.pasos.length} pasos.
            </p>
            <p className="mb-1 text-xs font-medium text-muted-foreground">O empieza desde una parte:</p>
            <ul className="divide-y divide-border">
              {capitulos(guia).map((c) => {
                const actual = enCurso?.guia === clave && enCurso.paso >= c.inicio && enCurso.paso < c.inicio + c.pasos
                return (
                  <li key={c.titulo}>
                    <button
                      type="button"
                      onClick={() => empezar(clave, c.inicio)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm text-foreground hover:text-primary"
                    >
                      <span className="min-w-0">
                        {c.titulo}
                        {actual && <span className="ml-2 text-xs font-medium text-exito-texto">En curso</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.pasos} {c.pasos === 1 ? 'paso' : 'pasos'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Tarjeta>
        )
      })}
    </div>
  )
}
