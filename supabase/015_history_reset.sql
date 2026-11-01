-- Requer as atualizações anteriores. Cria o comando; não apaga dados ao aplicar a migração.
begin;
create or replace function public.coffee_history_reset(p_version integer,p_confirmation text) returns void
language plpgsql security definer set search_path='' as $$
declare v_version integer;
begin
 perform coffee_private.require_admin();
 if p_confirmation is distinct from 'RESETAR' then raise exception 'Confirme o reset digitando RESETAR.';end if;
 -- Usa o mesmo bloqueio dos abastecimentos para não apagar uma compra concorrente.
 select version into v_version from coffee_private.state where id=true for update;
 perform coffee_private.require_admin();
 if v_version is null then raise exception 'A fila não está disponível.';end if;
 if p_version is distinct from v_version then raise exception 'Os dados mudaram. Atualize e confira o histórico antes de confirmar o reset novamente.';end if;
 delete from coffee_private.history where true;
 -- Invalida tentativas antigas, mantendo os participantes e a ordem da fila.
 update coffee_private.state set version=version+1 where id=true;
end $$;
revoke all on function public.coffee_history_reset(integer,text) from public,anon,authenticated;
grant execute on function public.coffee_history_reset(integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;
