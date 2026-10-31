begin;
-- Atualização incremental: execute depois de schema.sql. Preserva contas e compras.
alter table coffee_private.profiles add column if not exists photo text;
create table if not exists coffee_private.comments(
 id uuid primary key, page_id text not null check(page_id in ('gazeta-001','gazeta-002')),
 user_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(length(trim(body)) between 1 and 500),
 created_at timestamptz not null default now()
);
create index if not exists coffee_comments_page on coffee_private.comments(page_id,created_at);
alter table coffee_private.comments enable row level security;
revoke all on coffee_private.comments from public,anon,authenticated;

create or replace function coffee_private.signup_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if length(trim(coalesce(new.raw_user_meta_data->>'name',''))) between 1 and 40 then
  insert into coffee_private.profiles(user_id,name,icon) values(new.id,trim(new.raw_user_meta_data->>'name'),'🦊') on conflict do nothing;
 end if;
 return new;
end $$;
drop trigger if exists coffee_signup_profile on auth.users;
create trigger coffee_signup_profile after insert on auth.users for each row execute function coffee_private.signup_profile();
insert into coffee_private.profiles(user_id,name,icon)
select id,trim(raw_user_meta_data->>'name'),'🦊' from auth.users
where length(trim(coalesce(raw_user_meta_data->>'name',''))) between 1 and 40 on conflict do nothing;

-- New RPC avoids changing the signature/defaults of an existing profile function.
create or replace function public.coffee_profile_update(p_name text,p_icon text,p_photo text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
 if p_photo is not null and (length(p_photo)>150000 or p_photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$') then raise exception 'Foto inválida ou muito grande.'; end if;
 insert into coffee_private.profiles(user_id,name,icon,photo) values(auth.uid(),trim(p_name),p_icon,p_photo)
 on conflict(user_id) do update set name=excluded.name,icon=excluded.icon,photo=excluded.photo;
end $$;
-- Public queue only exposes approved names/photos, without account IDs or e-mails.
create or replace function public.coffee_read() returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('admin',coffee_private.is_admin(),'state',
 (select jsonb_build_object('version',s.version,'queue',s.queue,'participants',coalesce((
 select jsonb_agg(case when pr.user_id is null then p.value else p.value || jsonb_build_object('name',pr.name,'icon',pr.icon,'photo',pr.photo) end order by p.ordinality)
 from jsonb_array_elements(s.participants) with ordinality p(value,ordinality)
 left join coffee_private.profiles pr on pr.participant_id=p.value->>'id'),'[]'::jsonb)) from coffee_private.state s),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from coffee_private.history h),'[]'::jsonb)) $$;

create or replace function public.coffee_comments_read(p_page text) returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at,c.id),'[]'::jsonb) from (
 select c.id,c.body,c.created_at,p.name,p.icon,p.photo,(c.user_id=auth.uid() or coffee_private.is_admin()) as can_delete
 from coffee_private.comments c join coffee_private.profiles p on p.user_id=c.user_id
 where c.page_id=p_page order by c.created_at desc,c.id desc limit 100
) c $$;
create or replace function public.coffee_comment_add(p_id uuid,p_page text,p_body text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre para comentar.'; end if;
 if not exists(select 1 from coffee_private.profiles where user_id=auth.uid()) then raise exception 'Salve seu nome no perfil antes de comentar.'; end if;
 if exists(select 1 from coffee_private.comments where id=p_id and user_id=auth.uid()) then return; end if;
 insert into coffee_private.comments(id,page_id,user_id,body) values(p_id,p_page,auth.uid(),trim(p_body));
end $$;
create or replace function public.coffee_comment_delete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
 delete from coffee_private.comments where id=p_id and (user_id=auth.uid() or coffee_private.is_admin());
 if not found then raise exception 'Comentário indisponível ou sem permissão.'; end if;
end $$;
revoke all on function coffee_private.signup_profile() from public,anon,authenticated;
revoke all on function public.coffee_profile_update(text,text,text) from public,anon,authenticated;
revoke all on function public.coffee_comments_read(text) from public,anon,authenticated;
revoke all on function public.coffee_comment_add(uuid,text,text) from public,anon,authenticated;
revoke all on function public.coffee_comment_delete(uuid) from public,anon,authenticated;
grant execute on function public.coffee_profile_update(text,text,text), public.coffee_comment_add(uuid,text,text), public.coffee_comment_delete(uuid) to authenticated;
grant execute on function public.coffee_comments_read(text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
