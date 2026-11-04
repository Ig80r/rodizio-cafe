BEGIN;
-- Requer 020. Ajustes manuais preservam as cotas e o histórico de entregas.
ALTER TABLE coffee_private.water_state ADD COLUMN IF NOT EXISTS manual_order jsonb
  CHECK(manual_order IS NULL OR jsonb_typeof(manual_order)='array');

CREATE OR REPLACE FUNCTION coffee_private.water_order() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT ARRAY(
    SELECT member.user_id
    FROM coffee_private.water_members member CROSS JOIN coffee_private.water_state state
    WHERE member.active AND state.id=true
    ORDER BY array_position(ARRAY(SELECT jsonb_array_elements_text(coalesce(state.manual_order,'[]'::jsonb))),member.user_id::text) NULLS LAST,
      member.rounds,member.turn_order,member.user_id
  );
$$;

-- Reposition only the buyer after everyone with the same or fewer covered rounds.
CREATE OR REPLACE FUNCTION coffee_private.water_place(p_order uuid[],p_user uuid,p_round bigint) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH others AS (
    SELECT entry.user_id,entry.position,member.rounds
    FROM unnest(array_remove(p_order,p_user)) WITH ORDINALITY entry(user_id,position)
    JOIN coffee_private.water_members member ON member.user_id=entry.user_id AND member.active
  ), cutoff AS (
    SELECT coalesce(max(position) FILTER(WHERE rounds<=p_round),0) AS position FROM others
  ), positions AS (
    SELECT user_id,position::numeric FROM others
    UNION ALL SELECT p_user,position+0.5 FROM cutoff
  )
  SELECT array_agg(user_id ORDER BY position) FROM positions;
$$;
REVOKE ALL ON FUNCTION coffee_private.water_order(),coffee_private.water_place(uuid[],uuid,bigint) FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.coffee_water_queue_set(p_order uuid[],p_version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_version integer;
BEGIN
  PERFORM coffee_private.require_admin();
  SELECT version INTO current_version FROM coffee_private.water_state WHERE id=true FOR UPDATE;
  PERFORM coffee_private.require_admin();
  IF current_version IS NULL OR current_version IS DISTINCT FROM p_version THEN
    IF p_order IS NOT NULL AND p_order=coffee_private.water_order() THEN RETURN; END IF;
    RAISE EXCEPTION 'A fila da água mudou. Atualize e confira a ordem antes de salvar.';
  END IF;
  IF p_order IS NULL OR coalesce(array_ndims(p_order),1)<>1
    OR cardinality(p_order)<>(SELECT count(DISTINCT user_id) FROM unnest(p_order) entry(user_id)) THEN
    RAISE EXCEPTION 'A ordem deve conter cada participante ativo uma única vez.';
  END IF;
  PERFORM 1 FROM auth.users WHERE id=ANY(p_order) FOR KEY SHARE;
  IF cardinality(p_order)<>(SELECT count(*) FROM coffee_private.water_members WHERE active)
    OR EXISTS(SELECT 1 FROM unnest(p_order) entry(user_id)
      WHERE NOT EXISTS(SELECT 1 FROM coffee_private.water_members member WHERE member.user_id=entry.user_id AND member.active)) THEN
    RAISE EXCEPTION 'A ordem deve conter todos os participantes ativos da água.';
  END IF;
  UPDATE coffee_private.water_state SET manual_order=to_jsonb(p_order),version=version+1 WHERE id=true;
END;
$$;
REVOKE ALL ON FUNCTION public.coffee_water_queue_set(uuid[],integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coffee_water_queue_set(uuid[],integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.coffee_water_read() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'admin',coffee_private.is_admin(),
    'version',(SELECT version FROM coffee_private.water_state WHERE id=true),
    'me',(SELECT jsonb_build_object('id',p.user_id,'name',p.name,'is_member',coalesce(m.active,false))
          FROM coffee_private.profiles p LEFT JOIN coffee_private.water_members m USING(user_id) WHERE p.user_id=auth.uid()),
    'queue',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',CASE WHEN coffee_private.is_admin() THEN m.user_id ELSE NULL END,'name',p.name,'icon',p.icon,'photo',p.photo,'is_me',coalesce(m.user_id=auth.uid(),false),'rounds',m.rounds
    ) ORDER BY array_position(coffee_private.water_order(),m.user_id))
      FROM coffee_private.water_members m JOIN coffee_private.profiles p USING(user_id) WHERE m.active),'[]'::jsonb),
    'bottles',coalesce((SELECT sum(quantity) FROM coffee_private.water_history),0),
    'liters',coalesce((SELECT sum(quantity)*20 FROM coffee_private.water_history),0),
    'history',coalesce((SELECT jsonb_agg(to_jsonb(h)-'user_id' ORDER BY h.created_at DESC,h.id) FROM coffee_private.water_history h),'[]'::jsonb),
    'profiles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.name,'icon',p.icon,'photo',p.photo,'active',coalesce(m.active,false)) ORDER BY lower(p.name),p.user_id)
      FROM coffee_private.profiles p LEFT JOIN coffee_private.water_members m USING(user_id) WHERE coffee_private.is_admin()),'[]'::jsonb),
    'requests',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id) FROM coffee_private.water_requests r
      WHERE r.user_id=auth.uid() OR coffee_private.is_admin()),'[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.coffee_water_member_set(p_user uuid,p_enabled boolean,p_version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  state coffee_private.water_state;
  current_round bigint;
  current_order uuid[];
