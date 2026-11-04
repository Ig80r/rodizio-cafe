BEGIN;

ALTER TABLE coffee_private.state ADD COLUMN IF NOT EXISTS queue_rounds jsonb NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION coffee_private.record_round_purchase(
  p_version integer, p_id uuid, p_quotas integer, p_note text,
  p_name text, p_icon text, p_slot text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_state coffee_private.state;
  buyer_slot text;
  buyer jsonb;
  rounds jsonb;
BEGIN
  SELECT * INTO current_state FROM coffee_private.state WHERE id = true FOR UPDATE;
  PERFORM coffee_private.require_admin();
  IF EXISTS (SELECT 1 FROM coffee_private.history WHERE id = p_id) THEN
    IF p_slot IS NOT NULL THEN RAISE EXCEPTION 'Esta solicitação já tem um registro de compra.'; END IF;
    RETURN;
  END IF;
  IF current_state.version IS NULL OR current_state.version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'A fila mudou. Atualize a página.';
  END IF;
  IF p_quotas IS NULL OR p_quotas NOT BETWEEN 1 AND 100 OR length(coalesce(p_note,'')) > 200 THEN
    RAISE EXCEPTION 'Compra inválida.';
  END IF;

  buyer_slot := coalesce(p_slot, current_state.queue->>0);
  IF buyer_slot IS NULL OR NOT (current_state.queue ? buyer_slot) THEN
    RAISE EXCEPTION 'A compra precisa de um participante ativo na fila.';
  END IF;
  SELECT entry.value INTO buyer
  FROM jsonb_array_elements(current_state.participants) AS entry(value)
  WHERE entry.value->>'id' = buyer_slot;

  rounds := jsonb_set(current_state.queue_rounds, ARRAY[buyer_slot],
    to_jsonb(coalesce((current_state.queue_rounds->>buyer_slot)::bigint,0) + p_quotas));

  INSERT INTO coffee_private.history(id,buyer_name,buyer_icon,quotas,note)
  VALUES (p_id,coalesce(p_name,buyer->>'name'),coalesce(p_icon,buyer->>'icon'),p_quotas,coalesce(p_note,''));

  -- Keep the existing order among peers, placing the buyer after peers on the same round.
  UPDATE coffee_private.state
  SET queue = (SELECT jsonb_agg(slot ORDER BY coalesce((rounds->>slot)::bigint,0), slot = buyer_slot, position)
               FROM jsonb_array_elements_text(current_state.queue) WITH ORDINALITY AS entries(slot,position)),
      queue_rounds = rounds,
      version = current_state.version + 1
  WHERE id = true;
END;
$$;

REVOKE ALL ON FUNCTION coffee_private.record_round_purchase(integer,uuid,integer,text,text,text,text) FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION coffee_private.record_buy(
 p_version integer,p_id uuid,p_quotas integer,p_note text,p_name text default null,p_icon text default null
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM coffee_private.record_round_purchase(p_version,p_id,p_quotas,p_note,p_name,p_icon,NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.coffee_review(p_id uuid, p_approve boolean, p_version integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_state coffee_private.state;
  purchase_request coffee_private.requests;
  requester_slot text;
BEGIN
  PERFORM coffee_private.require_admin();
  -- Lock the queue before the request, matching account deletion's lock order.
  SELECT * INTO current_state FROM coffee_private.state WHERE id = true FOR UPDATE;
  PERFORM coffee_private.require_admin();

  SELECT * INTO purchase_request FROM coffee_private.requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação inexistente.'; END IF;
  IF purchase_request.status <> 'pending' THEN RETURN; END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'Informe a decisão.'; END IF;

  IF p_approve THEN
    IF current_state.version IS NULL OR current_state.version IS DISTINCT FROM p_version THEN
      RAISE EXCEPTION 'A fila mudou. Atualize a página.';
    END IF;

    SELECT participant_id INTO requester_slot
    FROM coffee_private.profiles WHERE user_id = purchase_request.user_id;
    IF requester_slot IS NULL OR NOT (current_state.queue ? requester_slot) THEN
      RAISE EXCEPTION 'Vincule o solicitante a uma vaga ativa na fila antes de confirmar a compra.';
    END IF;

    PERFORM coffee_private.record_round_purchase(
      p_version, p_id, purchase_request.quotas, purchase_request.note,
      purchase_request.name, purchase_request.icon, requester_slot
    );
  END IF;

  UPDATE coffee_private.requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END
  WHERE id = p_id;
END;
$$;

create or replace function public.coffee_manage(p_version integer,p_participants jsonb,p_queue jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s coffee_private.state; v_participant jsonb; current_round bigint; rounds jsonb;
begin
 perform coffee_private.require_admin(); select * into s from coffee_private.state for update;
 if p_version is distinct from s.version then raise exception 'A fila mudou. Atualize antes de salvar.'; end if;
 if p_participants is null or p_queue is null or jsonb_typeof(p_participants)<>'array' or jsonb_typeof(p_queue)<>'array' then raise exception 'Participantes ou fila inválidos.'; end if;
 if jsonb_array_length(p_participants)>30 then raise exception 'Limite de 30 participantes.'; end if;
 for v_participant in select entry.value from jsonb_array_elements(p_participants) as entry(value) loop
  if coalesce(length(trim(v_participant->>'name')),0) not between 1 and 40 or coalesce(length(v_participant->>'icon'),0) not between 1 and 16 or coalesce(length(v_participant->>'id'),0) not between 1 and 80 or jsonb_typeof(v_participant->'active') is distinct from 'boolean' then raise exception 'Participante inválido.'; end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_participants))<>jsonb_array_length(p_participants) then raise exception 'Participantes duplicados.'; end if;
 if (select count(distinct value) from jsonb_array_elements_text(p_queue))<>jsonb_array_length(p_queue) or exists(select 1 from jsonb_array_elements_text(p_queue) q where not exists(select 1 from jsonb_array_elements(p_participants) as entry(value) where entry.value->>'id'=q.value and (entry.value->>'active')::boolean)) or jsonb_array_length(p_queue)<>(select count(*) from jsonb_array_elements(p_participants) as entry(value) where (entry.value->>'active')::boolean) then raise exception 'A fila deve conter cada participante ativo uma vez.'; end if;
 select coalesce(min(coalesce((s.queue_rounds->>slot)::bigint,0)),0) into current_round
 from jsonb_array_elements_text(s.queue) as current_slots(slot);

 -- New or returning participants join the current round and retain future credits.
 select coalesce(jsonb_object_agg(entry.value->>'id',
   greatest(coalesce((s.queue_rounds->>(entry.value->>'id'))::bigint,0),current_round)), '{}')
 into rounds from jsonb_array_elements(p_participants) as entry(value);

 update coffee_private.state
 set participants=p_participants,
     queue=coalesce((select jsonb_agg(slot order by (rounds->>slot)::bigint,position)
                     from jsonb_array_elements_text(p_queue) with ordinality as requested(slot,position)), '[]'),
     queue_rounds=rounds,
     version=version+1
 where id=true;
 update coffee_private.profiles pr set participant_id=null where not exists(select 1 from jsonb_array_elements(p_participants) as entry(value) where entry.value->>'id'=pr.participant_id);
end $$;

create or replace function public.coffee_read() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('admin',coffee_private.is_admin(),'state',
 (select jsonb_build_object('version',s.version,'queue',s.queue,'queue_rounds',s.queue_rounds,'participants',coalesce((
 select jsonb_agg(case when pr.user_id is null then entry.value else entry.value||jsonb_build_object('name',pr.name,'icon',pr.icon,'photo',pr.photo,'is_author',exists(select 1 from coffee_private.authors a where a.user_id=pr.user_id),'is_admin',exists(select 1 from coffee_private.admins adm where adm.user_id=pr.user_id)) end order by entry.ordinality)
 from jsonb_array_elements(s.participants) with ordinality entry(value,ordinality)
 left join coffee_private.profiles pr on pr.participant_id=entry.value->>'id'),'[]'::jsonb)) from coffee_private.state s),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from coffee_private.history h),'[]'::jsonb))
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
