// Escenarios de personas: varios teléfonos, intenciones y unión. Los registra probar-sql.mjs.
import assert from 'node:assert/strict'

export function registrar({ db, prueba, como, registrar, esperarError, uno, ADMIN, ASESORA, OTRO }) {
  const q = (usuario, sql, params) => como(db, usuario, () => db.query(sql, params))
  const entrante = (tel, cuerpo) =>
    como(db, null, async () => (await db.query(`select registrar_entrante_whatsapp($1, null, $2, null) r`, [tel, cuerpo])).rows[0].r)

  let persona
  prueba('Teléfonos: una persona nueva tiene su teléfono principal', async () => {
    persona = (await registrar(ASESORA, '911000001', 'Tel Uno', 'interesado')).persona_id
    const r = await uno(db, `select count(*)::int n from persona_telefonos where telefono = '51911000001' and principal and persona_id = $1`, [persona])
    assert.equal(r.n, 1)
  })

  prueba('Teléfonos: una intención desde un número secundario se suma a la misma persona', async () => {
    await q(ASESORA, `select agregar_telefono($1, '911000002')`, [persona])
    const r = await registrar(ASESORA, '911000002', 'Tel Uno', 'interesado')
    assert.equal(r.persona_id, persona)
    assert.equal(r.resultado, 'ya_activo')
  })

  prueba('Teléfonos: un WhatsApp desde el secundario cae en la misma persona y guarda el número', async () => {
    const r = await entrante('51911000002', 'Hola desde el otro número')
    assert.equal(r.persona_id, persona)
    const m = await uno(db, `select persona_id, telefono from mensajes where id = $1`, [r.mensaje_id])
    assert.equal(m.persona_id, persona)
    assert.equal(m.telefono, '51911000002')
  })

  prueba('Teléfonos: no se quita el principal; marcar principal cambia personas.telefono', async () => {
    await esperarError(q(ASESORA, `select quitar_telefono($1, '911000001')`, [persona]), /principal/)
    await q(ASESORA, `select marcar_principal($1, '911000002')`, [persona])
    const p = await uno(db, `select telefono from personas where id = $1`, [persona])
    assert.equal(p.telefono, '51911000002')
    await q(ASESORA, `select quitar_telefono($1, '911000001')`, [persona])
    const t = await uno(db, `select count(*)::int n from persona_telefonos where persona_id = $1`, [persona])
    assert.equal(t.n, 1)
    const e = await uno(
      db,
      `select count(*) filter (where tipo = 'telefono_agregado')::int ag, count(*) filter (where tipo = 'telefono_principal')::int pr,
              count(*) filter (where tipo = 'telefono_quitado')::int qu, bool_and(autor_id = $2) autor
       from eventos where persona_id = $1 and tipo like 'telefono_%'`,
      [persona, ASESORA],
    )
    assert.deepEqual([e.ag, e.pr, e.qu, e.autor], [1, 1, 1, true])
  })

  prueba('Teléfonos: un número de otro asesor da error sin datos', async () => {
    const ajena = (await registrar(OTRO, '911000003', 'Cliente Ajeno', 'interesado')).persona_id
    const e = await esperarError(q(ASESORA, `select agregar_telefono($1, '911000003')`, [persona]), /pide a un administrador/)
    assert.ok(!e.message.includes(ajena), 'no revela el id del otro cliente')
    await esperarError(q(ADMIN, `select agregar_telefono($1, '911000003')`, [persona]), new RegExp(ajena))
  })
}
