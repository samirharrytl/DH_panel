import type { Metadata } from 'next'
import { exigirAdmin } from '@/lib/auth'
import { crearClienteServidor } from '@/lib/supabase/server'
import { fecha } from '@/lib/formato'
import { Aviso, Campo, Entrada, Insignia, Seleccion, Tabla, claseTd, claseTh } from '@/components/ui'
import { BotonAccion, BotonEnviar, Dialogo, Formulario } from '@/components/formulario'
import { cambiarActivo, crearUsuario, editarUsuario } from './acciones'
import { CamposAcceso } from './campos-acceso'

export const metadata: Metadata = { title: 'Usuarios' }

export default async function PaginaUsuarios() {
  const yo = await exigirAdmin()
  const supabase = await crearClienteServidor()
  const [{ data: usuarios }, { data: leads }] = await Promise.all([
    supabase.from('perfiles').select('*').order('activo', { ascending: false }).order('nombre'),
    supabase.from('leads').select('asesor_id').eq('vigente', true),
  ])
  const porAsesor = new Map<string, number>()
  leads?.forEach((l) => l.asesor_id && porAsesor.set(l.asesor_id, (porAsesor.get(l.asesor_id) ?? 0) + 1))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-suave">
          Cada persona tiene su propio acceso. El asesor ve solo los leads que se le asignan; el administrador ve todo.
        </p>
        <Dialogo titulo="Nuevo usuario" boton="+ Nuevo usuario" variante="primario" tamano="md">
          <Formulario accion={crearUsuario}>
            <Campo etiqueta="Nombre">
              <Entrada name="nombre" required />
            </Campo>
            <Campo etiqueta="Correo">
              <Entrada type="email" name="email" required />
            </Campo>
            <Campo etiqueta="Rol">
              <Seleccion name="rol" defaultValue="asesor">
                <option value="asesor">Asesor</option>
                <option value="administrador">Administrador (también trabaja como asesor)</option>
              </Seleccion>
            </Campo>
            <CamposAcceso />
            <BotonEnviar>Crear usuario</BotonEnviar>
          </Formulario>
        </Dialogo>
      </div>

      <Tabla>
        <thead>
          <tr>
            <th className={claseTh}>Nombre</th>
            <th className={claseTh}>Rol</th>
            <th className={claseTh}>Leads vigentes</th>
            <th className={claseTh}>Estado</th>
            <th className={claseTh}>Desde</th>
            <th className={claseTh} />
          </tr>
        </thead>
        <tbody>
          {usuarios?.map((u) => (
            <tr key={u.id} className={u.activo ? '' : 'text-tenue'}>
              <td className={claseTd}>
                <p className="font-medium text-tinta">{u.nombre}</p>
                <p className="text-xs text-suave">{u.email}</p>
              </td>
              <td className={claseTd}>{u.rol === 'administrador' ? 'Administrador' : 'Asesor'}</td>
              <td className={claseTd}>{porAsesor.get(u.id) ?? 0}</td>
              <td className={claseTd}>
                <Insignia color={u.activo ? 'verde' : 'gris'}>{u.activo ? 'Activo' : 'Desactivado'}</Insignia>
              </td>
              <td className={claseTd}>{fecha(u.created_at)}</td>
              <td className={`${claseTd} text-right`}>
                <div className="flex justify-end gap-2">
                  <Dialogo titulo={`Editar a ${u.nombre}`} boton="Editar">
                    <Formulario accion={editarUsuario}>
                      <input type="hidden" name="id" value={u.id} />
                      <Campo etiqueta="Nombre">
                        <Entrada name="nombre" defaultValue={u.nombre} required />
                      </Campo>
                      <Campo etiqueta="Teléfono">
                        <Entrada name="telefono" defaultValue={u.telefono ?? ''} />
                      </Campo>
                      <Campo etiqueta="Rol">
                        <Seleccion name="rol" defaultValue={u.rol}>
                          <option value="asesor">Asesor</option>
                          <option value="administrador">Administrador</option>
                        </Seleccion>
                      </Campo>
                      <BotonEnviar>Guardar</BotonEnviar>
                    </Formulario>
                  </Dialogo>
                  {u.id !== yo.id && (
                    <BotonAccion
                      accion={cambiarActivo.bind(null, u.id, !u.activo)}
                      variante={u.activo ? 'peligro' : 'secundario'}
                      confirmar={
                        u.activo
                          ? `¿Desactivar a ${u.nombre}? No podrá entrar, pero su historial se conserva.`
                          : undefined
                      }
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </BotonAccion>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <Aviso>
        Los leads de un asesor desactivado siguen a su nombre: reasígnalos desde la bandeja de leads filtrando por ese
        asesor.
      </Aviso>
    </div>
  )
}
