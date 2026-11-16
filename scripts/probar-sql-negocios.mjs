// Escenarios de negocios por inmueble y búsqueda: inmuebles en captación, Cliente que sigue operando,
// varias búsquedas, vende para comprar y Contactos. Los registra probar-sql.mjs.
import assert from 'node:assert/strict'

export function registrar({ db, prueba, como, registrar, esperarError, uno, ADMIN, ASESORA, OTRO }) {
  const q = (usuario, sql, params) => como(db, usuario, () => db.query(sql, params))
  const val = async (usuario, sql, params) => Object.values((await q(usuario, sql, params)).rows[0] ?? {})[0]
  const inmuebles = async (lead) =>
    (await db.query(`select id, estado, etapa_captacion, tipo, precio, metraje from inmuebles where propietario_lead_id = $1 order by numero`, [lead])).rows

  // ---------- Inmuebles en captación ----------
  let lead, a, b, cita
  prueba('Inmuebles: un propietario agrega dos inmuebles en captación', async () => {
    lead = (await registrar(ASESORA, '922000001', 'Propietario Dos', 'propietario')).lead_id
    a = await val(ASESORA, `select agregar_inmueble($1, 'departamento', 'Av. Larco 1', 'Miraflores') `, [lead])
    b = await val(ASESORA, `select agregar_inmueble($1)`, [lead])
    const rows = await inmuebles(lead)
    assert.equal(rows.length, 2)
    assert.deepEqual(rows.map((r) => r.etapa_captacion), ['calificando', 'calificando'])
    assert.equal(rows[1].tipo, null)
    const e = await uno(db, `select count(*)::int n from eventos where lead_id = $1 and tipo = 'inmueble_agregado'`, [lead])
    assert.equal(e.n, 2)
    const c = await uno(db, `select count(*)::int n from inmueble_captacion where inmueble_id in ($1, $2)`, [a, b])
    assert.equal(c.n, 2)
  })

  prueba('Inmuebles: con dos inmuebles la cita exige elegir', async () => {
    await esperarError(
      q(ASESORA, `select agendar_cita($1, now() + interval '2 days', 'Av. Larco 1', 'Miraflores')`, [lead]),
      /Elige el inmueble/,
    )
    assert.equal((await uno(db, `select count(*)::int n from citas where lead_id = $1`, [lead])).n, 0)
    cita = await val(
      ASESORA,
      `select agendar_cita($1, now() + interval '2 days', 'Av. Larco 1', 'Miraflores', 60, 'Portería', '1234', true, null, null, $2)`,
      [lead, a],
    )
    const rows = await inmuebles(lead)
    assert.deepEqual(rows.map((r) => r.etapa_captacion), ['cita_agendada', 'calificando'])
    const ev = await uno(db, `select datos from eventos where inmueble_id = $1 and tipo = 'etapa_inmueble'`, [a])
    assert.equal(ev.datos.a, 'cita_agendada')
  })

  prueba('Inmuebles: el resultado de la cita actualiza el inmueble, no crea otro', async () => {
    await q(
      ASESORA,
      `select registrar_resultado_cita($1, 'Buen estado', 'departamento', 'Av. Larco 1', 'Miraflores', 430000, 'bueno', 80, 2, 2, 1, true)`,
      [cita],
    )
    const rows = await inmuebles(lead)
    assert.equal(rows.length, 2)
    assert.deepEqual([rows[0].etapa_captacion, Number(rows[0].precio), Number(rows[0].metraje)], ['cita_realizada', 430000, 80])
  })

  prueba('Inmuebles: cancelar la única cita devuelve la etapa', async () => {
    const c2 = await val(
      ASESORA,
      `select agendar_cita($1, now() + interval '4 days', 'Av. Larco 1', 'Miraflores', 60, null, null, false, null, null, $2)`,
      [lead, a],
    )
    assert.equal((await inmuebles(lead))[0].etapa_captacion, 'cita_agendada')
    await q(ASESORA, `select cancelar_cita($1, 'Viajó')`, [c2])
    assert.equal((await inmuebles(lead))[0].etapa_captacion, 'cita_realizada')
    const c3 = await val(
      ASESORA,
      `select agendar_cita($1, now() + interval '5 days', 'Jr. Lima 2', 'Lince', 60, null, null, false, null, null, $2)`,
      [lead, b],
    )
    await q(ASESORA, `select cancelar_cita($1, 'No pudo')`, [c3])
    assert.equal((await inmuebles(lead))[1].etapa_captacion, 'calificando')
  })

  prueba('Inmuebles: la captación sensible solo la ve el asesor del lead', async () => {
    await q(ASESORA, `update inmueble_captacion set hipoteca = true, hipoteca_banco = 'BCP', hipoteca_saldo = 100000 where inmueble_id = $1`, [a])
    assert.equal((await q(OTRO, `select count(*)::int n from inmueble_captacion`)).rows[0].n, 0)
    assert.equal((await q(OTRO, `select count(*)::int n from inmuebles where id = $1`, [a])).rows[0].n, 1)
    assert.equal(await val(ASESORA, `select hipoteca_banco from inmueble_captacion where inmueble_id = $1`, [a]), 'BCP')
    assert.equal((await q(ADMIN, `select count(*)::int n from inmueble_captacion where inmueble_id = $1`, [a])).rows[0].n, 1)
  })

  prueba('Inmuebles: el contrato exige tipo, dirección y distrito', async () => {
    await esperarError(
      q(ASESORA, `select registrar_contrato($1, current_date, true, 6, 3, true)`, [b]),
      /tipo, la dirección y el distrito/,
    )
    await q(ASESORA, `select registrar_contrato($1, current_date, true, 6, 3, true)`, [a])
    const rows = await inmuebles(lead)
    assert.deepEqual([rows[0].estado, rows[0].etapa_captacion], ['en_cartera', null])
  })
}
