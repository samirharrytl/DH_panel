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

  // ---------- Varias búsquedas por interesado ----------
  let interesadoBusquedas, busquedaA, busquedaB, terreno
  prueba('Búsquedas: un interesado tiene dos búsquedas y el match usa la mejor', async () => {
    interesadoBusquedas = (await registrar(ASESORA, '944000401', 'Inés Dos Búsquedas', 'interesado')).lead_id
    busquedaA = await val(
      ASESORA,
      `insert into busquedas (lead_id, nombre, finalidad, distritos, tipos, precio_min, precio_max, dormitorios_min)
       values ($1, 'Depa Miraflores', 'vivir', '{Miraflores}', '{departamento}', 300000, 500000, 2) returning id`,
      [interesadoBusquedas],
    )
    busquedaB = await val(
      ASESORA,
      `insert into busquedas (lead_id, nombre, finalidad, distritos, tipos, precio_min, precio_max)
       values ($1, 'Terreno Surco', 'invertir', '{Surco}', '{terreno}', 200000, 400000) returning id`,
      [interesadoBusquedas],
    )
    const vendedor = (await registrar(ASESORA, '944000402', 'Vendedor Terreno', 'propietario')).lead_id
    terreno = await val(ASESORA, `select agregar_inmueble($1, 'terreno', 'Calle Sur 10', 'Surco', 300000)`, [vendedor])
    await q(ASESORA, `update inmuebles set precio = 300000 where id = $1`, [terreno])
    await q(ASESORA, `select registrar_contrato($1, current_date, true, 6, 3, true)`, [terreno])
    const m = await uno(db, `select calcular_match($1, $2) m`, [interesadoBusquedas, terreno])
    assert.equal(m.m.busqueda_nombre, 'Terreno Surco')
    assert.equal(m.m.busqueda_id, busquedaB)
    assert.equal(
      (await uno(db, `select count(*)::int n from eventos where lead_id = $1 and tipo = 'busqueda_agregada'`, [interesadoBusquedas])).n,
      2,
    )
  })

  prueba('Búsquedas: el envío guarda con qué búsqueda hizo match', async () => {
    await q(ASESORA, `select registrar_envio_match($1, array[$2]::uuid[])`, [interesadoBusquedas, terreno])
    const o = await uno(
      db,
      `select busqueda_id, detalle from match_opciones where lead_id = $1 and inmueble_id = $2`,
      [interesadoBusquedas, terreno],
    )
    assert.equal(o.busqueda_id, busquedaB)
    assert.equal(o.detalle.busqueda_nombre, 'Terreno Surco')
  })

  let compradorCierre, busquedaCumplida, busquedaSigue, terreno1, terreno2
  prueba('Búsquedas: al cerrar, la búsqueda queda cumplida y la otra sigue recibiendo novedades', async () => {
    compradorCierre = (await registrar(ASESORA, '944000403', 'Carla Cierra', 'interesado')).lead_id
    busquedaCumplida = await val(
      ASESORA,
      `insert into busquedas (lead_id, nombre, distritos, tipos, precio_min, precio_max)
       values ($1, 'Terreno para invertir', '{Surco}', '{terreno}', 200000, 350000) returning id`,
      [compradorCierre],
    )
    busquedaSigue = await val(
      ASESORA,
      `insert into busquedas (lead_id, nombre, distritos, tipos, precio_max)
       values ($1, 'Terreno para vivir', '{}', '{terreno}', 250000) returning id`,
      [compradorCierre],
    )
    await q(
      ASESORA,
      `insert into capacidad_financiera (lead_id, presupuesto_max, forma_pago, nivel)
       values ($1, 500000, 'contado', 'precalificada')`,
      [compradorCierre],
    )

    const vendedor1 = (await registrar(ASESORA, '944000404', 'Vendedor Terreno Uno', 'propietario')).lead_id
    terreno1 = await val(ASESORA, `select agregar_inmueble($1, 'terreno', 'Calle Sur 20', 'Surco', 300000)`, [vendedor1])
    await q(ASESORA, `update inmuebles set precio = 300000 where id = $1`, [terreno1])
    await q(ASESORA, `select registrar_contrato($1, current_date, true, 6, 3, true)`, [terreno1])
    // El envío deja registrada la búsqueda de mayor puntaje
    await q(ASESORA, `select registrar_envio_match($1, array[$2]::uuid[])`, [compradorCierre, terreno1])
    assert.equal(
      (await uno(db, `select busqueda_id from match_opciones where lead_id = $1 and inmueble_id = $2`, [compradorCierre, terreno1]))
        .busqueda_id,
      busquedaCumplida,
    )

    const cv = await val(ASESORA, `select iniciar_compraventa($1, $2)`, [compradorCierre, terreno1])
    await q(ASESORA, `select cerrar_compraventa($1, hoy_lima(), 300000, 9000)`, [cv])
    const b1 = await uno(db, `select activa, cumplida_at from busquedas where id = $1`, [busquedaCumplida])
    assert.equal(b1.activa, false)
    assert.ok(b1.cumplida_at)
    assert.equal((await uno(db, `select activa from busquedas where id = $1`, [busquedaSigue])).activa, true)
    assert.equal((await uno(db, `select estado from leads where id = $1`, [compradorCierre])).estado, 'cliente')
    assert.equal(
      (await uno(db, `select count(*)::int n from eventos where lead_id = $1 and tipo = 'busqueda_cumplida'`, [compradorCierre])).n,
      1,
    )

    // Otro terreno entra en cartera: la búsqueda activa recibe la novedad aunque el lead sea Cliente
    const vendedor2 = (await registrar(ASESORA, '944000405', 'Vendedor Terreno Dos', 'propietario')).lead_id
    terreno2 = await val(ASESORA, `select agregar_inmueble($1, 'terreno', 'Calle Sur 30', 'Surco', 280000)`, [vendedor2])
    await q(ASESORA, `update inmuebles set precio = 280000 where id = $1`, [terreno2])
    await q(ASESORA, `select registrar_contrato($1, current_date, true, 6, 3, true)`, [terreno2])
    const cand = await q(ASESORA, `select lead_id from interesados_para_inmueble($1)`, [terreno2])
    assert.ok(cand.rows.some((r) => r.lead_id === compradorCierre), 'la búsqueda que sigue activa recibe la novedad')
  })

  prueba('Búsquedas: pasado el plazo, el ciclo nuevo se lleva las búsquedas activas', async () => {
    const viejo = (await registrar(ASESORA, '944000406', 'Iván Vuelve', 'interesado')).lead_id
    const activa = await val(
      ASESORA,
      `insert into busquedas (lead_id, nombre, tipos) values ($1, 'Casa Surco', '{casa}') returning id`,
      [viejo],
    )
    const cerrada = await val(
      ASESORA,
      `insert into busquedas (lead_id, nombre, tipos, activa, cumplida_at)
       values ($1, 'Depa Cumplido', '{departamento}', false, now()) returning id`,
      [viejo],
    )
    await db.query(`update leads set ultima_interaccion_at = now() - interval '7 months' where id = $1`, [viejo])
    const r = await registrar(ASESORA, '944000406', 'Iván Vuelve', 'interesado')
    assert.equal(r.resultado, 'nuevo_ciclo')
    assert.equal((await uno(db, `select lead_id from busquedas where id = $1`, [activa])).lead_id, r.lead_id)
    assert.equal((await uno(db, `select lead_id from busquedas where id = $1`, [cerrada])).lead_id, viejo)
    const ev = await uno(db, `select datos from eventos where lead_id = $1 and tipo = 'ciclo_traspaso'`, [r.lead_id])
    assert.equal(ev.datos.busquedas, 1)
  })

  // ---------- Vende para comprar, bandeja y dataset ----------
  prueba('Vende para comprar: solo entre leads de la misma persona', async () => {
    const interesado = (await registrar(ASESORA, '955000501', 'Vende y Compra', 'interesado')).lead_id
    const propietario = (await registrar(ASESORA, '955000501', 'Vende y Compra', 'propietario')).lead_id
    const ajeno = (await registrar(ASESORA, '955000502', 'Otro Propietario', 'propietario')).lead_id
    await q(ASESORA, `select vincular_venta($1, $2)`, [interesado, propietario])
    assert.equal((await uno(db, `select lead_venta_id from leads where id = $1`, [interesado])).lead_venta_id, propietario)
    const enBandeja = await uno(db, `select lead_venta_id, busquedas_activas from v_bandeja where id = $1`, [interesado])
    assert.deepEqual([enBandeja.lead_venta_id, enBandeja.busquedas_activas], [propietario, 0])
    await esperarError(q(ASESORA, `select vincular_venta($1, $2)`, [interesado, ajeno]), /misma persona/)
    await esperarError(q(ASESORA, `select vincular_venta($1, $2)`, [propietario, interesado]), /interesado/)
    const ev = await uno(db, `select count(*)::int n from eventos where lead_id = $1 and tipo = 'vende_para_comprar'`, [interesado])
    assert.equal(ev.n, 1)
    await q(ASESORA, `select vincular_venta($1, null)`, [interesado])
    assert.equal((await uno(db, `select lead_venta_id from leads where id = $1`, [interesado])).lead_venta_id, null)
  })

  prueba('Bandeja: el propietario muestra sus inmuebles con su etapa', async () => {
    const r = await uno(db, `select inmuebles, busquedas_activas from v_bandeja where id = $1`, [lead])
    assert.equal(r.inmuebles.length, 2)
    assert.deepEqual(r.inmuebles.map((i) => [i.estado, i.etapa]), [['en_cartera', null], ['en_captacion', 'calificando']])
    assert.ok(r.inmuebles.every((i) => /^DH-\d{4}$/.test(i.codigo)))
    assert.equal(r.busquedas_activas, 0)
  })
}
