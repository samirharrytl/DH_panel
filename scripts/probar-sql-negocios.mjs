// Escenarios de negocios por inmueble y búsqueda: inmuebles en captación, Cliente que sigue operando,
// varias búsquedas, vende para comprar y Contactos. Los registra probar-sql.mjs.
import assert from 'node:assert/strict'

export function registrar({ db, prueba, como, registrar, esperarError, uno, ADMIN, ASESORA, OTRO }) {
  const q = (usuario, sql, params) => como(db, usuario, () => db.query(sql, params))
  const val = async (usuario, sql, params) => Object.values((await q(usuario, sql, params)).rows[0] ?? {})[0]
  const inmuebles = async (lead) =>
    (await db.query(`select id, estado, etapa_captacion, tipo, precio, metraje from inmuebles where propietario_lead_id = $1 order by numero`, [lead])).rows

  prueba('Inmuebles: todo inmueble con propietario nace con su ficha de captación', async () => {
    const r = await registrar(ASESORA, '922000090', 'Registro Directo', 'propietario')
    const id = await val(
      ADMIN,
      `select registrar_inmueble('922000091', 'Directo Uno', 'web', true, 'casa', 'Calle 1', 'Surco', 300000, 90, 3, 2, 1, null, current_date, true, 6, 3, true)`,
    )
    const c = await uno(db, `select count(*)::int n from inmueble_captacion where inmueble_id = $1`, [id])
    assert.equal(c.n, 1)
    assert.ok(r.lead_id)
  })

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
    assert.equal((await q(OTRO, `select count(*)::int n from inmueble_captacion where inmueble_id = $1`, [a])).rows[0].n, 0)
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

  // ---------- Cliente sigue operando ----------
  let cl, ci1, ci2, citaCl
  prueba('Cliente: un propietario Cliente que vuelve sigue en el mismo lead y puede agregar y agendar', async () => {
    cl = (await registrar(ASESORA, '933000001', 'Cliente Vuelve', 'propietario')).lead_id
    ci1 = await val(ASESORA, `select agregar_inmueble($1, 'departamento', 'Av. Sol 1', 'Surco', 300000)`, [cl])
    await q(ASESORA, `update inmuebles set precio = 300000 where id = $1`, [ci1])
    await q(ASESORA, `select registrar_contrato($1, current_date, true, 6, 3, true)`, [ci1])
    assert.equal((await uno(db, `select estado from leads where id = $1`, [cl])).estado, 'cliente')
    const r2 = await registrar(ASESORA, '933000001', 'Cliente Vuelve', 'propietario')
    assert.equal(r2.lead_id, cl)
    assert.equal(r2.resultado, 'ya_activo')
    ci2 = await val(ASESORA, `select agregar_inmueble($1, 'casa', 'Calle Luna 2', 'Surco')`, [cl])
    citaCl = await val(
      ASESORA,
      `select agendar_cita($1, now() + interval '3 days', 'Calle Luna 2', 'Surco', 60, null, null, false, null, null, $2)`,
      [cl, ci2],
    )
    assert.equal((await uno(db, `select estado from leads where id = $1`, [cl])).estado, 'cliente')
    assert.equal((await uno(db, `select etapa_captacion e from inmuebles where id = $1`, [ci2])).e, 'cita_agendada')
  })

  prueba('Cliente: pasado el plazo, el ciclo nuevo se lleva los inmuebles abiertos y hereda Cliente', async () => {
    await db.query(`update leads set ultima_interaccion_at = now() - interval '7 months' where id = $1`, [cl])
    const r = await registrar(ASESORA, '933000001', 'Cliente Vuelve', 'propietario')
    assert.equal(r.resultado, 'nuevo_ciclo')
    assert.notEqual(r.lead_id, cl)
    const dueño = await db.query(`select id, propietario_lead_id from inmuebles where id in ($1, $2)`, [ci1, ci2])
    assert.ok(dueño.rows.every((x) => x.propietario_lead_id === r.lead_id), 'los dos inmuebles abiertos pasan al ciclo nuevo')
    const nuevo = await uno(db, `select estado, ciclo from leads where id = $1`, [r.lead_id])
    assert.deepEqual([nuevo.estado, nuevo.ciclo], ['cliente', 2])
    assert.equal((await uno(db, `select vigente from leads where id = $1`, [cl])).vigente, false)
    assert.equal((await uno(db, `select lead_id from citas where id = $1`, [citaCl])).lead_id, r.lead_id)
    const ev = await uno(db, `select datos from eventos where lead_id = $1 and tipo = 'ciclo_traspaso'`, [r.lead_id])
    assert.equal(ev.datos.inmuebles, 2)
  })

  prueba('Cliente: la Baja cancela las citas de un lead Cliente sin cambiar su estado', async () => {
    const lead = (await registrar(ASESORA, '933000002', 'Cliente Baja', 'propietario')).lead_id
    const i1 = await val(ASESORA, `select agregar_inmueble($1, 'departamento', 'Av. Mar 1', 'Barranco', 250000)`, [lead])
    await q(ASESORA, `update inmuebles set precio = 250000 where id = $1`, [i1])
    await q(ASESORA, `select registrar_contrato($1, current_date, true, 6, 3, true)`, [i1])
    const i2 = await val(ASESORA, `select agregar_inmueble($1, 'casa', 'Jr. Cielo 3', 'Barranco')`, [lead])
    const cita = await val(
      ASESORA,
      `select agendar_cita($1, now() + interval '2 days', 'Jr. Cielo 3', 'Barranco', 60, null, null, false, null, null, $2)`,
      [lead, i2],
    )
    await q(ASESORA, `select dar_baja($1, 'No quiere mensajes')`, [lead])
    assert.equal((await uno(db, `select estado from citas where id = $1`, [cita])).estado, 'cancelada')
    assert.equal((await uno(db, `select estado from leads where id = $1`, [lead])).estado, 'cliente')
    assert.equal((await uno(db, `select no_contactar from personas where telefono = '51933000002'`)).no_contactar, true)
  })
}
