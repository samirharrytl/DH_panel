-- La bandeja muestra cuántas intenciones (lead_registrado / lead_regreso) tiene cada lead
create or replace view public.v_bandeja with (security_invoker = true) as
select
  l.id,
  l.numero,
  l.tipo,
  l.estado,
  l.canal,
  l.asesor_id,
  a.nombre as asesor_nombre,
  l.persona_id,
  p.nombre,
  p.telefono,
  l.vigente,
  l.created_at,
  l.ultima_interaccion_at,
  pa.accion as proxima_accion,
  pa.fecha as proxima_accion_at,
  (select count(*)::int from public.eventos e
   where e.lead_id = l.id and e.tipo in ('lead_registrado', 'lead_regreso')) as intenciones
from public.leads l
join public.personas p on p.id = l.persona_id
left join public.perfiles a on a.id = l.asesor_id
left join lateral (
  select x.accion, x.fecha from (
    select 'Enviar bienvenida'::text as accion, l.created_at as fecha
    where l.bienvenida_at is null and l.estado = 'nuevo'
    union all
    select 'Enviar refuerzo ' || r.numero, r.fecha::timestamp at time zone 'America/Lima'
    from public.refuerzos r where r.lead_id = l.id and r.estado = 'pendiente'
    union all
    select case when c.tipo = 'visita' then 'Visita' else 'Cita' end, c.inicio
    from public.citas c
    where c.lead_id = l.id and c.estado = 'programada' and c.inicio > now() - interval '12 hours'
    union all
    select 'Enviar novedades', public.novedades_no_responde_desde(l)
    where l.estado = 'no_responde' and l.consentimiento_marketing and not p.no_contactar
    union all
    select l.proxima_accion, l.proxima_accion_at
    where l.proxima_accion_at is not null and l.estado not in ('baja')
  ) x
  where x.fecha is not null
  order by x.fecha
  limit 1
) pa on true;
