-- Fase 7: cierre, postventa y tablero (HU-31 a HU-35)

-- HU-32: testimonio y reseña tras el cierre
create table public.testimonios (
  id uuid primary key default gen_random_uuid(),
  compraventa_id uuid not null references public.compraventas (id),
  lead_id uuid not null references public.leads (id),
  rol text not null check (rol in ('comprador', 'vendedor')),
  programado_para date not null,
  pedido_at timestamptz,
  pedido_por uuid references public.perfiles (id),
  dio_testimonio boolean,
  dio_resena boolean,
  autoriza_redes boolean,
  testimonio text,
  notas text,
  updated_at timestamptz not null default now(),
  unique (compraventa_id, lead_id)
);

create trigger testimonios_updated_at before update on public.testimonios
  for each row execute function public.tocar_updated_at();

-- HU-31: cierre. Sin separación: se pasa directo de compraventa en curso a cerrada.
create or replace function public.cerrar_compraventa(
  p_compraventa_id uuid,
  p_fecha_cierre date,
  p_precio_venta numeric,
  p_comision_pagada numeric,
  p_notas text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  cv public.compraventas%rowtype;
  i public.inmuebles%rowtype;
  v_dias int := coalesce(public.param_int('testimonio_dias'), 7);
begin
  select * into cv from public.compraventas where id = p_compraventa_id for update;
  if not found or not (public.puede_ver_lead(cv.lead_id) or public.puede_editar_inmueble(cv.inmueble_id)) then
    raise exception 'No tienes acceso a esta compraventa' using errcode = '42501';
  end if;
  if cv.estado <> 'en_curso' then
    raise exception 'La compraventa no está en curso';
  end if;
  if p_fecha_cierre is null then
    raise exception 'Indica la fecha de cierre';
  end if;
  if p_comision_pagada is null or p_comision_pagada < 0 then
    raise exception 'Indica la comisión pagada';
  end if;
  select * into i from public.inmuebles where id = cv.inmueble_id for update;

  update public.compraventas
  set estado = 'cerrada', fecha_cierre = p_fecha_cierre, precio_venta = coalesce(p_precio_venta, i.precio),
      comision_pagada = p_comision_pagada, cerrada_por = auth.uid(), notas = coalesce(p_notas, notas)
  where id = p_compraventa_id;

  -- Otras compraventas en curso del mismo inmueble se caen
  update public.compraventas set estado = 'caida', motivo_caida = 'El inmueble se vendió a otro comprador'
  where inmueble_id = cv.inmueble_id and estado = 'en_curso' and id <> p_compraventa_id;

  update public.inmuebles set estado = 'vendido', vendido_at = now(), autoriza_publicar = false where id = i.id;
  update public.contratos set estado = 'terminado' where inmueble_id = i.id and estado = 'vigente';

  perform public.fijar_estado(cv.lead_id, 'cliente', 'Compraventa cerrada (' || i.codigo || ')');
  update public.leads set ultima_interaccion_at = now() where id = cv.lead_id;

  insert into public.testimonios (compraventa_id, lead_id, rol, programado_para)
  values (cv.id, cv.lead_id, 'comprador', p_fecha_cierre + v_dias)
  on conflict do nothing;
  if i.propietario_lead_id is not null then
    insert into public.testimonios (compraventa_id, lead_id, rol, programado_para)
    values (cv.id, i.propietario_lead_id, 'vendedor', p_fecha_cierre + v_dias)
    on conflict do nothing;
  end if;

  perform public.registrar_evento('compraventa_cerrada', cv.lead_id,
    jsonb_build_object('compraventa_id', cv.id, 'fecha', p_fecha_cierre, 'precio_venta', coalesce(p_precio_venta, i.precio),
                       'comision_pagada', p_comision_pagada),
    i.id);
  perform public.registrar_evento('inmueble_vendido', i.propietario_lead_id,
    jsonb_build_object('compraventa_id', cv.id), i.id, i.persona_id);
end $$;

create or replace function public.marcar_compraventa_caida(p_compraventa_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  cv public.compraventas%rowtype;
begin
  select * into cv from public.compraventas where id = p_compraventa_id for update;
  if not found or not public.puede_ver_lead(cv.lead_id) then
    raise exception 'No tienes acceso a esta compraventa' using errcode = '42501';
  end if;
  if cv.estado <> 'en_curso' then
    raise exception 'La compraventa no está en curso';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica el motivo';
  end if;
  update public.compraventas set estado = 'caida', motivo_caida = p_motivo where id = p_compraventa_id;
  if (select estado from public.leads where id = cv.lead_id) = 'compraventa' then
    perform public.fijar_estado(cv.lead_id, 'visita_realizada', 'Compraventa caída: ' || p_motivo);
  end if;
  perform public.registrar_evento('compraventa_caida', cv.lead_id,
    jsonb_build_object('compraventa_id', cv.id, 'motivo', p_motivo), cv.inmueble_id);
end $$;

create or replace function public.registrar_pedido_testimonio(p_testimonio_id uuid, p_mensaje_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.testimonios%rowtype;
begin
  select * into t from public.testimonios where id = p_testimonio_id for update;
  if not found or not public.puede_ver_lead(t.lead_id) then
    raise exception 'No tienes acceso a este testimonio' using errcode = '42501';
  end if;
  update public.testimonios set pedido_at = now(), pedido_por = auth.uid() where id = p_testimonio_id;
  perform public.registrar_evento('testimonio_pedido', t.lead_id,
    jsonb_build_object('testimonio_id', t.id, 'mensaje_id', p_mensaje_id));
end $$;

-- HU-33: clientes en la lista de marketing según su intención (respeta bajas y consentimiento)
create or replace view public.v_clientes_marketing with (security_invoker = true) as
select distinct on (p.id)
  p.id as persona_id,
  p.nombre,
  p.telefono,
  p.intencion,
  p.no_contactar,
  l.id as lead_id,
  l.tipo,
  l.consentimiento_marketing,
  l.asesor_id,
  a.nombre as asesor_nombre,
  l.ultimas_novedades_at,
  coalesce(cv.fecha_cierre, k.fecha_firma) as cliente_desde
from public.leads l
join public.personas p on p.id = l.persona_id
left join public.perfiles a on a.id = l.asesor_id
left join public.compraventas cv on cv.lead_id = l.id and cv.estado = 'cerrada'
left join public.inmuebles i on i.propietario_lead_id = l.id
left join public.contratos k on k.inmueble_id = i.id and k.contrato_anterior_id is null
where l.estado = 'cliente'
order by p.id, l.updated_at desc;

-- HU-34: tablero del administrador
create or replace function public.tablero(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_desde timestamptz := p_desde::timestamp at time zone 'America/Lima';
  v_hasta timestamptz := (p_hasta + 1)::timestamp at time zone 'America/Lima';
  v_resultado jsonb;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador ve el tablero' using errcode = '42501';
  end if;

  with leads_periodo as (
    select l.id, l.tipo,
      coalesce((select max(public.orden_estado(h.estado_nuevo)) from public.lead_historial h where h.lead_id = l.id), 1) as max_orden
    from public.leads l
    where l.created_at >= v_desde and l.created_at < v_hasta
  ), etapas as (
    select * from (values
      ('propietario', 'nuevo', 1), ('propietario', 'contactado', 2), ('propietario', 'en_conversacion', 3),
      ('propietario', 'cita_agendada', 4), ('propietario', 'cita_realizada', 5), ('propietario', 'cliente', 9),
      ('interesado', 'nuevo', 1), ('interesado', 'contactado', 2), ('interesado', 'en_conversacion', 3),
      ('interesado', 'calificado', 4), ('interesado', 'match_enviado', 5), ('interesado', 'visita_agendada', 6),
      ('interesado', 'visita_realizada', 7), ('interesado', 'compraventa', 8), ('interesado', 'cliente', 9)
    ) as e(tipo, estado, orden)
  ), envios as (
    select e.id, e.lead_id, e.enviado_at from public.match_envios e
    where e.enviado_at >= v_desde and e.enviado_at < v_hasta
  ), opciones as (
    select mo.* from public.match_opciones mo join envios e on e.id = mo.envio_id
  )
  select jsonb_build_object(
    'leads_por_etapa', (
      select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'estado', estado, 'total', total) order by tipo, total desc), '[]')
      from (select tipo, estado, count(*) as total from public.leads where vigente group by tipo, estado) x
    ),
    'sin_respuesta', jsonb_build_object(
      'esperando_respuesta', (select count(*) from public.leads where vigente and estado = 'contactado'),
      'refuerzos_vencidos', (
        select count(*) from public.refuerzos r join public.leads l on l.id = r.lead_id
        where r.estado = 'pendiente' and r.fecha < public.hoy_lima() and l.vigente
      ),
      'sin_bienvenida', (select count(*) from public.leads where vigente and estado = 'nuevo' and bienvenida_at is null),
      'no_responde', (select count(*) from public.leads where vigente and estado = 'no_responde')
    ),
    'conversiones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', e.tipo, 'estado', e.estado, 'orden', e.orden,
        'alcanzaron', (select count(*) from leads_periodo lp where lp.tipo::text = e.tipo and lp.max_orden >= e.orden),
        'total', (select count(*) from leads_periodo lp where lp.tipo::text = e.tipo)
      ) order by e.tipo, e.orden), '[]')
      from etapas e
    ),
    'piloto_match', jsonb_build_object(
      'envios', (select count(*) from envios),
      'opciones', (select count(*) from opciones),
      'respondidas', (select count(*) from opciones where respuesta is not null),
      'me_interesa', (select count(*) from opciones where respuesta = 'me_interesa'),
      'pct_me_interesa', (
        select case when count(*) > 0 then round(100.0 * count(*) filter (where respuesta = 'me_interesa') / count(*), 1) end
        from opciones
      ),
      'visitas_de_match', (
        select count(*) from public.citas c
        where c.tipo = 'visita' and c.created_at >= v_desde and c.created_at < v_hasta
          and exists (select 1 from opciones o where o.lead_id = c.lead_id and o.inmueble_id = c.inmueble_id)
      ),
      'visitas_por_envio', (
        select case when (select count(*) from envios) > 0 then round(count(*)::numeric / (select count(*) from envios), 2) end
        from public.citas c
        where c.tipo = 'visita' and c.created_at >= v_desde and c.created_at < v_hasta
          and exists (select 1 from opciones o where o.lead_id = c.lead_id and o.inmueble_id = c.inmueble_id)
      ),
      'cierres', (
        select count(*) from public.compraventas cv
        where cv.estado = 'cerrada' and cv.fecha_cierre between p_desde and p_hasta
          and exists (select 1 from public.match_opciones o where o.lead_id = cv.lead_id and o.inmueble_id = cv.inmueble_id)
      ),
      'acierto_prediccion', null
    ),
    'negocio', jsonb_build_object(
      'leads_nuevos', (select count(*) from leads_periodo),
      'contratos_firmados', (select count(*) from public.contratos where contrato_anterior_id is null and fecha_firma between p_desde and p_hasta),
      'inmuebles_en_cartera', (select count(*) from public.inmuebles where estado = 'en_cartera'),
      'compraventas_cerradas', (select count(*) from public.compraventas where estado = 'cerrada' and fecha_cierre between p_desde and p_hasta),
      'comisiones', (select coalesce(sum(comision_pagada), 0) from public.compraventas where estado = 'cerrada' and fecha_cierre between p_desde and p_hasta),
      'visitas_realizadas', (select count(*) from public.citas where tipo = 'visita' and estado = 'realizada' and realizada_at >= v_desde and realizada_at < v_hasta)
    )
  ) into v_resultado;
  return v_resultado;
