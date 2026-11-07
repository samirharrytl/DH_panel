// Carga datos de demostración en la base de desarrollo para probar el panel sin empezar de cero.
// Usa números ficticios 51900000XXX y los asigna al primer administrador.
// Uso: npm run db:demo            (carga)
//      npm run db:demo -- --borrar (borra todo lo de demostración)
// No lo uses en producción.
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '..', '.env.local'))
} catch {
  // Sin .env.local se usan las variables del entorno
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const PREFIJO = '51900000'

async function ok(promesa, que) {
  const { data, error } = await promesa
  if (error) throw new Error(`${que}: ${error.message}`)
  return data
}

async function borrar() {
  const personas = await ok(supabase.from('personas').select('id').like('telefono', `${PREFIJO}%`), 'personas')
  const ids = personas.map((p) => p.id)
  if (!ids.length) return console.log('No hay datos de demostración.')
  const leads = (await ok(supabase.from('leads').select('id').in('persona_id', ids), 'leads')).map((l) => l.id)
  const inmuebles = (await ok(supabase.from('inmuebles').select('id').in('persona_id', ids), 'inmuebles')).map((i) => i.id)
  const enLeads = (t, col = 'lead_id') => supabase.from(t).delete().in(col, leads.length ? leads : ['00000000-0000-0000-0000-000000000000'])
  const enInm = (t, col = 'inmueble_id') => supabase.from(t).delete().in(col, inmuebles.length ? inmuebles : ['00000000-0000-0000-0000-000000000000'])
  await ok(supabase.from('leads').update({ publicacion_id: null, inmueble_interes_id: null, lead_anterior_id: null }).in('persona_id', ids), 'leads')
  for (const t of ['match_opciones', 'visita_opiniones', 'testimonios']) await ok(enLeads(t), t)
  await ok(enInm('match_opciones'), 'match_opciones')
  await ok(enInm('visita_opiniones'), 'visita_opiniones')
  await ok(enLeads('match_envios'), 'match_envios')
  const cvs = await ok(supabase.from('compraventas').select('id').in('inmueble_id', inmuebles.length ? inmuebles : ['00000000-0000-0000-0000-000000000000']), 'compraventas')
  if (cvs.length) await ok(supabase.from('testimonios').delete().in('compraventa_id', cvs.map((c) => c.id)), 'testimonios')
  await ok(enLeads('compraventas'), 'compraventas')
  await ok(enInm('compraventas'), 'compraventas')
  await ok(enLeads('citas'), 'citas')
  await ok(enInm('citas'), 'citas')
  for (const t of ['contratos', 'inmueble_fotos', 'insights_resumenes', 'publicaciones']) await ok(enInm(t), t)
  await ok(supabase.from('eventos').delete().in('persona_id', ids), 'eventos')
  await ok(enInm('eventos'), 'eventos')
  await ok(supabase.from('refuerzos').update({ mensaje_id: null }).in('lead_id', leads.length ? leads : ['00000000-0000-0000-0000-000000000000']), 'refuerzos')
  await ok(supabase.from('mensajes').delete().in('persona_id', ids), 'mensajes')
  for (const t of ['notas', 'refuerzos', 'lead_historial', 'busquedas', 'capacidad_financiera', 'derivaciones', 'calificacion_propietario'])
    await ok(enLeads(t), t)
  if (leads.length) {
    for (const l of leads) await ok(supabase.from('notificaciones').delete().like('enlace', `/leads/${l}%`), 'notificaciones')
  }
  await ok(supabase.from('leads').delete().in('persona_id', ids), 'leads')
  if (inmuebles.length) await ok(supabase.from('inmuebles').delete().in('id', inmuebles), 'inmuebles')
  await ok(supabase.from('personas').delete().in('id', ids), 'personas')
  console.log(`Borrados ${ids.length} contactos de demostración y todo lo relacionado.`)
}

async function lead(telefono, nombre, tipo, canal, asesor, extra = {}) {
  const r = await ok(
    supabase.rpc('registrar_lead_interno', {
      p_telefono: PREFIJO + telefono,
      p_nombre: nombre,
      p_tipo: tipo,
      p_canal: canal,
      p_canal_detalle: 'Demo',
      p_email: null,
      p_consentimiento_datos: true,
      p_consentimiento_marketing: extra.marketing ?? true,
      p_asesor_id: asesor,
      p_nota: extra.nota ?? null,
    }),
    `lead ${nombre}`,
  )
  return r
}

async function cargar() {
  const admin = await ok(
    supabase.from('perfiles').select('id, nombre').eq('rol', 'administrador').eq('activo', true).order('created_at').limit(1).maybeSingle(),
    'admin',
  )
  if (!admin) throw new Error('Primero crea tu usuario con npm run crear-admin')
  const yaHay = await ok(supabase.from('personas').select('id').like('telefono', `${PREFIJO}%`).limit(1), 'personas')
  if (yaHay.length) return console.log('Ya hay datos de demostración. Bórralos con: npm run db:demo -- --borrar')
  const yo = admin.id
  const ahora = new Date()
  const dias = (n) => new Date(ahora.getTime() + n * 86_400_000).toISOString()

  // Propietarios con inmueble en cartera
  const fichas = [
    { tel: '101', nombre: 'Rosa Quispe', tipo: 'departamento', distrito: 'Miraflores', dir: 'Av. Larco 1150, dpto. 702', m2: 85, dorm: 2, banos: 2, coch: 1, asc: true, precio: 465000 },
    { tel: '102', nombre: 'Jorge Huamán', tipo: 'departamento', distrito: 'Santiago de Surco', dir: 'Jr. Monte Rosa 240, dpto. 301', m2: 110, dorm: 3, banos: 2, coch: 1, asc: true, precio: 520000 },
    { tel: '103', nombre: 'Lucía Torres', tipo: 'casa', distrito: 'La Molina', dir: 'Calle Las Retamas 155', m2: 220, dorm: 4, banos: 3, coch: 2, asc: false, precio: 890000 },
    { tel: '104', nombre: 'Martín Salas', tipo: 'departamento', distrito: 'Barranco', dir: 'Av. Grau 520, dpto. 4B', m2: 70, dorm: 2, banos: 1, coch: 0, asc: true, precio: 398000 },
  ]
  const inmuebles = []
  for (const [i, f] of fichas.entries()) {
    const r = await lead(f.tel, f.nombre, 'propietario', i % 2 ? 'facebook' : 'instagram', yo)
    await ok(
      supabase.from('calificacion_propietario').insert({
        lead_id: r.lead_id, rol_contacto: 'propietario', hipoteca: false, tipo_inmueble: f.tipo, direccion: f.dir,
        distrito: f.distrito, metraje: f.m2, dormitorios: f.dorm, banos: f.banos, cochera: f.coch > 0,
        precio_esperado: f.precio * 1.05, urgencia: 'menos_3_meses', inscrito_sunarp: true, copropietarios: false,
      }),
      'calificación',
    )
    const inm = await ok(
      supabase
        .from('inmuebles')
        .insert({
          propietario_lead_id: r.lead_id, persona_id: r.persona_id, asesor_id: yo, tipo: f.tipo, direccion: f.dir,
          distrito: f.distrito, metraje: f.m2, dormitorios: f.dorm, banos: f.banos, cocheras: f.coch, ascensor: f.asc,
          mascotas: i !== 1, precio_esperado: f.precio * 1.05, precio: f.precio, conservacion: 'bueno',
          acceso_llave: 'Portería', acceso_codigo: i % 2 ? null : `40${i}2`, acceso_dni: true,
          estado: 'en_cartera', en_cartera_at: dias(-i * 9 - 1), autoriza_publicar: i !== 3,
          descripcion: 'Inmueble de demostración.',
        })
        .select('id')
        .single(),
      'inmueble',
    )
    inmuebles.push(inm.id)
    await ok(
      supabase.from('contratos').insert({
        inmueble_id: inm.id, fecha_firma: dias(-i * 60 - 10).slice(0, 10), exclusividad: i !== 2,
        plazo_meses: i === 3 ? 3 : 6, comision_pct: 3, autoriza_publicar: i !== 3,
      }),
      'contrato',
    )
    await ok(supabase.rpc('fijar_estado', { p_lead_id: r.lead_id, p_estado: 'cliente', p_nota: 'Datos de demostración' }), 'estado')
  }

  // Propietarios en seguimiento
  const nuevo = await lead('201', 'Carmen Rojas', 'propietario', 'web', yo, { nota: 'Quiere vender su departamento en San Isidro.' })
  const conCadencia = await lead('202', 'Pedro Vargas', 'propietario', 'tiktok', yo)
  // Bienvenida de hace dos días con el primer refuerzo vencido (registrar_bienvenida exige sesión)
  await ok(supabase.from('leads').update({ bienvenida_at: dias(-2) }).eq('id', conCadencia.lead_id), 'bienvenida')
  await ok(
    supabase.from('refuerzos').insert([
      { lead_id: conCadencia.lead_id, numero: 1, dia: 1, fecha: dias(-1).slice(0, 10) },
      { lead_id: conCadencia.lead_id, numero: 2, dia: 3, fecha: dias(1).slice(0, 10) },
      { lead_id: conCadencia.lead_id, numero: 3, dia: 4, fecha: dias(2).slice(0, 10) },
    ]),
    'refuerzos',
  )
  await ok(supabase.rpc('fijar_estado', { p_lead_id: conCadencia.lead_id, p_estado: 'contactado', p_nota: 'Bienvenida enviada' }), 'estado')
  const conCita = await lead('203', 'Ana Medina', 'propietario', 'referido', yo)
  await ok(supabase.rpc('fijar_estado', { p_lead_id: conCita.lead_id, p_estado: 'en_conversacion', p_nota: 'Respondió' }), 'estado')
  await ok(
    supabase.from('calificacion_propietario').insert({
      lead_id: conCita.lead_id, rol_contacto: 'encargado', tiene_poder: true, hipoteca: true, hipoteca_banco: 'BCP',
      tipo_inmueble: 'departamento', direccion: 'Av. Javier Prado Este 2450, dpto. 1203', distrito: 'San Borja',
      metraje: 95, dormitorios: 3, precio_esperado: 480000, urgencia: '3_a_6_meses',
    }),
    'calificación',
  )
  const hoy10 = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(ahora)}T16:00:00-05:00`).toISOString()
  await ok(
    supabase.from('citas').insert({
      tipo: 'cita_propietario', lead_id: conCita.lead_id, asesor_id: yo, inicio: hoy10, direccion: 'Av. Javier Prado Este 2450, dpto. 1203',
      distrito: 'San Borja', acceso_llave: 'La tiene el encargado', acceso_dni: true, numero: 1, estado_lead_previo: 'en_conversacion',
    }),
    'cita',
  )
  await ok(supabase.rpc('fijar_estado', { p_lead_id: conCita.lead_id, p_estado: 'cita_agendada', p_nota: 'Cita 1 agendada' }), 'estado')

  // Interesados
  const interesados = [
    { tel: '301', nombre: 'Diego Paredes', distritos: ['Miraflores', 'Barranco'], tipos: ['departamento'], min: 350000, max: 480000, dorm: 2, imp: ['ascensor'], presupuesto: 480000, pago: 'credito' },
    { tel: '302', nombre: 'Valeria Chávez', distritos: ['Santiago de Surco', 'San Borja'], tipos: ['departamento'], min: 400000, max: 550000, dorm: 3, imp: ['cochera'], presupuesto: 560000, pago: 'mixto' },
    { tel: '303', nombre: 'Andrés Flores', distritos: ['La Molina'], tipos: ['casa'], min: 700000, max: 950000, dorm: 3, imp: ['cochera', 'jardín'], presupuesto: null, pago: null },
  ]
  for (const it of interesados) {
    const r = await lead(it.tel, it.nombre, 'interesado', 'instagram', yo)
    await ok(supabase.rpc('marcar_respuesta_lead', { p_lead_id: r.lead_id }), 'respuesta')
    await ok(
      supabase.from('busquedas').insert({
        lead_id: r.lead_id, finalidad: 'vivir', distritos: it.distritos, tipos: it.tipos, precio_min: it.min,
        precio_max: it.max, dormitorios_min: it.dorm, imprescindibles: it.imp,
      }),
      'búsqueda',
    )
    await ok(
      supabase.from('capacidad_financiera').insert({ lead_id: r.lead_id, presupuesto_max: it.presupuesto, forma_pago: it.pago }),
      'capacidad',
    )
  }
  // Un mensaje reciente de Diego abre su ventana de 24 horas
  await ok(
    supabase.rpc('registrar_entrante_whatsapp', {
      p_telefono: `${PREFIJO}301`, p_nombre: 'Diego Paredes', p_cuerpo: 'Hola, ¿tienen departamentos en Miraflores?',
      p_wa_id: `sim.demo.${Date.now()}`, p_tipo: 'texto', p_fecha: ahora.toISOString(), p_payload: {}, p_origen: 'simulado',
    }),
    'mensaje',
  )
  console.log(`Datos de demostración cargados y asignados a ${admin.nombre}: 4 inmuebles en cartera, 3 propietarios en seguimiento y 3 interesados.`)
  console.log('Para borrarlos: npm run db:demo -- --borrar')
}

try {
  if (process.argv.includes('--borrar')) await borrar()
  else await cargar()
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
