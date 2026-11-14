// Escenarios de las fases 3 a 7. Los registra probar-sql.mjs.
import assert from 'node:assert/strict'

export function registrar({ db, prueba, como, registrar, esperarError, uno, ADMIN, ASESORA, OTRO }) {
  const q = (usuario, sql, params) => como(db, usuario, () => db.query(sql, params))
  const val = async (usuario, sql, params) => Object.values((await q(usuario, sql, params)).rows[0] ?? {})[0]

  let propietario, inmueble, interesado, interesado2, contrato

  // ---------- Fase 3 ----------
  prueba('HU-13: la ficha de calificación se guarda con RLS', async () => {
    propietario = (await registrar(ASESORA, '944000111', 'Diego Propietario', 'propietario', { marketing: true })).lead_id
    await q(ASESORA, `insert into calificacion_propietario (lead_id, rol_contacto, hipoteca, tipo_inmueble, direccion, distrito, metraje, dormitorios, banos, cochera, precio_esperado, urgencia)
      values ($1, 'propietario', false, 'departamento', 'Av. Larco 123', 'Miraflores', 80, 2, 2, true, 450000, 'menos_3_meses')`, [propietario])
    await esperarError(
      q(OTRO, `insert into calificacion_propietario (lead_id) values ($1)`, [propietario]),
      /row-level security/,
    )
  })

  prueba('HU-14: agendar, reprogramar y cancelar cita con notificaciones', async () => {
    const cita = await val(ADMIN, `select agendar_cita($1, now() + interval '2 days', 'Av. Larco 123', 'Miraflores', 60, 'Portería', '1234', true)`, [propietario])
    let l = await uno(db, `select estado from leads where id = $1`, [propietario])
    assert.equal(l.estado, 'cita_agendada')
    const n = await uno(db, `select count(*)::int n from notificaciones where usuario_id = $1 and tipo = 'cita'`, [ASESORA])
    assert.equal(n.n, 1, 'el asesor recibe alerta si otro agenda')
    await q(ASESORA, `select reprogramar_cita($1, now() + interval '3 days', 'Pidió otro día')`, [cita])
    const c = await uno(db, `select reprogramaciones from citas where id = $1`, [cita])
    assert.equal(c.reprogramaciones, 1)
    await q(ASESORA, `select cancelar_cita($1, 'Viajó')`, [cita])
    l = await uno(db, `select estado from leads where id = $1`, [propietario])
    assert.equal(l.estado, 'nuevo', 'vuelve al estado previo')
    const agenda = await q(OTRO, `select count(*)::int n from citas where lead_id = $1`, [propietario])
    assert.equal(agenda.rows[0].n, 0, 'otro asesor no ve la cita')
  })

  prueba('HU-15: el resultado de la cita crea el inmueble En captación con el acceso', async () => {
    const cita = await val(ASESORA, `select agendar_cita($1, now() + interval '1 day', 'Av. Larco 123', 'Miraflores', 60, 'Portería', '1234', true)`, [propietario])
    inmueble = await val(ASESORA, `select registrar_resultado_cita($1, 'Buen estado', 'departamento', 'Av. Larco 123', 'Miraflores', 430000, 'bueno', 80, 2, 2, 1, true)`, [cita])
    const i = await uno(db, `select estado, codigo, acceso_codigo, precio_esperado from inmuebles where id = $1`, [inmueble])
    assert.equal(i.estado, 'en_captacion')
    assert.match(i.codigo, /^DH-\d{4}$/)
    assert.equal(i.acceso_codigo, '1234')
    assert.equal(Number(i.precio_esperado), 450000)
    await q(ASESORA, `insert into inmueble_fotos (inmueble_id, ruta) values ($1, $2), ($1, $3)`, [inmueble, `${inmueble}/a.jpg`, `${inmueble}/b.jpg`])
    const l = await uno(db, `select estado from leads where id = $1`, [propietario])
    assert.equal(l.estado, 'cita_realizada')
  })

  prueba('HU-16: el contrato pasa el inmueble a En cartera y el propietario a Cliente', async () => {
    await esperarError(q(OTRO, `select registrar_contrato($1, current_date, true, 6, 3, true)`, [inmueble]), /No puedes editar/)
    contrato = await val(ASESORA, `select registrar_contrato($1, current_date - 170, true, 6, 3.5, true, $2)`, [inmueble, `${inmueble}/contrato.pdf`])
    const i = await uno(db, `select estado, autoriza_publicar from inmuebles where id = $1`, [inmueble])
    assert.equal(i.estado, 'en_cartera')
    assert.equal(i.autoriza_publicar, true)
    const l = await uno(db, `select estado from leads where id = $1`, [propietario])
    assert.equal(l.estado, 'cliente')
    const k = await uno(db, `select vence_el - fecha_firma as dias from contratos where id = $1`, [contrato])
    assert.ok(k.dias >= 181 && k.dias <= 184)
  })

  prueba('Sitio web: catálogo sin datos privados y leads del sitio', async () => {
    await esperarError(q(ASESORA, `select * from inmuebles_web()`), /permission denied/)
    const cat = (await q(null, `select * from inmuebles_web()`)).rows
    const i = cat.find((r) => r.id === inmueble)
    assert.ok(i, 'el inmueble en cartera y autorizado aparece')
    assert.match(i.slug, /^departamento-en-miraflores-dh-\d{4}$/)
    assert.deepEqual(i.fotos, [`${inmueble}/a.jpg`, `${inmueble}/b.jpg`])
    assert.ok(!('direccion' in i) && !('acceso_codigo' in i))

    const lead = await val(null, `select registrar_lead_web('saved-list', 'Lucía Web', '987 111 222', null, $1, 'Hola', true, '{"canal_detalle":"Web · Guardó inmuebles"}')`, [[inmueble]])
    const l = await uno(db, `select l.tipo, l.canal, l.consentimiento_datos, l.consentimiento_marketing, l.inmueble_interes_id, p.telefono
      from leads l join personas p on p.id = l.persona_id where l.id = $1`, [lead])
    assert.deepEqual(
      { ...l },
      { tipo: 'interesado', canal: 'web', consentimiento_datos: true, consentimiento_marketing: false, inmueble_interes_id: inmueble, telefono: '51987111222' },
    )
    const anonimo = await val(null, `select registrar_lead_web('cart', null, null, null, $1, null, false, null)`, [[inmueble, '00000000-0000-0000-0000-000000000099']])
    assert.equal(anonimo, null)
    const e = await uno(db, `select count(*)::int n from eventos where tipo = 'interes_web' and inmueble_id = $1`, [inmueble])
    assert.equal(e.n, 2, 'un interés con lead y uno anónimo; el id desconocido se ignora')
    const prop = await val(null, `select registrar_lead_web('owner-sell', 'Raúl Vende', '944555666', null, null, 'Área: 90', true, null)`)
    assert.equal((await uno(db, `select tipo from leads where id = $1`, [prop])).tipo, 'propietario')
    await esperarError(q(null, `select registrar_lead_web('owner-rent', 'X', '944555667', null, null, null, true, null)`), /Origen/)
    // Para no alterar los conteos de insights (HU-30), que esperan un solo lead por este inmueble
    await db.query(`update leads set inmueble_interes_id = null where id = $1`, [lead])
  })

  prueba('HU-17: contrato por vencer según el parámetro de aviso', async () => {
    const r = await uno(db, `select count(*)::int n from contratos where estado = 'vigente' and vence_el <= hoy_lima() + param_int('contrato_aviso_dias')`)
    assert.equal(r.n, 1)
  })

  prueba('HU-18: base de propiedades visible para todos los asesores', async () => {
    const r = await q(OTRO, `select codigo, foto_portada from v_inmuebles where estado = 'en_cartera'`)
    assert.equal(r.rows.length, 1)
    assert.ok(r.rows[0].foto_portada)
    await esperarError(q(OTRO, `update inmuebles set precio = 1 where id = $1 returning id`, [inmueble]).then((r) => {
      if (r.rows.length === 0) throw new Error('row-level security: sin filas')
    }), /row-level security/)
  })

  // ---------- Fase 4 ----------
  prueba('HU-19/HU-20: perfil y capacidad declarada dejan al interesado Calificado', async () => {
    interesado = (await registrar(OTRO, '966000222', 'Elena Compradora', 'interesado')).lead_id
    await q(OTRO, `insert into busquedas (lead_id, finalidad, distritos, tipos, precio_min, precio_max, dormitorios_min, imprescindibles)
      values ($1, 'vivir', '{Miraflores,Barranco}', '{departamento}', 300000, 450000, 2, '{cochera}')`, [interesado])
    await q(OTRO, `insert into capacidad_financiera (lead_id, presupuesto_max, forma_pago) values ($1, 460000, 'credito')`, [interesado])
    const c = await uno(db, `select nivel from capacidad_financiera where lead_id = $1`, [interesado])
    assert.equal(c.nivel, 'declarada')
    const l = await uno(db, `select estado from leads where id = $1`, [interesado])
    assert.equal(l.estado, 'calificado')
  })

  prueba('HU-21: derivación precalificada sube el nivel', async () => {
    const d = await val(OTRO, `insert into derivaciones (lead_id, entidad, tipo_entidad) values ($1, 'Banco Ejemplo', 'banco') returning id`, [interesado])
    await q(OTRO, `update derivaciones set estado = 'precalificado' where id = $1`, [d])
    const c = await uno(db, `select nivel from capacidad_financiera where lead_id = $1`, [interesado])
    assert.equal(c.nivel, 'precalificada')
  })

  prueba('HU-22: matches ordenados por ajuste, excluye fuera de capacidad y rechazados', async () => {
    // Un segundo inmueble caro (fuera de capacidad)
    const caro = await val(ADMIN, `select registrar_resultado_cita(agendar_cita($1, now(), 'Calle 1', 'Miraflores'), 'ok', 'departamento', 'Calle 1', 'Miraflores', 900000, 'bueno', 120, 3, 2, 1)`, [propietario])
      .catch(() => null)
    assert.equal(caro, null, 'un cliente no agenda nuevas citas en el mismo lead (inmueble ya en cartera)')
    const r = await q(OTRO, `select * from sugerir_matches($1)`, [interesado])
    assert.equal(r.rows.length, 1)
    assert.equal(Number(r.rows[0].puntaje), 100)
    await esperarError(q(ASESORA, `select * from sugerir_matches($1)`, [interesado]), /acceso/)
  })

  let opcion
  prueba('HU-22/HU-23: registrar envío (máx. 3) y respuesta', async () => {
    await esperarError(
      q(OTRO, `select registrar_envio_match($1, array[$2, $2, $2, $2]::uuid[])`, [interesado, inmueble]),
      /entre 1 y 3/,
    )
    const envio = await val(OTRO, `select registrar_envio_match($1, array[$2]::uuid[])`, [interesado, inmueble])
    opcion = (await uno(db, `select id from match_opciones where envio_id = $1`, [envio])).id
    let l = await uno(db, `select estado from leads where id = $1`, [interesado])
    assert.equal(l.estado, 'match_enviado')
    await q(OTRO, `select registrar_respuesta_match($1, 'me_interesa')`, [opcion])
    const ev = await uno(db, `select count(*)::int n from eventos where tipo = 'match_respuesta' and lead_id = $1`, [interesado])
    assert.equal(ev.n, 1, 'la respuesta queda guardada para el piloto')
    const asesorInmueble = await q(ASESORA, `select respuesta from match_opciones where id = $1`, [opcion])
    assert.equal(asesorInmueble.rows[0].respuesta, 'me_interesa', 'el asesor del inmueble ve el feedback')
  })

  prueba('HU-24: novedad respeta el tope de frecuencia y las bajas', async () => {
    interesado2 = (await registrar(OTRO, '977000333', 'Fabio', 'interesado')).lead_id
    await q(OTRO, `select registrar_respuesta($1)`, [interesado2])
    await q(OTRO, `insert into busquedas (lead_id, distritos, tipos) values ($1, '{Miraflores}', '{departamento}')`, [interesado2])
    const cand = await q(OTRO, `select * from interesados_para_inmueble($1)`, [inmueble])
    assert.deepEqual(cand.rows.map((r) => r.nombre), ['Fabio'], 'no incluye a quien ya lo recibió')
    await q(OTRO, `select registrar_envio_match($1, array[$2]::uuid[], 'novedad')`, [interesado2, inmueble])
    const err = await val(OTRO, `select validar_envio_match($1, 'novedad', 1)`, [interesado2])
    assert.match(err, /tope/)
    const pend = await q(OTRO, `select * from novedades_pendientes()`)
    assert.equal(pend.rows.length, 0)
  })

  prueba('HU-25: priorización por ajuste, precio y disponibilidad', async () => {
    const r = await q(OTRO, `select * from priorizar_interes($1)`, [interesado])
    assert.equal(r.rows.length, 1)
    assert.equal(Number(r.rows[0].disponibilidad), 1)
    assert.ok(Number(r.rows[0].prioridad) > 0.7)
  })

  let visita
  prueba('HU-20/HU-26: visita exige nivel y toma el acceso del inmueble', async () => {
    await q(OTRO, `insert into capacidad_financiera (lead_id) values ($1)`, [interesado2])
    await esperarError(q(OTRO, `select agendar_visita($1, $2, now() + interval '1 day')`, [interesado2, inmueble]), /nivel financiero/)
    visita = await val(OTRO, `select agendar_visita($1, $2, now() + interval '1 day')`, [interesado, inmueble])
    const c = await uno(db, `select acceso_codigo, acceso_dni, distrito, asesor_id from citas where id = $1`, [visita])
    assert.equal(c.acceso_codigo, '1234')
    assert.equal(c.distrito, 'Miraflores')
    const l = await uno(db, `select estado from leads where id = $1`, [interesado])
    assert.equal(l.estado, 'visita_agendada')
  })

  prueba('HU-27: opinión ligada a la visita y al inmueble', async () => {
    await q(OTRO, `select registrar_opinion_visita($1, 4, 'alto', 'La luz', 'El ruido')`, [visita])
    const o = await uno(db, `select inmueble_id from visita_opiniones where cita_id = $1`, [visita])
    assert.equal(o.inmueble_id, inmueble)
    const visibles = await q(ASESORA, `select count(*)::int n from visita_opiniones where inmueble_id = $1`, [inmueble])
    assert.equal(visibles.rows[0].n, 1, 'el asesor del inmueble ve la opinión')
    const l = await uno(db, `select estado from leads where id = $1`, [interesado])
    assert.equal(l.estado, 'visita_realizada')
  })

  // ---------- Fase 5 ----------
  prueba('HU-12: mensaje entrante por WhatsApp abre la ventana de 24 h y se guarda en el chat', async () => {
    const r = await val(null, `select registrar_entrante_whatsapp('51966000222', 'Elena', 'Hola, ¿sigue disponible?', 'wamid.1')`)
    assert.ok(r.mensaje_id)
    const dup = await val(null, `select registrar_entrante_whatsapp('51966000222', 'Elena', 'Hola', 'wamid.1')`)
    assert.equal(dup.duplicado, true)
    const p = await uno(db, `select ventana_abierta(persona_id) v from leads where id = $1`, [interesado])
    assert.equal(p.v, true)
    await esperarError(q(OTRO, `select registrar_entrante_whatsapp('51966000222', 'x', 'x', 'wamid.2')`), /permission denied/)
    const chat = await q(OTRO, `select count(*)::int n from mensajes m join leads l on l.persona_id = m.persona_id where l.id = $1`, [interesado])
    assert.equal(chat.rows[0].n, 1)
  })

  prueba('HU-12: número desconocido queda sin lead y avisa al admin; estados de entrega no retroceden', async () => {
    await val(null, `select registrar_entrante_whatsapp('51911222333', 'Desconocido', 'Info por favor', 'wamid.3')`)
    const n = await uno(db, `select count(*)::int n from notificaciones where usuario_id = $1 and tipo = 'mensaje' and enlace like '/chats%'`, [ADMIN])
    assert.ok(n.n >= 1)
    const persona = (await uno(db, `select persona_id from leads where id = $1`, [interesado])).persona_id
    await q(OTRO, `select registrar_mensaje($1, 'saliente', 'Sí, sigue', 'panel', null, 'enviado', 'texto', null, 'wamid.out1')`, [persona])
    await val(null, `select actualizar_estado_whatsapp('wamid.out1', 'leido')`)
    await val(null, `select actualizar_estado_whatsapp('wamid.out1', 'entregado')`)
    const m = await uno(db, `select estado from mensajes where wa_id = 'wamid.out1'`)
    assert.equal(m.estado, 'leido')
  })

  // ---------- Fase 6 ----------
  let pub
  prueba('HU-28: sugerencia diaria solo con autorización y registro por red', async () => {
    const s = await q(OTRO, `select * from sugerir_publicaciones()`)
    assert.equal(s.rows.length, 1)
    assert.match(s.rows[0].motivo, /Nuevo/)
    const r = await q(OTRO, `select * from registrar_publicacion($1, array['Facebook', 'Instagram'])`, [inmueble])
    assert.equal(r.rows.length, 2)
    pub = r.rows[0]
    assert.match(pub.codigo, /^P[0-9A-F]{6}$/)
  })

  prueba('HU-29: lead que llega por el enlace queda asociado a la publicación', async () => {
    const r = await val(null, `select registrar_entrante_whatsapp('51988777666', 'Gina', $1, 'wamid.4')`,
      [`Hola, me interesa el inmueble (ref. ${pub.codigo})`])
    const l = await uno(db, `select tipo, canal, publicacion_id, inmueble_interes_id, estado from leads where id = $1`, [r.lead_id])
    assert.equal(l.tipo, 'interesado')
    assert.equal(l.canal, 'facebook')
    assert.equal(l.publicacion_id, pub.id)
    assert.equal(l.inmueble_interes_id, inmueble)
    assert.equal(l.estado, 'en_conversacion')
  })

  prueba('HU-30: insights con leads, matches, visitas, opiniones y precio por zona', async () => {
    await q(OTRO, `update publicaciones set vistas = 120, interacciones = 15 where id = $1`, [pub.id])
    const d = await val(ASESORA, `select insights_inmueble($1, hoy_lima() - 7, hoy_lima())`, [inmueble])
    assert.equal(d.leads_generados, 1)
    assert.equal(d.veces_match, 2)
    assert.equal(d.pct_me_interesa, 50)
    assert.equal(d.visitas_realizadas, 1)
    assert.equal(d.opiniones.length, 1)
    assert.equal(d.vistas, 120)
    const id = await val(ASESORA, `select guardar_insights($1, hoy_lima() - 7, hoy_lima(), 'Resumen')`, [inmueble])
    assert.ok(id)
  })

  // ---------- Fase 7 ----------
  let compraventa
  prueba('HU-20/HU-31: compraventa exige nivel; el cierre pasa a Vendido y Cliente', async () => {
    await esperarError(q(OTRO, `select iniciar_compraventa($1, $2)`, [interesado2, inmueble]), /nivel financiero/)
    compraventa = await val(OTRO, `select iniciar_compraventa($1, $2)`, [interesado, inmueble])
    await q(OTRO, `select cerrar_compraventa($1, hoy_lima(), 425000, 12750)`, [compraventa])
    const i = await uno(db, `select estado from inmuebles where id = $1`, [inmueble])
    assert.equal(i.estado, 'vendido')
    const l = await uno(db, `select estado from leads where id = $1`, [interesado])
    assert.equal(l.estado, 'cliente')
    const k = await uno(db, `select estado from contratos where id = $1`, [contrato])
    assert.equal(k.estado, 'terminado')
  })

  prueba('HU-32: testimonios programados para comprador y vendedor', async () => {
    const t = await db.query(`select rol, programado_para - hoy_lima() as dias from testimonios where compraventa_id = $1 order by rol`, [compraventa])
    assert.deepEqual(t.rows.map((r) => [r.rol, r.dias]), [['comprador', 7], ['vendedor', 7]])
  })

  prueba('HU-33: clientes por intención en la lista de marketing', async () => {
    await q(OTRO, `update personas set intencion = 'invertir' where id = (select persona_id from leads where id = $1)`, [interesado])
    const r = await q(ADMIN, `select nombre, intencion from v_clientes_marketing order by nombre`)
    assert.deepEqual(r.rows.map((x) => x.nombre), ['Diego Propietario', 'Elena Compradora'])
  })

  prueba('HU-34/HU-35: tablero solo para el admin y dataset de propietarios', async () => {
    await esperarError(q(ASESORA, `select tablero(hoy_lima() - 30, hoy_lima())`), /administrador/)
    const t = await val(ADMIN, `select tablero(hoy_lima() - 30, hoy_lima())`)
    assert.equal(t.piloto_match.envios, 2)
    assert.equal(t.piloto_match.pct_me_interesa, 50)
    assert.equal(t.negocio.compraventas_cerradas, 1)
    const conv = t.conversiones.find((c) => c.tipo === 'interesado' && c.estado === 'cliente')
    assert.equal(conv.alcanzaron, 1)
    const ds = await q(ADMIN, `select firmo, urgencia from v_dataset_propietarios where lead_id = $1`, [propietario])
    assert.equal(ds.rows[0].firmo, true)
  })

  // ---------- Coexistencia y costos de WhatsApp ----------
  prueba('Coexistencia: lo enviado desde el celular y el historial quedan en el chat sin alertas', async () => {
    const app = (tel, dir, wa, origen = 'celular', fecha = 'now()') =>
      val(null, `select registrar_mensaje_app('${tel}', null, '${dir}', 'hola', '${wa}', 'texto', ${fecha}, '${origen}')`)
    await val(null, `select registrar_entrante_whatsapp('51955000111', 'Rosa', 'Hola', 'wamid.co1')`)
    const r = await app('51955000111', 'saliente', 'wamid.co2')
    assert.ok(r.mensaje_id)
    assert.equal((await app('51955000111', 'saliente', 'wamid.co2')).duplicado, true)
    const m = await uno(db, `select origen, estado from mensajes where wa_id = 'wamid.co2'`)
    assert.deepEqual([m.origen, m.estado], ['celular', 'enviado'])
    const sinLeer = await uno(db, `select count(*)::int n from mensajes where wa_id = 'wamid.co1' and leido_at is null`)
    assert.equal(sinLeer.n, 0, 'responder desde el celular marca lo anterior como leído')
    await esperarError(q(ADMIN, `select registrar_mensaje_app('51955000111', null, 'entrante', 'x', 'wamid.co3', 'texto', now(), 'celular')`), /permission denied/)

    const avisos = async () => (await uno(db, `select count(*)::int n from notificaciones`)).n
    const antes = await avisos()
    await app('51955000222', 'entrante', 'wamid.co4', 'importado', `now() - interval '40 days'`)
    const h = await uno(db, `select m.leido_at is not null leido, p.ultimo_entrante_at < now() - interval '30 days' vieja
      from mensajes m join personas p on p.id = m.persona_id where wa_id = 'wamid.co4'`)
    assert.deepEqual([h.leido, h.vieja], [true, true], 'el historial llega leído y no abre la ventana de 24 h')
    assert.equal(await avisos(), antes, 'el historial no genera alertas')

    await db.query(`update personas set no_contactar = true where telefono = '51955000222'`)
    await app('51955000222', 'saliente', 'wamid.co5')
    const baja = await uno(db, `select count(*)::int n from notificaciones where usuario_id = $1 and titulo = 'Mensaje a una persona en Baja'`, [ADMIN])
    assert.equal(baja.n, 1, 'se guarda y se avisa al admin si desde el celular se escribe a alguien en Baja')
    await esperarError(
      q(ADMIN, `select registrar_mensaje((select id from personas where telefono = '51955000222'), 'saliente', 'x', 'panel')`),
      /Baja/,
    )
  })

  prueba('Costos de WhatsApp: cobro informado por Meta, estimado y cupo gratis del chat', async () => {
    const costos = async () => {
      const c = await val(ADMIN, `select costos_whatsapp(hoy_lima(), hoy_lima())`)
      const cat = (k) => c.categorias.find((x) => x.categoria === k) ?? { enviados: 0, cobrables: 0, costo: 0 }
      return { c, marketing: cat('marketing'), utility: cat('utility'), servicio: cat('servicio') }
    }
    await esperarError(q(ASESORA, `select costos_whatsapp(hoy_lima(), hoy_lima())`), /administrador/)
    const a = await costos()
    const persona = (await uno(db, `select id from personas where telefono = '51955000111'`)).id
    await q(ADMIN, `select registrar_mensaje($1, 'saliente', 'x', 'panel', null, 'enviado', 'plantilla', 'novedades', 'wamid.cs1')`, [persona])
    await q(ADMIN, `select registrar_mensaje($1, 'saliente', 'x', 'panel', null, 'enviado', 'plantilla', 'cita_confirmacion', 'wamid.cs2')`, [persona])
    await val(null, `select actualizar_estado_whatsapp('wamid.cs1', 'leido')`)
    await val(null, `select actualizar_estado_whatsapp('wamid.cs1', 'entregado', null, 'marketing', 'regular')`)
    const m = await uno(db, `select estado, cobro_categoria, cobro_tipo from mensajes where wa_id = 'wamid.cs1'`)
    assert.deepEqual([m.estado, m.cobro_categoria, m.cobro_tipo], ['leido', 'marketing', 'regular'], 'el cobro se guarda aunque el estado no retroceda')
    const b = await costos()
    assert.equal(b.marketing.cobrables - a.marketing.cobrables, 1)
    assert.equal(b.utility.cobrables - a.utility.cobrables, 1, 'la confirmación de cita se estima como utility')
    assert.equal(b.c.estimados - a.c.estimados, 1)
    assert.equal(b.servicio.cobrables, 0, 'el chat dentro del cupo gratis no se cobra')
    assert.ok(b.c.desde_celular >= 2)
    await q(ADMIN, `update parametros set valor = '0' where clave = 'whatsapp_servicio_gratis_mes'`)
    const sinCupo = await costos()
    assert.equal(sinCupo.servicio.cobrables, sinCupo.servicio.enviados, 'sin cupo, todo el chat se cobra')
    await q(ADMIN, `update parametros set valor = '1000' where clave = 'whatsapp_servicio_gratis_mes'`)
    await esperarError(q(ADMIN, `update parametros set valor = '-1' where clave = 'whatsapp_tarifa_marketing'`), /mayor o igual a 0/)
  })

  prueba('Sitio web: registro directo de un inmueble con contrato lo publica', async () => {
    const args = `'departamento', 'Jr. Prueba 456', 'Barranco', 380000, 70, 2, 1, 0, 'Luminoso', current_date, false, 12, 3, true`
    const id = await val(OTRO, `select registrar_inmueble('966777888', 'Rosa Dueña', 'referido', true, ${args})`)
    const i = await uno(db, `select i.estado, i.asesor_id, i.autoriza_publicar, l.estado as lead_estado, l.tipo, l.consentimiento_datos
      from inmuebles i join leads l on l.id = i.propietario_lead_id where i.id = $1`, [id])
    assert.deepEqual({ ...i }, { estado: 'en_cartera', asesor_id: OTRO, autoriza_publicar: true, lead_estado: 'cliente', tipo: 'propietario', consentimiento_datos: true })
    const web = (await q(null, `select id from inmuebles_web()`)).rows.map((r) => r.id)
    assert.ok(web.includes(id), 'aparece en el catálogo del sitio')
    await esperarError(q(OTRO, `select registrar_inmueble('966777889', 'X', 'otro', false, 'casa', '', 'Lince', 1, null, null, null, null, null, current_date, false, 12, 3, true)`), /dirección/)
    await esperarError(
      como(db, null, async () => {
        await db.exec('set role anon')
        return db.query(`select registrar_inmueble('966777889', 'X', 'otro', false, ${args})`)
      }),
      /permission denied/,
    )
  })

  prueba('Push: el dispositivo es del último usuario que lo activa y cada uno ve solo los suyos', async () => {
    const ep = 'https://push.test/dispositivo-1'
    await q(ASESORA, `select guardar_suscripcion_push($1, 'p1', 'a1')`, [ep])
    assert.equal(await val(ASESORA, `select count(*)::int from suscripciones_push`), 1)
    await q(OTRO, `select guardar_suscripcion_push($1, 'p2', 'a2')`, [ep])
    const s = await uno(db, `select usuario_id, p256dh from suscripciones_push where endpoint = $1`, [ep])
    assert.deepEqual({ ...s }, { usuario_id: OTRO, p256dh: 'p2' }, 'el navegador compartido pasa al nuevo usuario')
    assert.equal(await val(ASESORA, `select count(*)::int from suscripciones_push`), 0)
    await esperarError(q(ASESORA, `insert into suscripciones_push (endpoint, usuario_id, p256dh, auth) values ('https://x', $1, 'p', 'a')`, [ASESORA]), /permission denied|row-level security/)
    await q(ASESORA, `delete from suscripciones_push where endpoint = $1`, [ep])
    assert.equal(await val(OTRO, `select count(*)::int from suscripciones_push`), 1, 'no borra el de otro')
    await q(OTRO, `delete from suscripciones_push where endpoint = $1`, [ep])
    assert.equal(await val(OTRO, `select count(*)::int from suscripciones_push`), 0)
    await esperarError(
      como(db, null, async () => {
        await db.exec('set role anon')
        return db.query(`select guardar_suscripcion_push('https://y', 'p', 'a')`)
      }),
      /permission denied/,
    )
    // Sin pg_net ni Vault (PGlite, local) el trigger no estorba
    await db.query(`insert into notificaciones (usuario_id, tipo, titulo) values ($1, 'prueba', 'Aviso')`, [ASESORA])
  })

  prueba('Push: cada aviso nuevo llama a /api/push con el secreto de Vault', async () => {
    await db.exec(`
      create schema net;
      create table net.llamadas (url text, body jsonb, headers jsonb);
      create table net.falla (activa boolean);
      insert into net.falla values (false);
      create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint
      language plpgsql as $$
      begin
        if (select activa from net.falla) then raise exception 'pg_net caído'; end if;
        insert into net.llamadas values (url, body, headers || jsonb_build_object('timeout', timeout_milliseconds));
        return 1;
      end $$;
      create schema vault;
      create table vault.decrypted_secrets (name text, decrypted_secret text);
      insert into vault.decrypted_secrets values ('panel_url', 'https://panel.test/'), ('panel_cron_secret', 's3cr3t');
    `)
    try {
      const n = await uno(db, `insert into notificaciones (usuario_id, tipo, titulo) values ($1, 'prueba', 'Aviso') returning id`, [ASESORA])
      const ll = await uno(db, `select url, body, headers->>'Authorization' as auth from net.llamadas`)
      assert.deepEqual({ ...ll }, { url: 'https://panel.test/api/push', body: { id: Number(n.id) }, auth: 'Bearer s3cr3t' })
      assert.equal((await uno(db, `select headers->>'timeout' t from net.llamadas`)).t, '10000', 'margen para el arranque en frío de Vercel')
      // Si el push falla, el aviso (y el lead o mensaje que lo creó) se guarda igual
      await db.exec('update net.falla set activa = true')
      await db.query(`insert into notificaciones (usuario_id, tipo, titulo) values ($1, 'prueba', 'Sin push')`, [ASESORA])
      assert.equal((await uno(db, `select count(*)::int n from notificaciones where titulo = 'Sin push'`)).n, 1)
    } finally {
      await db.exec('drop schema net cascade; drop schema vault cascade;')
    }
  })
}
