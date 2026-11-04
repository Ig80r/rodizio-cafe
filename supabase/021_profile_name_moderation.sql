BEGIN;

-- O nome do perfil é a fonte usada nas filas. O administrador pode moderá-lo.
CREATE OR REPLACE FUNCTION public.coffee_profile_name_set(
  p_user uuid,
  p_name text,
  p_expected_name text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  updated_name text := trim(coalesce(p_name, ''));
BEGIN
  PERFORM coffee_private.require_admin();
  IF length(updated_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'O nome precisa ter de 1 a 40 caracteres.';
  END IF;

  UPDATE coffee_private.profiles
  SET name = updated_name
  WHERE user_id = p_user AND name IS NOT DISTINCT FROM p_expected_name;

  IF NOT FOUND THEN
    IF NOT EXISTS(SELECT 1 FROM coffee_private.profiles WHERE user_id = p_user) THEN
      RAISE EXCEPTION 'Perfil não encontrado.';
    END IF;
    RAISE EXCEPTION 'O nome deste perfil mudou. Atualize a página antes de corrigir novamente.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.coffee_profile_name_set(uuid,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coffee_profile_name_set(uuid,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
