begin;
-- Requer 011. Comentários antigos continuam como conversas principais.
alter table coffee_private.comments add column if not exists parent_id uuid references coffee_private.comments(id);
alter table coffee_private.comments add column if not exists deleted_at timestamptz;
create index if not exists coffee_comments_parent on coffee_private.comments(parent_id);
create or replace function coffee_private.comment_record(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'parent_id',c.parent_id,'body',case when c.deleted_at is null then c.body else 'Comentário removido.' end,'deleted',c.deleted_at is not null,'created_at',c.created_at,
 'name',coalesce(p.name,'Cafeteiro'),'icon',coalesce(p.icon,'🦊'),'photo',p.photo,
 'is_admin',exists(select 1 from coffee_private.admins a where a.user_id=c.user_id),
 'is_author',exists(select 1 from coffee_private.authors a where a.user_id=c.user_id),
 'can_delete',c.deleted_at is null and (c.user_id=auth.uid() or coffee_private.is_admin()))
 from coffee_private.comments c left join coffee_private.profiles p on p.user_id=c.user_id where c.id=p_id
$$;
create or replace function public.coffee_comments_read(p_page text) returns jsonb language sql stable security definer set search_path='' as $$
 with recursive roots as (
 select c.id from coffee_private.comments c where c.page_id=p_page and c.parent_id is null
 and exists(select 1 from coffee_private.posts p where p.id=p_page and p.published)
 order by c.created_at desc,c.id desc limit 100
 ), thread as (
 select c.id,c.created_at from coffee_private.comments c join roots r on r.id=c.id
 union all
 select child.id,child.created_at from coffee_private.comments child join thread parent on child.parent_id=parent.id where child.page_id=p_page
 )
 select coalesce(jsonb_agg(coffee_private.comment_record(t.id) order by t.created_at,t.id),'[]'::jsonb) from thread t
$$;
create or replace function public.coffee_comment_publish(p_id uuid,p_page text,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.coffee_comment_add(p_id,p_page,p_body);
 if not exists(select 1 from coffee_private.comments where id=p_id and user_id=auth.uid() and page_id=p_page and parent_id is null) then raise exception 'O comentário não foi confirmado.';end if;
 return coffee_private.comment_record(p_id);
end $$;
create or replace function public.coffee_comment_reply(p_id uuid,p_page text,p_body text,p_parent uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not coffee_private.can_comment() then raise exception 'Aguarde autorização do administrador para responder.';end if;
 if p_parent is null or p_parent=p_id or not exists(select 1 from coffee_private.comments where id=p_parent and page_id=p_page and deleted_at is null) then raise exception 'O comentário original não está disponível nesta matéria.';end if;
 if exists(select 1 from coffee_private.comments where id=p_id) then
  if exists(select 1 from coffee_private.comments where id=p_id and user_id=auth.uid() and page_id=p_page and parent_id=p_parent and body=trim(p_body) and deleted_at is null) then return coffee_private.comment_record(p_id);end if;
  raise exception 'Identificador de resposta indisponível.';
 end if;
 perform public.coffee_comment_add(p_id,p_page,p_body);
 update coffee_private.comments set parent_id=p_parent where id=p_id and user_id=auth.uid() and page_id=p_page;
 return coffee_private.comment_record(p_id);
end $$;
-- Remove somente o texto escolhido. As respostas das outras pessoas são preservadas.
create or replace function public.coffee_comment_delete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.';end if;
 update coffee_private.comments set body='Comentário removido.',deleted_at=now() where id=p_id and deleted_at is null and (user_id=auth.uid() or coffee_private.is_admin());
 if not found then raise exception 'Comentário indisponível ou sem permissão.';end if;
end $$;
revoke all on function coffee_private.comment_record(uuid) from public,anon,authenticated;
revoke all on function public.coffee_comment_reply(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.coffee_comment_reply(uuid,text,text,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
