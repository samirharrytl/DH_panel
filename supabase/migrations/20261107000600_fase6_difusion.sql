-- Fase 6: difusión en redes e insights al propietario (HU-28 a HU-30)

create table public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  inmueble_id uuid not null references public.inmuebles (id),
  red text not null,
  codigo text not null unique default ('P' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  publicada_el date not null default public.hoy_lima(),
  url text,
  texto text,
  vistas int not null default 0 check (vistas >= 0),
  interacciones int not null default 0 check (interacciones >= 0),
  metricas_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid()
);

create index publicaciones_inmueble_idx on public.publicaciones (inmueble_id, publicada_el desc);

alter table public.leads add column publicacion_id uuid references public.publicaciones (id);

create or replace function public.canal_de_red(p_red text) returns public.canal_origen
language sql immutable as $$
  select case
    when lower(p_red) like '%canal%' then 'canal_whatsapp'
    when lower(p_red) like '%whatsapp%' then 'whatsapp'
    when lower(p_red) like '%facebook%' then 'facebook'
    when lower(p_red) like '%instagram%' then 'instagram'
    when lower(p_red) like '%tiktok%' then 'tiktok'
    else 'otro'
  end::public.canal_origen;
$$;

-- HU-28: sugerencia rotativa. Primero los que nunca se publicaron, luego los de menor interés y los
-- que llevan más tiempo sin publicarse.
create or replace function public.sugerir_publicaciones()
returns table (
  inmueble_id uuid, codigo text, tipo text, distrito text, precio numeric, en_cartera_at timestamptz,
  publicaciones int, ultima_publicacion date, interes int, motivo text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_usuario_activo() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  return query
  with base as (
    select i.id, i.codigo, i.tipo, i.distrito, i.precio, i.en_cartera_at,
      (select count(*)::int from public.publicaciones p where p.inmueble_id = i.id) as n_pub,
      (select max(p.publicada_el) from public.publicaciones p where p.inmueble_id = i.id) as ultima,
      (
        (select count(*) from public.leads l where l.inmueble_interes_id = i.id)
        + (select count(*) from public.match_opciones mo where mo.inmueble_id = i.id and mo.respuesta = 'me_interesa')
        + (select count(*) from public.citas c where c.inmueble_id = i.id and c.tipo = 'visita' and c.estado in ('programada', 'realizada'))
      )::int as interes
    from public.inmuebles i
    where i.estado = 'en_cartera' and i.autoriza_publicar
  )
  select b.id, b.codigo, b.tipo, b.distrito, b.precio, b.en_cartera_at, b.n_pub, b.ultima, b.interes,
    case
      when b.n_pub = 0 then 'Nuevo: aún no se publica'
      when b.ultima = public.hoy_lima() then 'Ya se publicó hoy'
      else 'Interés acumulado: ' || b.interes || ' · última publicación hace ' || (public.hoy_lima() - b.ultima) || ' días'
    end
  from base b
  order by (b.n_pub = 0) desc, (b.ultima = public.hoy_lima()) asc, b.interes asc, b.ultima asc nulls first, b.en_cartera_at desc;
end $$;

-- HU-28 y HU-29: registra la publicación (una por red) con su código único para el enlace de WhatsApp
create or replace function public.registrar_publicacion(
  p_inmueble_id uuid, p_redes text[], p_fecha date default null, p_texto text default null
) returns setof public.publicaciones
language plpgsql security definer set search_path = public as $$
declare
  i public.inmuebles%rowtype;
  v_red text;
begin
  if not public.es_usuario_activo() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  select * into i from public.inmuebles where id = p_inmueble_id;
  if i.estado is distinct from 'en_cartera' then
    raise exception 'Solo se publican inmuebles en cartera';
  end if;
  if not i.autoriza_publicar then
    raise exception 'El propietario no autorizó publicar este inmueble';
  end if;
  if coalesce(cardinality(p_redes), 0) = 0 then
    raise exception 'Elige al menos una red';
  end if;
  foreach v_red in array p_redes loop
    return query
    insert into public.publicaciones (inmueble_id, red, publicada_el, texto)
    values (p_inmueble_id, v_red, coalesce(p_fecha, public.hoy_lima()), p_texto)
    returning *;
  end loop;
  perform public.registrar_evento('publicacion', null,
    jsonb_build_object('redes', p_redes, 'fecha', coalesce(p_fecha, public.hoy_lima())), p_inmueble_id, i.persona_id);
end $$;

-- HU-29: atribución desde el panel (el asesor anota el código que trae el lead)
create or replace function public.atribuir_publicacion(p_lead_id uuid, p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.publicaciones%rowtype;
begin
  if not public.puede_ver_lead(p_lead_id) then
    raise exception 'No tienes acceso a este lead' using errcode = '42501';
  end if;
  select * into p from public.publicaciones where codigo = upper(trim(p_codigo));
  if not found then
    raise exception 'No existe una publicación con el código %', p_codigo;
  end if;
  update public.leads set publicacion_id = p.id, inmueble_interes_id = p.inmueble_id where id = p_lead_id;
  perform public.registrar_evento('atribucion_publicacion', p_lead_id,
    jsonb_build_object('publicacion_id', p.id, 'codigo', p.codigo, 'red', p.red), p.inmueble_id);
end $$;

-- HU-29: un lead que llega por el enlace queda asociado al inmueble y a la publicación
create or replace function public.atribuir_mensaje_entrante(p_persona_id uuid, p_cuerpo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_codigo text := (regexp_match(upper(coalesce(p_cuerpo, '')), '\m(P[0-9A-F]{6})\M'))[1];
  p public.publicaciones%rowtype;
  v_persona public.personas%rowtype;
  v_resultado jsonb;
  v_lead uuid;
begin
  if v_codigo is null then
    return null;
  end if;
  select * into p from public.publicaciones where codigo = v_codigo;
  if not found then
    return null;
  end if;
  select * into v_persona from public.personas where id = p_persona_id;
  v_resultado := public.registrar_lead_interno(
    v_persona.telefono, v_persona.nombre, 'interesado', public.canal_de_red(p.red),
    'Publicación ' || p.codigo, null, false, false, null, null
  );
  v_lead := (v_resultado ->> 'lead_id')::uuid;
  update public.leads
  set publicacion_id = coalesce(publicacion_id, p.id), inmueble_interes_id = p.inmueble_id
  where id = v_lead;
  perform public.registrar_evento('atribucion_publicacion', v_lead,
    jsonb_build_object('publicacion_id', p.id, 'codigo', p.codigo, 'red', p.red, 'origen', 'enlace'), p.inmueble_id);
  return v_lead;
end $$;

-- HU-30: indicadores de interés de un inmueble en un periodo
create or replace function public.insights_inmueble(p_inmueble_id uuid, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  i public.inmuebles%rowtype;
  v_desde timestamptz := p_desde::timestamp at time zone 'America/Lima';
  v_hasta timestamptz := (p_hasta + 1)::timestamp at time zone 'America/Lima';
  v_enviados int;
  v_interesa int;
  v_m2 numeric;
  v_m2_zona numeric;
  v_similares int;
begin
  if not public.es_usuario_activo() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  select * into i from public.inmuebles where id = p_inmueble_id;

  select count(*), count(*) filter (where mo.respuesta = 'me_interesa')
  into v_enviados, v_interesa
  from public.match_opciones mo join public.match_envios e on e.id = mo.envio_id
  where mo.inmueble_id = p_inmueble_id and e.enviado_at >= v_desde and e.enviado_at < v_hasta;

  if i.metraje > 0 and i.precio > 0 then
    v_m2 := i.precio / i.metraje;
    select avg(o.precio / o.metraje), count(*) into v_m2_zona, v_similares
    from public.inmuebles o
    where o.id <> i.id and o.estado in ('en_cartera', 'vendido') and o.tipo = i.tipo
      and lower(o.distrito) = lower(i.distrito) and o.metraje > 0 and o.precio > 0;
  end if;

  return jsonb_build_object(
    'inmueble', jsonb_build_object('id', i.id, 'codigo', i.codigo, 'tipo', i.tipo, 'distrito', i.distrito, 'precio', i.precio),
    'desde', p_desde,
    'hasta', p_hasta,
    'publicaciones', (select count(*) from public.publicaciones where inmueble_id = i.id and publicada_el between p_desde and p_hasta),
    'vistas', (select coalesce(sum(vistas), 0) from public.publicaciones where inmueble_id = i.id),
    'interacciones', (select coalesce(sum(interacciones), 0) from public.publicaciones where inmueble_id = i.id),
    'leads_generados', (
      select count(*) from public.leads l
      left join public.publicaciones pu on pu.id = l.publicacion_id
      where (l.inmueble_interes_id = i.id or pu.inmueble_id = i.id)
        and l.created_at >= v_desde and l.created_at < v_hasta
    ),
    'veces_match', v_enviados,
    'me_interesa', v_interesa,
    'pct_me_interesa', case when v_enviados > 0 then round(100.0 * v_interesa / v_enviados) end,
    'visitas_agendadas', (
      select count(*) from public.citas
      where inmueble_id = i.id and tipo = 'visita' and created_at >= v_desde and created_at < v_hasta
    ),
    'visitas_realizadas', (
      select count(*) from public.citas
      where inmueble_id = i.id and tipo = 'visita' and estado = 'realizada'
        and realizada_at >= v_desde and realizada_at < v_hasta
    ),
    'opiniones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'calificacion', o.calificacion, 'interes', o.interes, 'le_gusto', o.le_gusto,
        'no_le_gusto', o.no_le_gusto, 'comentario', o.comentario) order by o.created_at)
      from public.visita_opiniones o
      where o.inmueble_id = i.id and o.created_at >= v_desde and o.created_at < v_hasta
    ), '[]'::jsonb),
    'precio_m2', round(v_m2),
    'precio_m2_zona', round(v_m2_zona),
    'similares', coalesce(v_similares, 0),
    'diferencia_zona_pct', case when v_m2_zona > 0 then round(100 * (v_m2 - v_m2_zona) / v_m2_zona) end
  );