end $$;

-- HU-35: datos para el modelo de probabilidad de firma (uno por lead propietario)
create or replace view public.v_dataset_propietarios with (security_invoker = true) as
select
  l.id as lead_id,
  l.created_at,
  l.canal,
  l.estado,
  q.rol_contacto,
  q.tiene_poder,
  q.hipoteca,
  q.hipoteca_saldo,
  q.tipo_inmueble,
  q.distrito,
  q.metraje,
  q.dormitorios,
  q.precio_esperado,
  q.urgencia,
  q.inscrito_sunarp,
  q.copropietarios,
  (
    select round(avg(o.precio / nullif(o.metraje, 0)))
    from public.inmuebles o
    where lower(o.distrito) = lower(q.distrito) and o.tipo = q.tipo_inmueble and o.estado in ('en_cartera', 'vendido')
  ) as precio_m2_zona,
  case when q.metraje > 0 then round(q.precio_esperado / q.metraje) end as precio_m2_esperado,
  l.respondio_at is not null as respondio,
  case when l.respondio_at is not null and l.bienvenida_at is not null and l.respondio_at >= l.bienvenida_at
    then round(extract(epoch from (l.respondio_at - l.bienvenida_at)) / 3600, 1) end as horas_hasta_respuesta,
  (select count(*) from public.mensajes m where m.lead_id = l.id and m.direccion = 'entrante') as mensajes_entrantes,
  (select count(*) from public.refuerzos r where r.lead_id = l.id and r.estado = 'enviado') as refuerzos_enviados,
  (select count(*) from public.citas c where c.lead_id = l.id and c.estado = 'realizada') as citas_realizadas,
  exists (select 1 from public.eventos e where e.lead_id = l.id and e.tipo = 'contrato_firmado') as firmo,
  (select min(e.created_at) from public.eventos e where e.lead_id = l.id and e.tipo = 'contrato_firmado') as firmo_at
