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

  // ---------- Intenciones ----------
  const web = (origen, tel, email, mensaje) =>
    como(db, null, async () =>
      (
        await db.query(`select registrar_lead_web($1, 'Cliente Web', $2, $3, '{}', $4, true, $5) r`, [
          origen, tel, email, mensaje, { canal_detalle: 'Web', utm: 'source=meta' },
        ])
      ).rows[0].r,
    )

  prueba('Intenciones: una intención repetida queda como evento con su detalle', async () => {
    const lead = await web('contact', '911000010', null, 'Busco depa')
    await web('ad-buy', '911000010', null, 'Vi la pauta')
    const l = await uno(db, `select persona_id from leads where id = $1`, [lead])
    const ev = (
      await db.query(
        `select datos from eventos where persona_id = $1 and tipo in ('lead_registrado', 'lead_regreso') order by id`,
        [l.persona_id],
      )
    ).rows
    assert.equal(ev.length, 2)
    assert.equal(ev[1].datos.origen, 'ad-buy')
    assert.equal(ev[1].datos.telefono, '51911000010')
    assert.equal(ev[1].datos.utm, 'source=meta')
    assert.match(ev[1].datos.mensaje, /Vi la pauta/)
    const v = await uno(db, `select count(*)::int n from leads where persona_id = $1 and vigente and tipo = 'interesado'`, [l.persona_id])
    assert.equal(v.n, 1)
  })

  prueba('Intenciones: sin asesor avisa a los administradores', async () => {
    const lead = await web('contact', '911000013', null, null)
    await web('saved-list', '911000013', null, null)
    const n = await uno(db, `select count(*)::int n from notificaciones where usuario_id = $1 and tipo = 'lead_regreso' and enlace = $2`, [
      ADMIN, `/leads/${lead}`,
    ])
    assert.equal(n.n, 1)
  })

  prueba('Sugerencia: el mismo correo con otro teléfono crea una sugerencia pendiente', async () => {
    const a = await web('contact', '911000011', 'mismo@correo.pe', null)
    const b = await web('ad-buy', '911000012', 'Mismo@Correo.pe', null)
    const pa = (await uno(db, `select persona_id from leads where id = $1`, [a])).persona_id
    const pb = (await uno(db, `select persona_id from leads where id = $1`, [b])).persona_id
    const s = await uno(db, `select id, estado from sugerencias_union where (persona_a, persona_b) in (($1, $2), ($2, $1))`, [pa, pb])
    assert.equal(s.estado, 'pendiente')
    await q(ADMIN, `select descartar_sugerencia($1)`, [s.id])
    assert.equal((await uno(db, `select estado from sugerencias_union where id = $1`, [s.id])).estado, 'descartada')
    const e = await uno(db, `select count(*)::int n from eventos where tipo = 'union_descartada' and persona_id in ($1, $2)`, [pa, pb])
    assert.equal(e.n, 2)
  })

  // ---------- Unión ----------
  const unir = (usuario, queda, absorbida, siguen = []) =>
    q(usuario, `select unir_personas($1, $2, $3::uuid[])`, [queda, absorbida, siguen])
  const par = async (t1, t2, tipo = 'interesado', usuario = ASESORA) => {
    const a = await registrar(usuario, t1, 'Persona Queda', tipo)
    const b = await registrar(usuario, t2, 'Persona Absorbida', tipo)
    return { queda: a.persona_id, leadA: a.lead_id, absorbida: b.persona_id, leadB: b.lead_id }
  }

  prueba('Unir: exige elegir el lead cuando las dos tienen uno vigente del mismo tipo', async () => {
    const { queda, absorbida } = await par('911000020', '911000021')
    await esperarError(unir(ASESORA, queda, absorbida), /Elige qué lead de interesado sigue/)
  })

  prueba('Unir: mueve todo, cierra el otro lead y deja la copia de la absorbida', async () => {
    const { queda, leadA, absorbida, leadB } = await par('911000022', '911000023')
    await entrante('51911000023', 'Hola, soy yo con otro número')
    await unir(ASESORA, queda, absorbida, [leadB])
    for (const t of ['leads', 'mensajes', 'eventos', 'persona_telefonos']) {
      const r = await uno(db, `select count(*)::int n from ${t} where persona_id = $1`, [absorbida])
      assert.equal(r.n, 0, `${t} quedó en la absorbida`)
    }
    assert.equal((await uno(db, `select count(*)::int n from personas where id = $1`, [absorbida])).n, 0)
    const tel = await uno(db, `select persona_id, principal from persona_telefonos where telefono = '51911000023'`)
    assert.deepEqual([tel.persona_id, tel.principal], [queda, false])
    const a = await uno(db, `select vigente from leads where id = $1`, [leadA])
    const b = await uno(db, `select vigente, persona_id from leads where id = $1`, [leadB])
    assert.deepEqual([a.vigente, b.vigente, b.persona_id], [false, true, queda])
    const e = await uno(db, `select datos, autor_id from eventos where persona_id = $1 and tipo = 'personas_unidas'`, [queda])
    assert.equal(e.datos.absorbida.nombre, 'Persona Absorbida')
    assert.equal(e.autor_id, ASESORA)
    const c = await uno(db, `select datos from eventos where lead_id = $1 and tipo = 'lead_cerrado_por_union'`, [leadA])
    assert.equal(c.datos.lead_que_sigue, leadB)
  })

  prueba('Unir: la Baja gana', async () => {
    const { queda, leadA, absorbida, leadB } = await par('911000024', '911000025')
    await q(ASESORA, `select dar_baja($1, 'Pidió no ser contactado')`, [leadB])
    await unir(ASESORA, queda, absorbida, [leadA])
    const p = await uno(db, `select no_contactar from personas where id = $1`, [queda])
    const l = await uno(db, `select estado from leads where id = $1`, [leadA])
    assert.deepEqual([p.no_contactar, l.estado], [true, 'baja'])
  })

  prueba('Unir: bloquea si el lead que se cierra tiene una cita pendiente', async () => {
    const { queda, leadA, absorbida, leadB } = await par('911000026', '911000027', 'propietario')
    await q(ASESORA, `select agendar_cita($1, now() + interval '2 days', 'Av. Arequipa 100', 'Lince', 60, null, null, false)`, [leadA])
    await esperarError(unir(ASESORA, queda, absorbida, [leadB]), /cita o visita pendiente/)
  })

  prueba('Unir: un asesor no une con un cliente de otro asesor', async () => {
    const mia = (await registrar(ASESORA, '911000028', 'Mía', 'interesado')).persona_id
    const ajena = (await registrar(OTRO, '911000029', 'Ajena', 'interesado')).persona_id
    await esperarError(unir(ASESORA, mia, ajena), /No tienes acceso/)
  })

  // ---------- Número de envío ----------
  prueba('Envío: con la ventana abierta va al número que escribió; sin ventana, al principal', async () => {
    const p = (await registrar(ASESORA, '911000040', 'Dos Números', 'interesado')).persona_id
    await q(ASESORA, `select agregar_telefono($1, '911000041')`, [p])
    const destino = async () => (await q(ASESORA, `select telefono_envio($1) t`, [p])).rows[0].t
    assert.equal(await destino(), '51911000040')
    await entrante('51911000041', 'Escribo desde el otro')
    assert.equal(await destino(), '51911000041')
    await db.query(`update personas set ultimo_entrante_at = now() - interval '2 days' where id = $1`, [p])
    assert.equal(await destino(), '51911000040')
  })

  prueba('Unir: con alguien en Baja se cancelan las citas pendientes, igual que en dar_baja', async () => {
    const enBaja = await registrar(ASESORA, '911000050', 'En Baja', 'interesado')
    await q(ASESORA, `select dar_baja($1, 'No quiere mensajes')`, [enBaja.lead_id])
    const conCita = await registrar(ASESORA, '911000051', 'Con Cita', 'propietario')
    const cita = (
      await q(ASESORA, `select agendar_cita($1, now() + interval '2 days', 'Av. Brasil 200', 'Jesús María', 60, null, null, false) c`, [conCita.lead_id])
    ).rows[0].c
    await unir(ASESORA, conCita.persona_id, enBaja.persona_id)
    const c = await uno(db, `select estado from citas where id = $1`, [cita])
    assert.equal(c.estado, 'cancelada')
  })

  prueba('Bandeja: cada lead muestra cuántas intenciones tiene', async () => {
    const lead = await web('contact', '911000060', null, null)
    await web('ad-buy', '911000060', null, null)
    await web('saved-list', '911000060', null, null)
    const r = await q(ADMIN, `select intenciones from v_bandeja where id = $1`, [lead])
    assert.equal(r.rows[0].intenciones, 3)
  })
}
