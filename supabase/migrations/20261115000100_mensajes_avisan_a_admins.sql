-- Todo mensaje entrante avisa también a los administradores, aunque el lead sea de otro asesor.
-- El asesor del lead recibe su aviso con enlace a la ficha; los administradores que no son ese asesor,
-- uno con enlace al chat de la persona.
create or replace function public.mensajes_despues_de_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lead record;
  v_nombre text;
begin
  if new.direccion <> 'entrante' then
    return null;
  end if;
  if new.origen in ('whatsapp', 'simulado', 'importado') then
    update public.personas
    set ultimo_entrante_at = greatest(coalesce(ultimo_entrante_at, new.created_at), new.created_at)
    where id = new.persona_id;
  end if;
  if new.origen = 'importado' then
    return null;
  end if;
  select nombre into v_nombre from public.personas where id = new.persona_id;
  for v_lead in
    select id, asesor_id from public.leads where persona_id = new.persona_id and vigente
  loop
    perform public.marcar_respuesta_lead(v_lead.id);
    if new.origen <> 'manual' then
      perform public.notificar(v_lead.asesor_id, 'mensaje', 'Mensaje de ' || v_nombre,
        left(new.cuerpo, 140), '/leads/' || v_lead.id || '?tab=chat');
    end if;
  end loop;
  if new.origen <> 'manual' then
    perform public.notificar(p.id, 'mensaje', 'Mensaje de ' || v_nombre,
      left(new.cuerpo, 140), '/chats?persona=' || new.persona_id)
    from public.perfiles p
    where p.rol = 'administrador' and p.activo
      and not exists (
        select 1 from public.leads l
        where l.persona_id = new.persona_id and l.vigente and l.asesor_id = p.id
      );
  end if;
  return null;
end $$;