BEGIN
  PERFORM coffee_private.require_admin();
  SELECT * INTO state FROM coffee_private.water_state WHERE id=true FOR UPDATE;
  PERFORM coffee_private.require_admin();
  IF state.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'A fila da água mudou. Atualize antes de continuar.'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'Informe se o perfil participará da água.'; END IF;
  -- Lock Auth before membership, matching account deletion and delivery registration.
  PERFORM 1 FROM auth.users WHERE id=p_user FOR KEY SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM coffee_private.profiles WHERE user_id=p_user) THEN RAISE EXCEPTION 'Perfil não encontrado.'; END IF;
  IF EXISTS(SELECT 1 FROM coffee_private.water_members WHERE user_id=p_user AND active=p_enabled) THEN RETURN; END IF;
  SELECT coalesce(min(rounds) FILTER(WHERE active),min(rounds),0) INTO current_round FROM coffee_private.water_members;
  current_order := coffee_private.water_order();
  INSERT INTO coffee_private.water_members(user_id,active,rounds,turn_order)
  VALUES(p_user,p_enabled,current_round,state.next_order+1)
  ON CONFLICT(user_id) DO UPDATE SET active=excluded.active,
    rounds=greatest(coffee_private.water_members.rounds,excluded.rounds),turn_order=excluded.turn_order;
  IF p_enabled THEN
    current_order := coffee_private.water_place(current_order,p_user,
      (SELECT rounds FROM coffee_private.water_members WHERE user_id=p_user));
  ELSE
    current_order := array_remove(current_order,p_user);
  END IF;
  UPDATE coffee_private.water_state
  SET version=version+1,next_order=next_order+1,manual_order=to_jsonb(current_order) WHERE id=true;
END;
$$;

CREATE OR REPLACE FUNCTION coffee_private.water_record(p_id uuid,p_user uuid,p_quantity integer,p_note text,p_version integer,p_name text DEFAULT NULL,p_icon text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state coffee_private.water_state; profile coffee_private.profiles; current_order uuid[];
BEGIN
  PERFORM coffee_private.require_admin();
  SELECT * INTO state FROM coffee_private.water_state WHERE id=true FOR UPDATE;
  PERFORM coffee_private.require_admin();
  IF EXISTS(SELECT 1 FROM coffee_private.water_history WHERE id=p_id AND user_id=p_user AND quantity=p_quantity AND note=coalesce(p_note,'')) THEN RETURN; END IF;
  IF state.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'A fila da água mudou. Atualize antes de continuar.'; END IF;
  IF p_id IS NULL OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 100 OR length(coalesce(p_note,''))>200 THEN RAISE EXCEPTION 'Compra de água inválida.'; END IF;
  PERFORM 1 FROM auth.users WHERE id=p_user FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  PERFORM 1 FROM coffee_private.water_members WHERE user_id=p_user AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inclua o comprador na fila da água antes de confirmar.'; END IF;
  SELECT * INTO profile FROM coffee_private.profiles WHERE user_id=p_user;
  IF profile.user_id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado.'; END IF;
  current_order := coffee_private.water_order();
  INSERT INTO coffee_private.water_history(id,user_id,name,icon,quantity,note)
  VALUES(p_id,p_user,coalesce(p_name,profile.name),coalesce(p_icon,profile.icon),p_quantity,coalesce(p_note,''));
  UPDATE coffee_private.water_members SET rounds=rounds+p_quantity,turn_order=state.next_order+1 WHERE user_id=p_user;
  current_order := coffee_private.water_place(current_order,p_user,
    (SELECT rounds FROM coffee_private.water_members WHERE user_id=p_user));
  UPDATE coffee_private.water_state
  SET version=version+1,next_order=next_order+1,manual_order=to_jsonb(current_order) WHERE id=true;
END;
$$;
REVOKE ALL ON FUNCTION coffee_private.water_record(uuid,uuid,integer,text,integer,text,text) FROM public,anon,authenticated;


NOTIFY pgrst,'reload schema';
COMMIT;
