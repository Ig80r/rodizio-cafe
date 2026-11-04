BEGIN;

CREATE TABLE IF NOT EXISTS coffee_private.water_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  version integer NOT NULL DEFAULT 0,
  next_order bigint NOT NULL DEFAULT 0
);
INSERT INTO coffee_private.water_state(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS coffee_private.water_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  rounds bigint NOT NULL DEFAULT 0 CHECK(rounds >= 0),
  turn_order bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS coffee_private.water_requests (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  icon text NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
  note text NOT NULL DEFAULT '' CHECK(length(note) <= 200),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS coffee_private.water_history (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  icon text NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE coffee_private.water_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE coffee_private.water_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE coffee_private.water_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE coffee_private.water_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON coffee_private.water_state,coffee_private.water_members,coffee_private.water_requests,coffee_private.water_history FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.coffee_water_read() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'admin',coffee_private.is_admin(),
    'version',(SELECT version FROM coffee_private.water_state WHERE id=true),
    'me',(SELECT jsonb_build_object('id',p.user_id,'name',p.name,'is_member',coalesce(m.active,false))
          FROM coffee_private.profiles p LEFT JOIN coffee_private.water_members m USING(user_id) WHERE p.user_id=auth.uid()),
    'queue',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',CASE WHEN coffee_private.is_admin() THEN m.user_id ELSE NULL END,'name',p.name,'icon',p.icon,'photo',p.photo,'is_me',coalesce(m.user_id=auth.uid(),false),'rounds',m.rounds
    ) ORDER BY m.rounds,m.turn_order,m.user_id)
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
  INSERT INTO coffee_private.water_members(user_id,active,rounds,turn_order)
  VALUES(p_user,p_enabled,current_round,state.next_order+1)
  ON CONFLICT(user_id) DO UPDATE SET active=excluded.active,
    rounds=greatest(coffee_private.water_members.rounds,excluded.rounds),turn_order=excluded.turn_order;
  UPDATE coffee_private.water_state SET version=version+1,next_order=next_order+1 WHERE id=true;
END;
$$;

CREATE OR REPLACE FUNCTION public.coffee_water_submit(p_id uuid,p_quantity integer,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE profile coffee_private.profiles;
BEGIN
  PERFORM 1 FROM auth.users WHERE id=auth.uid() FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entre na sua conta para solicitar cotas de água.'; END IF;
  PERFORM 1 FROM coffee_private.water_members WHERE user_id=auth.uid() AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O administrador precisa incluir você na fila da água.'; END IF;
  SELECT * INTO profile FROM coffee_private.profiles WHERE user_id=auth.uid();
  IF profile.user_id IS NULL THEN RAISE EXCEPTION 'Salve seu nome no perfil antes de enviar.'; END IF;
  IF p_id IS NULL OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 100 OR length(coalesce(p_note,''))>200 THEN RAISE EXCEPTION 'Informe de 1 a 100 garrafões e uma observação de até 200 caracteres.'; END IF;
  IF EXISTS(SELECT 1 FROM coffee_private.water_requests WHERE id=p_id AND user_id=auth.uid() AND quantity=p_quantity AND note=coalesce(p_note,'')) THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM coffee_private.water_history WHERE id=p_id) THEN RAISE EXCEPTION 'Identificador de solicitação indisponível.'; END IF;
  INSERT INTO coffee_private.water_requests(id,user_id,name,icon,quantity,note)
  VALUES(p_id,auth.uid(),profile.name,profile.icon,p_quantity,coalesce(p_note,'')) ON CONFLICT(id) DO NOTHING;
  IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM coffee_private.water_requests WHERE id=p_id AND user_id=auth.uid() AND quantity=p_quantity AND note=coalesce(p_note,'')) THEN
    RAISE EXCEPTION 'Identificador de solicitação indisponível.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION coffee_private.water_record(p_id uuid,p_user uuid,p_quantity integer,p_note text,p_version integer,p_name text DEFAULT NULL,p_icon text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state coffee_private.water_state; profile coffee_private.profiles;
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
  INSERT INTO coffee_private.water_history(id,user_id,name,icon,quantity,note)
  VALUES(p_id,p_user,coalesce(p_name,profile.name),coalesce(p_icon,profile.icon),p_quantity,coalesce(p_note,''));
  UPDATE coffee_private.water_members SET rounds=rounds+p_quantity,turn_order=state.next_order+1 WHERE user_id=p_user;
  UPDATE coffee_private.water_state SET version=version+1,next_order=next_order+1 WHERE id=true;
END;
$$;
REVOKE ALL ON FUNCTION coffee_private.water_record(uuid,uuid,integer,text,integer,text,text) FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.coffee_water_buy(p_id uuid,p_user uuid,p_quantity integer,p_note text,p_version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM coffee_private.require_admin();
  IF EXISTS(SELECT 1 FROM coffee_private.water_requests WHERE id=p_id) THEN RAISE EXCEPTION 'Identificador de compra indisponível.'; END IF;
  PERFORM coffee_private.water_record(p_id,p_user,p_quantity,p_note,p_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.coffee_water_review(p_id uuid,p_approve boolean,p_version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request coffee_private.water_requests;
BEGIN
  PERFORM coffee_private.require_admin();
  PERFORM 1 FROM coffee_private.water_state WHERE id=true FOR UPDATE;
  PERFORM coffee_private.require_admin();
  -- Acquire the buyer's Auth lock before the request lock to allow account deletion.
  SELECT * INTO request FROM coffee_private.water_requests WHERE id=p_id;
  IF request.user_id IS NOT NULL THEN
    PERFORM 1 FROM auth.users WHERE id=request.user_id FOR KEY SHARE;
  END IF;
  SELECT * INTO request FROM coffee_private.water_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF request.status<>'pending' THEN RETURN; END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'Informe a decisão.'; END IF;
  IF p_approve THEN
    PERFORM coffee_private.water_record(p_id,request.user_id,request.quantity,request.note,p_version,request.name,request.icon);
  END IF;
  UPDATE coffee_private.water_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END WHERE id=p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.coffee_water_read() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coffee_water_read() TO anon,authenticated;
REVOKE ALL ON FUNCTION public.coffee_water_member_set(uuid,boolean,integer),public.coffee_water_submit(uuid,integer,text),public.coffee_water_buy(uuid,uuid,integer,text,integer),public.coffee_water_review(uuid,boolean,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coffee_water_member_set(uuid,boolean,integer),public.coffee_water_submit(uuid,integer,text),public.coffee_water_buy(uuid,uuid,integer,text,integer),public.coffee_water_review(uuid,boolean,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
