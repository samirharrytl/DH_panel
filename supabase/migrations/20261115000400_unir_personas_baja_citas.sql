-- Unir con una persona en Baja cancela también las citas pendientes y anota el motivo, igual que dar_baja
create or replace function public.unir_personas(p_queda uuid, p_absorbida uuid, p_leads_que_siguen uuid[] default '{}')
returns void
language plpgsql security definer set search_path = public as $$
declare
  q public.personas%rowtype;
  a public.personas%rowtype;
  v_tipo public.tipo_lead;
  v_la public.leads%rowtype;
  v_lb public.leads%rowtype;
  v_cerrar uuid;
  v_sigue uuid;
  v_cerrados jsonb := '[]';
  v_telefonos jsonb;
  v_sugerencias jsonb;
  v_movidos jsonb := '{}';
  v_n int;
  v_lead uuid;
begin
  if p_queda = p_absorbida then
    raise exception 'Elige dos personas distintas';
  end if;
  if not (public.puede_ver_persona(p_queda) and public.puede_ver_persona(p_absorbida)) then
    raise exception 'No tienes acceso a esta persona' using errcode = '42501';
  end if;
  select * into q from public.personas where id = p_queda for update;
  select * into a from public.personas where id = p_absorbida for update;
  if q.id is null or a.id is null then
    raise exception 'La persona no existe';
  end if;

  -- Un lead vigente por tipo: el que no sigue se cierra
  foreach v_tipo in array enum_range(null::public.tipo_lead) loop
    v_la := null;
    v_lb := null;
    select * into v_la from public.leads where persona_id = p_queda and tipo = v_tipo and vigente;
    select * into v_lb from public.leads where persona_id = p_absorbida and tipo = v_tipo and vigente;
    continue when v_la.id is null or v_lb.id is null;
    if v_la.id = any (coalesce(p_leads_que_siguen, '{}')) then
      v_sigue := v_la.id; v_cerrar := v_lb.id;
    elsif v_lb.id = any (coalesce(p_leads_que_siguen, '{}')) then
      v_sigue := v_lb.id; v_cerrar := v_la.id;
    else
      raise exception 'Elige qué lead de % sigue', v_tipo;
    end if;
    if exists (select 1 from public.leads where id = v_cerrar and estado = 'cliente') then
      raise exception 'El lead de % que se cerraría ya es Cliente: elige que siga ese', v_tipo;
    end if;
    if exists (select 1 from public.citas where lead_id = v_cerrar and estado = 'programada') then
      raise exception 'El lead de % que se cerraría tiene una cita o visita pendiente: regístrala, reprográmala o cancélala primero', v_tipo;
    end if;
    if exists (select 1 from public.compraventas where lead_id = v_cerrar and estado = 'en_curso') then
      raise exception 'El lead de % que se cerraría tiene una compraventa en curso: elige que siga ese', v_tipo;
    end if;
    update public.leads set vigente = false where id = v_cerrar;
    update public.refuerzos set estado = 'cancelado' where lead_id = v_cerrar and estado = 'pendiente';
    perform public.registrar_evento('lead_cerrado_por_union', v_cerrar, jsonb_build_object('lead_que_sigue', v_sigue));
    v_cerrados := v_cerrados || jsonb_build_object('tipo', v_tipo, 'cerrado', v_cerrar, 'sigue', v_sigue);
  end loop;

  -- Copia de lo que se absorbe, antes de moverlo
  select coalesce(jsonb_agg(jsonb_build_object('telefono', telefono, 'principal', principal)), '[]') into v_telefonos
  from public.persona_telefonos where persona_id = p_absorbida;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]') into v_sugerencias
  from public.sugerencias_union s where p_absorbida in (s.persona_a, s.persona_b);

  update public.leads set persona_id = p_queda where persona_id = p_absorbida;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('leads', v_n);
  update public.mensajes set persona_id = p_queda where persona_id = p_absorbida;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('mensajes', v_n);
  update public.eventos set persona_id = p_queda where persona_id = p_absorbida;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('eventos', v_n);
  update public.inmuebles set persona_id = p_queda where persona_id = p_absorbida;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('inmuebles', v_n);
  update public.persona_telefonos set persona_id = p_queda, principal = false where persona_id = p_absorbida;

  -- Sugerencias con terceros pasan a p_queda (salvo que ya exista el mismo par); la del par unido se borra
  -- en cascada con la absorbida
  delete from public.sugerencias_union s
  where p_absorbida in (s.persona_a, s.persona_b) and p_queda not in (s.persona_a, s.persona_b)
    and exists (
      select 1 from public.sugerencias_union o
      where p_queda in (o.persona_a, o.persona_b)
        and (case when s.persona_a = p_absorbida then s.persona_b else s.persona_a end) in (o.persona_a, o.persona_b)
    );
  update public.sugerencias_union
  set persona_a = case when persona_a = p_absorbida then p_queda else persona_a end,
      persona_b = case when persona_b = p_absorbida then p_queda else persona_b end
  where p_absorbida in (persona_a, persona_b) and p_queda not in (persona_a, persona_b);

  -- Datos: se conservan los de p_queda y se completan los vacíos; la Baja gana
  update public.personas set
    email = coalesce(q.email, a.email),
    genero = coalesce(q.genero, a.genero),
    horario_preferido = coalesce(q.horario_preferido, a.horario_preferido),
    medio_contacto = coalesce(q.medio_contacto, a.medio_contacto),
    intencion = coalesce(q.intencion, a.intencion),
    ultimo_entrante_at = greatest(q.ultimo_entrante_at, a.ultimo_entrante_at),
    no_contactar = q.no_contactar or a.no_contactar,
    no_contactar_at = coalesce(q.no_contactar_at, a.no_contactar_at)
  where id = p_queda;
  if q.no_contactar or a.no_contactar then
    for v_lead in
      select id from public.leads where persona_id = p_queda and vigente and estado not in ('baja', 'cliente')
    loop
      perform public.fijar_estado(v_lead, 'baja', 'Se unió con un registro que pidió no ser contactado');
      update public.leads set motivo_salida = 'Se unió con un registro en Baja' where id = v_lead;
      update public.refuerzos set estado = 'cancelado' where lead_id = v_lead and estado = 'pendiente';
      update public.citas set estado = 'cancelada', motivo_cancelacion = 'Baja'
      where lead_id = v_lead and estado = 'programada';
    end loop;
  end if;

  perform public.registrar_evento('personas_unidas', null, jsonb_build_object(
    'absorbida', to_jsonb(a), 'telefonos', v_telefonos, 'sugerencias', v_sugerencias,
    'leads_cerrados', v_cerrados, 'movidos', v_movidos
  ), null, p_queda);

  delete from public.personas where id = p_absorbida;
end $$;
