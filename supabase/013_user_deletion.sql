-- Requer 012. Execute como postgres no SQL Editor do Supabase.
-- Remove a conta real de autenticação; preserva compras, matérias e a estrutura das conversas.
begin;

-- Um comentário removido continua existindo para manter respostas de outras pessoas.
alter table coffee_private.comments alter column user_id drop not null;
do $$
declare v_constraint record;
begin
 for v_constraint in
  select c.conname from pg_constraint c
  where c.conrelid='coffee_private.comments'::regclass and c.confrelid='auth.users'::regclass and c.contype='f'
   and c.conkey=array[(select a.attnum from pg_attribute a where a.attrelid='coffee_private.comments'::regclass and a.attname='user_id')]
 loop
  execute format('alter table coffee_private.comments drop constraint %I',v_constraint.conname);
 end loop;
end $$;
alter table coffee_private.comments add constraint comments_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null;

create or replace function public.coffee_user_delete(p_user uuid,p_confirmation text) returns void
language plpgsql security definer set search_path='' as $$
declare v_slot text;v_state coffee_private.state;
begin
 perform coffee_private.require_admin();
 if p_confirmation is distinct from 'EXCLUIR' then raise exception 'Confirme a exclusão digitando EXCLUIR.';end if;
 if p_user is null then raise exception 'Informe a conta que deseja excluir.';end if;
 if p_user=auth.uid() then raise exception 'Você não pode excluir sua própria conta de administrador.';end if;
 -- Mesma ordem de bloqueios da aprovação de membros: fila antes de perfil.
 select * into v_state from coffee_private.state where id=true for update;
 -- Revalida depois de aguardar o bloqueio: outro admin pode ter removido o solicitante.
 perform coffee_private.require_admin();
 perform 1 from auth.users where id=p_user for update;
 if not found then raise exception 'Conta não encontrada. Atualize a lista.';end if;
 select participant_id into v_slot from coffee_private.profiles where user_id=p_user for update;
 if v_slot is not null then
  update coffee_private.state
  set participants=coalesce((select jsonb_agg(entry.value order by entry.ordinality) from jsonb_array_elements(v_state.participants) with ordinality entry(value,ordinality) where entry.value->>'id' is distinct from v_slot),'[]'::jsonb),
      queue=coalesce((select jsonb_agg(entry.value order by entry.ordinality) from jsonb_array_elements(v_state.queue) with ordinality entry(value,ordinality) where entry.value#>>'{}' is distinct from v_slot),'[]'::jsonb),
      version=v_state.version+1
  where id=true;
 end if;
 -- Solicitações são diferentes do histórico de compras, que permanece intacto.
 delete from coffee_private.requests where user_id=p_user;
 update coffee_private.comments set body='Comentário removido.',deleted_at=coalesce(deleted_at,now()) where user_id=p_user;
 -- Posts.created_by usa ON DELETE SET NULL; perfis, permissões e sessões usam CASCADE.
 delete from auth.users where id=p_user;
 if not found then raise exception 'Conta não encontrada. Atualize a lista.';end if;
end $$;

revoke all on function public.coffee_user_delete(uuid,text) from public,anon,authenticated;
grant execute on function public.coffee_user_delete(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
