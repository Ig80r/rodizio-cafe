begin;
-- Requer sincronização 007 (ou atualizações 002 a 006).
create table if not exists coffee_private.authors (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_by uuid references auth.users(id) on delete set null,
 granted_at timestamptz not null default now()
);
alter table coffee_private.authors enable row level security;
revoke all on coffee_private.authors from public,anon,authenticated;
alter table coffee_private.posts add column if not exists created_by uuid references auth.users(id) on delete set null;
create or replace function coffee_private.can_publish() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (coffee_private.is_admin() or exists(select 1 from coffee_private.authors a where a.user_id=auth.uid()))
$$;
create or replace function public.coffee_author_set(p_user uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform coffee_private.require_admin();
 if p_enabled is null then raise exception 'Informe se a insígnia será concedida ou retirada.';end if;
 if not exists(select 1 from coffee_private.profiles where user_id=p_user) then raise exception 'Perfil não encontrado.';end if;
 if p_enabled then
  insert into coffee_private.authors(user_id,granted_by) values(p_user,auth.uid()) on conflict do nothing;
 else delete from coffee_private.authors where user_id=p_user;
 end if;
end $$;
create or replace function public.coffee_account() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.';end if;
 return jsonb_build_object(
 'can_publish',coffee_private.can_publish(),
 'profile',(select to_jsonb(p)||jsonb_build_object('is_author',exists(select 1 from coffee_private.authors a where a.user_id=p.user_id)) from coffee_private.profiles p where p.user_id=auth.uid()),
 'profiles',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('is_author',exists(select 1 from coffee_private.authors a where a.user_id=p.user_id))) from coffee_private.profiles p where coffee_private.is_admin()),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from coffee_private.requests r where r.user_id=auth.uid() or coffee_private.is_admin()),'[]'::jsonb));
end $$;
create or replace function public.coffee_post_publish(p_id text,p_title text,p_quote text,p_author text,p_date date,p_body text,p_image text,p_caption text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coffee_private.can_publish() then raise exception 'Você precisa da insígnia de autor para publicar.';end if;
 if p_image is not null and (length(p_image)>1200000 or p_image !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$') then raise exception 'Imagem inválida ou muito grande.';end if;
 if exists(select 1 from coffee_private.posts where id=p_id) then
  if exists(select 1 from coffee_private.posts where id=p_id and created_by=auth.uid() and published) then return;end if;
  raise exception 'Identificador de publicação indisponível.';
 end if;
 insert into coffee_private.posts(id,title,quote,author,published_on,body,image,caption,created_by)
 values(p_id,trim(p_title),trim(p_quote),trim(p_author),p_date,coalesce(p_body,''),p_image,coalesce(p_caption,''),auth.uid());
end $$;
-- Soft deletion removes a page from public reading and preserves its comment history.
create or replace function public.coffee_post_delete(p_id text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coffee_private.can_publish() then raise exception 'Sem permissão para excluir matérias.';end if;
 update coffee_private.posts set published=false where id=p_id and published and (created_by=auth.uid() or coffee_private.is_admin());
 if not found then raise exception 'Matéria não encontrada ou pertence a outro autor.';end if;
end $$;
create or replace function public.coffee_posts_read() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item.record order by item.published_on desc,item.created_at desc,item.id),'[]'::jsonb) from (
 select p.id,p.published_on,p.created_at,(to_jsonb(p)-'created_by')||jsonb_build_object(
 'publisher_name',pr.name,
 'publisher_is_author',exists(select 1 from coffee_private.authors a where a.user_id=p.created_by),
 'is_mine',coalesce(p.created_by=auth.uid(),false),
 'can_delete',coffee_private.can_publish() and (coffee_private.is_admin() or coalesce(p.created_by=auth.uid(),false))) as record
 from coffee_private.posts p left join coffee_private.profiles pr on pr.user_id=p.created_by where p.published
 ) item
$$;
-- Approved profile badges in the public queue; no account ID or e-mail is exposed.
create or replace function public.coffee_read() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('admin',coffee_private.is_admin(),'state',
 (select jsonb_build_object('version',s.version,'queue',s.queue,'participants',coalesce((
 select jsonb_agg(case when pr.user_id is null then entry.value else entry.value||jsonb_build_object('name',pr.name,'icon',pr.icon,'photo',pr.photo,'is_author',exists(select 1 from coffee_private.authors a where a.user_id=pr.user_id)) end order by entry.ordinality)
 from jsonb_array_elements(s.participants) with ordinality entry(value,ordinality)
 left join coffee_private.profiles pr on pr.participant_id=entry.value->>'id'),'[]'::jsonb)) from coffee_private.state s),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from coffee_private.history h),'[]'::jsonb))
$$;
revoke all on function coffee_private.can_publish() from public,anon,authenticated;
revoke all on function public.coffee_author_set(uuid,boolean),public.coffee_post_delete(text) from public,anon,authenticated;
grant execute on function public.coffee_author_set(uuid,boolean),public.coffee_post_delete(text) to authenticated;
notify pgrst, 'reload schema';
commit;
