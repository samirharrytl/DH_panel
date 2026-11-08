// Aplica las migraciones en un Postgres embebido (PGlite) con lo mínimo de Supabase simulado
// (auth, storage, roles) y corre escenarios de negocio contra las funciones SQL.
// Uso: npm run test:sql
import { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const raiz = path.resolve(import.meta.dirname, '..')
const dirMigraciones = path.join(raiz, 'supabase', 'migrations')

const SIMULACION_SUPABASE = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to public;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create publication supabase_realtime;
-- Igual que Supabase: todo lo nuevo en public queda concedido a anon, authenticated y service_role
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

export async function crearBase() {
  const db = new PGlite()
  await db.exec(SIMULACION_SUPABASE)
  const archivos = (await readdir(dirMigraciones)).filter((f) => f.endsWith('.sql')).sort()
  for (const archivo of archivos) {
    const sql = await readFile(path.join(dirMigraciones, archivo), 'utf8')
    try {
      await db.exec(sql)
    } catch (e) {
      throw new Error(`Falló ${archivo}: ${e.message}`)
    }
  }
  return { db, archivos }
}

// Ejecuta como un usuario autenticado (o como service_role si id es null)
export async function como(db, id, fn) {
  await db.exec(`set role ${id ? 'authenticated' : 'service_role'}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id ?? ''])
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}

async function esperarError(promesa, texto) {
  try {
    await promesa
  } catch (e) {
    if (texto) assert.match(e.message, texto)
    return e
  }
  assert.fail(`Se esperaba un error${texto ? ` (${texto})` : ''}`)
}

const uno = async (db, sql, params) => (await db.query(sql, params)).rows[0]

async function main() {
  const { db, archivos } = await crearBase()
  console.log(`Migraciones aplicadas: ${archivos.length}`)

  const ADMIN = '00000000-0000-0000-0000-00000000000a'
  const ASESORA = '00000000-0000-0000-0000-00000000000b'
  const OTRO = '00000000-0000-0000-0000-00000000000c'
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@depahost.test'), ('${ASESORA}', 'asesor1@depahost.test'), ('${OTRO}', 'asesor2@depahost.test');
    insert into public.perfiles (id, nombre, email, rol) values
      ('${ADMIN}', 'Admin', 'admin@depahost.test', 'administrador'),
      ('${ASESORA}', 'Asesor Uno', 'asesor1@depahost.test', 'asesor'),
      ('${OTRO}', 'Asesor Dos', 'asesor2@depahost.test', 'asesor');
  `)

  const pruebas = []
  const prueba = (nombre, fn) => pruebas.push({ nombre, fn })

  // ---------- Fase 1 ----------
  prueba('HU-03: parámetros con valor por defecto y solo el admin edita', async () => {
    const p = await uno(db, `select valor, valor_defecto from parametros where clave = 'refuerzos_dias'`)
    assert.deepEqual(p.valor, [1, 3, 4])
    await como(db, ASESORA, async () => {
      const r = await db.query(`update parametros set valor = '[1,2]' where clave = 'refuerzos_dias' returning clave`)
      assert.equal(r.rows.length, 0)
    })
    await como(db, ADMIN, async () => {
      await db.query(`update parametros set valor = '[1,3,4,6]' where clave = 'refuerzos_dias'`)
    })
    const pl = await uno(db, `select count(*)::int n from plantillas where clave = 'refuerzo_4'`)
    assert.equal(pl.n, 1, 'agregar un refuerzo crea su plantilla')
    await como(db, ADMIN, () => db.query(`update parametros set valor = '[1,3,4]' where clave = 'refuerzos_dias'`))
    await esperarError(
      como(db, ADMIN, () => db.query(`update parametros set valor = '"x"' where clave = 'nivel_visita'`)),
      /Nivel financiero/,
    )
  })

  prueba('Cron: la clave de servidor pasa las validaciones de acceso; el asesor no se vuelve admin', async () => {
    assert.equal((await como(db, null, () => uno(db, 'select es_admin() a'))).a, true)
    assert.equal((await como(db, ASESORA, () => uno(db, 'select es_admin() a'))).a, false)
    assert.equal((await como(db, ADMIN, () => uno(db, 'select es_admin() a'))).a, true)
  })

  prueba('HU-02: siempre queda un administrador activo', async () => {
    await esperarError(
      como(db, ADMIN, () => db.query(`update perfiles set activo = false where id = $1`, [ADMIN])),
      /al menos un administrador/,
    )
  })

  prueba('HU-04: el admin edita plantillas y el asesor no', async () => {
    await como(db, ADMIN, () => db.query(`update plantillas set cuerpo = 'Hola [nombre]' where clave = 'retorno'`))
    const r = await como(db, ASESORA, () =>
      db.query(`update plantillas set cuerpo = 'x' where clave = 'retorno' returning clave`),
    )
    assert.equal(r.rows.length, 0)
  })

  // ---------- Fase 2 ----------
  const registrar = (usuario, tel, nombre, tipo, extra = {}) =>
    como(db, usuario, async () =>
      (
        await db.query(
          `select registrar_lead($1, $2, $3::tipo_lead, $4::canal_origen, null, null, $5, $6, $7::uuid, $8) r`,
          [tel, nombre, tipo, extra.canal ?? 'facebook', extra.datos ?? true, extra.marketing ?? false, extra.asesor ?? null, extra.nota ?? null],
        )
      ).rows[0].r,
    )

  let leadAna
  prueba('HU-05: registrar lead normaliza el teléfono y guarda consentimiento', async () => {
    const r = await registrar(ASESORA, '987 654 321', 'Ana Pérez', 'propietario', { marketing: true, nota: 'Vio el anuncio' })
    assert.equal(r.resultado, 'nuevo')
    assert.equal(r.asesor_id, ASESORA, 'el asesor que registra queda asignado')
    leadAna = r.lead_id
    const l = await uno(db, `select l.*, p.telefono from leads l join personas p on p.id = l.persona_id where l.id = $1`, [leadAna])
    assert.equal(l.telefono, '51987654321')
    assert.equal(l.consentimiento_marketing, true)
    const h = await uno(db, `select count(*)::int n from lead_historial where lead_id = $1`, [leadAna])
    assert.equal(h.n, 1, 'el estado inicial queda en el historial')
  })

  prueba('HU-05: mismo teléfono como interesado se une a la misma persona', async () => {
    const r = await registrar(ASESORA, '+51 987654321', 'Ana', 'interesado')
    assert.equal(r.resultado, 'persona_existente')
    const n = await uno(db, `select count(*)::int n from personas where telefono = '51987654321'`)
    assert.equal(n.n, 1)
  })

  prueba('HU-05/HU-10: número que lleva otro asesor se une y conserva su asesor', async () => {
    const r = await registrar(OTRO, '987654321', 'Ana', 'propietario')
    assert.equal(r.resultado, 'ya_activo')
    assert.equal(r.asesor_id, ASESORA)
    assert.equal(r.visible, false)
    const notif = await uno(db, `select count(*)::int n from notificaciones where usuario_id = $1 and tipo = 'lead_regreso'`, [ASESORA])
    assert.equal(notif.n, 1)
  })

  prueba('HU-07/HU-10: cada asesor ve solo sus leads y el admin ve todos', async () => {
    await registrar(OTRO, '912345678', 'Beto', 'interesado')
    const deAsesora = await como(db, ASESORA, () => db.query(`select nombre from v_bandeja`))
    assert.ok(deAsesora.rows.every((r) => r.nombre.startsWith('Ana')))
    const deAdmin = await como(db, ADMIN, () => db.query(`select nombre from v_bandeja`))
    assert.equal(deAdmin.rows.length, 3)
    await esperarError(
      como(db, ASESORA, () => db.query(`update leads set asesor_id = $1 where id = $2`, [OTRO, leadAna])),
      /permission denied/,
    )
    await esperarError(como(db, ASESORA, () => db.query(`select asignar_lead($1, $2)`, [leadAna, OTRO])), /administrador/)
  })

  prueba('HU-07: la bandeja muestra la próxima acción', async () => {
    const r = await como(db, ASESORA, () => db.query(`select proxima_accion from v_bandeja where id = $1`, [leadAna]))
    assert.equal(r.rows[0].proxima_accion, 'Enviar bienvenida')
  })

  prueba('HU-08: bienvenida crea refuerzos; responder los cancela', async () => {
    await como(db, ASESORA, () => db.query(`select registrar_bienvenida($1)`, [leadAna]))
    const l = await uno(db, `select estado from leads where id = $1`, [leadAna])
    assert.equal(l.estado, 'contactado')
    const refs = await db.query(`select numero, dia, fecha - hoy_lima() as delta from refuerzos where lead_id = $1 order by numero`, [leadAna])
    assert.deepEqual(refs.rows.map((r) => r.dia), [1, 3, 4])
    const persona = await uno(db, `select persona_id from leads where id = $1`, [leadAna])
    await como(db, ASESORA, () =>
      db.query(`select registrar_mensaje($1, 'entrante', 'Hola, sí me interesa', 'manual')`, [persona.persona_id]),
    )
    const despues = await uno(db, `select estado from leads where id = $1`, [leadAna])
    assert.equal(despues.estado, 'en_conversacion')
    const pend = await uno(db, `select count(*)::int n from refuerzos where lead_id = $1 and estado = 'pendiente'`, [leadAna])
    assert.equal(pend.n, 0)
  })

  prueba('HU-08: sin respuesta tras el último refuerzo pasa a No responde', async () => {
    const r = await registrar(ASESORA, '955111222', 'Carla', 'propietario')
    await como(db, ASESORA, () => db.query(`select registrar_bienvenida($1)`, [r.lead_id]))
    const refs = await db.query(`select id from refuerzos where lead_id = $1 order by numero`, [r.lead_id])
    for (const ref of refs.rows) await como(db, ASESORA, () => db.query(`select registrar_refuerzo($1)`, [ref.id]))
    // Simula que el último refuerzo se envió ayer
    await db.query(`update refuerzos set enviado_at = now() - interval '1 day' where lead_id = $1`, [r.lead_id])
    await db.query(`update leads set bienvenida_at = now() - interval '5 days' where id = $1`, [r.lead_id])
    const n = await como(db, ASESORA, async () => (await db.query(`select procesar_cadencias() n`)).rows[0].n)
    assert.equal(n, 1)
    const l = await uno(db, `select estado, estado_antes_salida from leads where id = $1`, [r.lead_id])
    assert.equal(l.estado, 'no_responde')
    assert.equal(l.estado_antes_salida, 'contactado')
    const h = await uno(db, `select nota, autor_id from lead_historial where lead_id = $1 order by id desc limit 1`, [r.lead_id])
    assert.match(h.nota, /último refuerzo/)
  })

  prueba('HU-06: lead que regresa dentro del plazo se retoma; pasado el plazo abre ciclo nuevo', async () => {
    const carla = await uno(db, `select l.id from leads l join personas p on p.id = l.persona_id where p.nombre = 'Carla'`)
    const r = await registrar(ASESORA, '955111222', 'Carla', 'propietario', { canal: 'instagram' })
    assert.equal(r.resultado, 'retomado')
    assert.equal(r.lead_id, carla.id)
    const l = await uno(db, `select estado from leads where id = $1`, [carla.id])
    assert.equal(l.estado, 'en_conversacion')
    await db.query(`update leads set ultima_interaccion_at = now() - interval '7 months' where id = $1`, [carla.id])
    const r2 = await registrar(ASESORA, '955111222', 'Carla', 'propietario')
    assert.equal(r2.resultado, 'nuevo_ciclo')
    const nuevo = await uno(db, `select ciclo, lead_anterior_id, asesor_id from leads where id = $1`, [r2.lead_id])
    assert.equal(nuevo.ciclo, 2)
    assert.equal(nuevo.lead_anterior_id, carla.id)
    assert.equal(nuevo.asesor_id, ASESORA, 'vuelve con el mismo asesor')
  })

  prueba('HU-09: cambio de estado guarda autor y nota; los estados con acción se rechazan', async () => {
    await como(db, ASESORA, () => db.query(`select cambiar_estado_lead($1, 'descartado', 'No tiene título')`, [leadAna]))
    const h = await uno(db, `select estado_nuevo, nota, autor_id from lead_historial where lead_id = $1 order by id desc limit 1`, [leadAna])
    assert.equal(h.estado_nuevo, 'descartado')
    assert.equal(h.autor_id, ASESORA)
    await como(db, ASESORA, () => db.query(`select cambiar_estado_lead($1, 'en_conversacion', 'Lo reconsideró')`, [leadAna]))
    await esperarError(como(db, ASESORA, () => db.query(`select cambiar_estado_lead($1, 'cliente')`, [leadAna])), /acción/)
    await esperarError(como(db, ASESORA, () => db.query(`select cambiar_estado_lead($1, 'calificado')`, [leadAna])), /propietarios/)
    await esperarError(
      como(db, ASESORA, () => db.query(`update leads set estado = 'cliente' where id = $1`, [leadAna])),
      /permission denied/,
    )
  })

  prueba('HU-11: Baja detiene todos los envíos de la persona', async () => {
    await como(db, ASESORA, () => db.query(`select dar_baja($1, 'Pidió no ser contactada')`, [leadAna]))
    const leads = await db.query(
      `select l.estado from leads l where l.persona_id = (select persona_id from leads where id = $1) and l.vigente`,
      [leadAna],
    )
    assert.ok(leads.rows.every((r) => r.estado === 'baja'), 'todos sus leads quedan en Baja')
    const persona = await uno(db, `select persona_id from leads where id = $1`, [leadAna])
    await esperarError(
      como(db, ASESORA, () => db.query(`select registrar_mensaje($1, 'saliente', 'Hola', 'panel')`, [persona.persona_id])),
      /Baja/,
    )
    const bandeja = await como(db, ASESORA, () => db.query(`select proxima_accion from v_bandeja where id = $1`, [leadAna]))
    assert.equal(bandeja.rows[0].proxima_accion, null)
    const r = await registrar(ASESORA, '987654321', 'Ana', 'propietario')
    assert.equal(r.resultado, 'baja', 'volver a registrarla no la reactiva sola')
  })

  prueba('Seguridad: sin sesión no se ejecuta ni se lee nada; las notas se crean con RLS', async () => {
    await db.exec('set role anon')
    try {
      await esperarError(db.query(`select registrar_lead('999888777', 'x', 'interesado', 'web')`), /permission denied/)
      await esperarError(db.query(`select * from leads`), /permission denied/)
      await esperarError(db.query(`select param('whatsapp_numero')`), /permission denied/)
    } finally {
      await db.exec('reset role')
    }
    const carla = await uno(db, `select l.id from leads l join personas p on p.id = l.persona_id where p.nombre = 'Carla' and l.vigente`)
    await como(db, ASESORA, () => db.query(`insert into notas (lead_id, texto, autor_id) values ($1, 'Llamar el lunes', $2)`, [carla.id, ASESORA]))
    await esperarError(
      como(db, ASESORA, () => db.query(`select registrar_evento('x', $1)`, [carla.id])),
      /permission denied/,
    )
  })

  prueba('Seguridad: un usuario desactivado no ve nada', async () => {
    await como(db, ADMIN, () => db.query(`update perfiles set activo = false where id = $1`, [OTRO]))
    const r = await como(db, OTRO, () => db.query(`select count(*)::int n from v_bandeja`))
    assert.equal(r.rows[0].n, 0)
    await como(db, ADMIN, () => db.query(`update perfiles set activo = true where id = $1`, [OTRO]))
  })

  const extra = await import('./probar-sql-fases.mjs').catch(() => null)
  if (extra) extra.registrar({ db, prueba, como, registrar, esperarError, uno, ADMIN, ASESORA, OTRO })

  let fallas = 0
  for (const { nombre, fn } of pruebas) {
    try {
      await fn()
      console.log(`  ok  ${nombre}`)
    } catch (e) {
      fallas++
      console.log(`  FALLA  ${nombre}\n        ${e.message}`)
    }
  }
  console.log(`\n${pruebas.length - fallas} de ${pruebas.length} escenarios pasaron`)
  process.exit(fallas ? 1 : 0)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