from public.leads l
left join public.calificacion_propietario q on q.lead_id = l.id
where l.tipo = 'propietario';

-- Base de propiedades con interés acumulado
create or replace view public.v_inmuebles with (security_invoker = true) as
select
  i.*,
  pe.nombre as propietario_nombre,
  a.nombre as asesor_nombre,
  (select f.ruta from public.inmueble_fotos f where f.inmueble_id = i.id order by f.orden, f.created_at limit 1) as foto_portada,
  k.vence_el as contrato_vence_el,
  k.id as contrato_id,
  (select count(*)::int from public.leads l where l.inmueble_interes_id = i.id) as leads_interesados,
  (select count(*)::int from public.match_opciones mo where mo.inmueble_id = i.id) as veces_match,
  (select count(*)::int from public.match_opciones mo where mo.inmueble_id = i.id and mo.respuesta = 'me_interesa') as me_interesa,
  (select count(*)::int from public.citas c where c.inmueble_id = i.id and c.tipo = 'visita' and c.estado = 'realizada') as visitas_realizadas
from public.inmuebles i
left join public.personas pe on pe.id = i.persona_id
left join public.perfiles a on a.id = i.asesor_id
left join public.contratos k on k.inmueble_id = i.id and k.estado = 'vigente';

alter table public.testimonios enable row level security;

create policy testimonios_leer on public.testimonios for select to authenticated using (public.puede_ver_lead(lead_id));
create policy testimonios_editar on public.testimonios for update to authenticated
  using (public.puede_ver_lead(lead_id)) with check (public.puede_ver_lead(lead_id));

revoke all on public.testimonios, public.v_clientes_marketing, public.v_dataset_propietarios from anon, authenticated;
grant select on public.testimonios, public.v_clientes_marketing, public.v_dataset_propietarios to authenticated;
grant update (dio_testimonio, dio_resena, autoriza_redes, testimonio, notas) on public.testimonios to authenticated;
grant all on public.testimonios, public.v_clientes_marketing, public.v_dataset_propietarios to service_role;