end $$;

create table public.insights_resumenes (
  id uuid primary key default gen_random_uuid(),
  inmueble_id uuid not null references public.inmuebles (id) on delete cascade,
  desde date not null,
  hasta date not null,
  datos jsonb not null,
  texto text not null,
  mensaje_id uuid references public.mensajes (id),
  enviado_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles (id) default auth.uid()
);

create index insights_inmueble_idx on public.insights_resumenes (inmueble_id, created_at desc);

create or replace function public.guardar_insights(
  p_inmueble_id uuid, p_desde date, p_hasta date, p_texto text, p_mensaje_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.puede_editar_inmueble(p_inmueble_id) then
    raise exception 'No puedes gestionar este inmueble' using errcode = '42501';
  end if;
  insert into public.insights_resumenes (inmueble_id, desde, hasta, datos, texto, mensaje_id, enviado_at)
  values (p_inmueble_id, p_desde, p_hasta, public.insights_inmueble(p_inmueble_id, p_desde, p_hasta), p_texto,
          p_mensaje_id, case when p_mensaje_id is not null then now() end)
  returning id into v_id;
  perform public.registrar_evento(case when p_mensaje_id is null then 'insights_generados' else 'insights_enviados' end,
    (select propietario_lead_id from public.inmuebles where id = p_inmueble_id),
    jsonb_build_object('resumen_id', v_id, 'desde', p_desde, 'hasta', p_hasta), p_inmueble_id);
  return v_id;
end $$;

-- Inmuebles a los que les toca el resumen según la frecuencia (sin propietarios en Baja)
create or replace function public.insights_pendientes()
returns table (inmueble_id uuid, codigo text, distrito text, propietario text, ultimo_envio timestamptz, desde date)
language sql stable security definer set search_path = public as $$
  select i.id, i.codigo, i.distrito, pe.nombre, u.enviado_at,
    coalesce(u.enviado_at, i.en_cartera_at)::date
  from public.inmuebles i
  join public.personas pe on pe.id = i.persona_id
  left join lateral (
    select max(r.enviado_at) as enviado_at from public.insights_resumenes r where r.inmueble_id = i.id and r.enviado_at is not null
  ) u on true
  where i.estado = 'en_cartera'
    and not pe.no_contactar
    and public.puede_editar_inmueble(i.id)
    and coalesce(u.enviado_at, i.en_cartera_at)
        <= now() - make_interval(days => coalesce(public.param_int('insights_frecuencia_dias'), 7))
  order by coalesce(u.enviado_at, i.en_cartera_at);
$$;

alter table public.publicaciones enable row level security;
alter table public.insights_resumenes enable row level security;

create policy publicaciones_leer on public.publicaciones for select to authenticated using (public.es_usuario_activo());
create policy publicaciones_editar on public.publicaciones for update to authenticated
  using (public.es_usuario_activo()) with check (public.es_usuario_activo());

create policy insights_leer on public.insights_resumenes for select to authenticated
  using (public.puede_editar_inmueble(inmueble_id));

revoke all on public.publicaciones, public.insights_resumenes from anon, authenticated;
grant select on public.publicaciones, public.insights_resumenes to authenticated;
grant update (url, vistas, interacciones, metricas_at) on public.publicaciones to authenticated;
grant all on public.publicaciones, public.insights_resumenes to service_role;
revoke execute on function public.atribuir_mensaje_entrante(uuid, text) from public, anon, authenticated;
