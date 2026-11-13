-- Sitio web (landing en Astro): catálogo público y leads del sitio. Los sirve /api/v1 del panel con la
-- clave de servidor; nadie sin sesión ejecuta estas funciones directamente.

-- Datos que muestra el sitio y que el panel no guardaba
alter table public.inmuebles
  add column destacado boolean not null default false,
  add column rentabilidad_min numeric(5, 2) check (rentabilidad_min >= 0),
  add column rentabilidad_max numeric(5, 2) check (rentabilidad_max >= 0),
  add column anios_recupero numeric(5, 1) check (anios_recupero > 0),
  add constraint inmuebles_rentabilidad_rango check (rentabilidad_max >= rentabilidad_min);

grant update (destacado, rentabilidad_min, rentabilidad_max, anios_recupero) on public.inmuebles to authenticated;

-- v_inmuebles usa i.*: se vuelve a crear para que incluya las columnas nuevas
drop view public.v_inmuebles;
create view public.v_inmuebles with (security_invoker = true) as
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

revoke all on public.v_inmuebles from anon, authenticated;
grant select on public.v_inmuebles to authenticated;

create or replace function public.slug_web(p text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(translate(lower(p), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g'))
$$;

-- Catálogo del sitio: solo inmuebles en cartera con autorización para publicar. Nunca la dirección, los
-- datos de acceso ni el propietario: el sitio muestra la zona (distrito).
create or replace function public.inmuebles_web()
returns table (
  id uuid,
  slug text,
  tipo text,
  distrito text,
  distrito_slug text,
  descripcion text,
  precio numeric,
  destacado boolean,
  rentabilidad_min numeric,
  rentabilidad_max numeric,
  anios_recupero numeric,
  metraje numeric,
  dormitorios int,
  banos int,
  publicado_at timestamptz,
  fotos text[]
)
language sql stable security definer set search_path = public as $$
  select
    i.id,
    public.slug_web(i.tipo || '-en-' || i.distrito || '-' || i.codigo),
    i.tipo,
    i.distrito,
    public.slug_web(i.distrito),
    i.descripcion,
    i.precio,
    i.destacado,
    i.rentabilidad_min,
    i.rentabilidad_max,
    i.anios_recupero,
    i.metraje,
    i.dormitorios,
    i.banos,
    i.en_cartera_at,
    array(select f.ruta from public.inmueble_fotos f where f.inmueble_id = i.id order by f.orden, f.created_at)
  from public.inmuebles i
  where i.estado = 'en_cartera' and i.autoriza_publicar and i.precio is not null
  order by i.destacado desc, i.en_cartera_at desc
$$;

-- Lead que llega por un formulario del sitio. Con teléfono se registra (o se une a su registro) con canal
-- "web"; sin teléfono (clic anónimo en "Mis inmuebles") solo queda el interés por cada inmueble.
-- Devuelve el id del lead, o null si fue anónimo.
create or replace function public.registrar_lead_web(
  p_origen text,
  p_nombre text,
  p_telefono text,
  p_email text,
  p_inmuebles uuid[],
  p_nota text,
  p_consentimiento boolean,
  p_detalle jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inmuebles uuid[];
  v_lead uuid;
  v_id uuid;
begin
  if p_origen not in ('intl-form', 'owner-sell', 'cart', 'contact', 'saved-list') then
    raise exception 'Origen del sitio no válido: %', p_origen;
  end if;

  -- Solo cuentan los inmuebles que el sitio puede mostrar
  select coalesce(array_agg(i.id order by array_position(p_inmuebles, i.id)), '{}') into v_inmuebles
  from public.inmuebles i
  where i.id = any (coalesce(p_inmuebles, '{}')) and i.estado = 'en_cartera' and i.autoriza_publicar;

  if nullif(trim(p_telefono), '') is not null then
    v_lead := (public.registrar_lead_interno(
      p_telefono, p_nombre,
      (case when p_origen = 'owner-sell' then 'propietario' else 'interesado' end)::public.tipo_lead,
      'web', coalesce(p_detalle ->> 'canal_detalle', 'Sitio web'), p_email,
      coalesce(p_consentimiento, false), false, null, p_nota
    ) ->> 'lead_id')::uuid;
    if cardinality(v_inmuebles) > 0 then
      update public.leads set inmueble_interes_id = v_inmuebles[1] where id = v_lead;
    end if;
  end if;

  foreach v_id in array v_inmuebles loop
    perform public.registrar_evento('interes_web', v_lead, coalesce(p_detalle, '{}') || jsonb_build_object('origen', p_origen), v_id);
  end loop;
  return v_lead;
end $$;

revoke all on function public.slug_web(text) from public, anon, authenticated;
revoke all on function public.inmuebles_web() from public, anon, authenticated;
revoke all on function public.registrar_lead_web(text, text, text, text, uuid[], text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.slug_web(text) to service_role;
grant execute on function public.inmuebles_web() to service_role;
grant execute on function public.registrar_lead_web(text, text, text, text, uuid[], text, boolean, jsonb) to service_role;
