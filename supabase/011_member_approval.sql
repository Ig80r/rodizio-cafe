-- Requer 010. Autorização para comentar independente da vaga e da insígnia de autor.
-- Todos os perfis não administrativos precisam de autorização explícita. Comentários antigos são preservados.
begin;

create table if not exists coffee_private.comment_permissions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_by uuid references auth.users(id) on delete set null,
 granted_at timestamptz not null default now()
);
alter table coffee_private.comment_permissions enable row level security;
revoke all on coffee_private.comment_permissions from public,anon,authenticated;
create or replace function coffee_private.can_comment() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (coffee_private.is_admin() or exists(select 1 from coffee_private.comment_permissions permission where permission.user_id=auth.uid()))
$$;
create or replace function public.coffee_comment_permission_set(p_user uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform coffee_private.require_admin();
 if p_enabled is null then raise exception 'Informe se os comentários serão autorizados.';end if;
 if not exists(select 1 from coffee_private.profiles where user_id=p_user) then raise exception 'Perfil não encontrado.';end if;
 if p_enabled then insert into coffee_private.comment_permissions(user_id,granted_by) values(p_user,auth.uid()) on conflict do nothing;
 else delete from coffee_private.comment_permissions where user_id=p_user;
 end if;
end $$;

create or replace function public.coffee_account() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.';end if;
 return jsonb_build_object(
 'can_publish',coffee_private.can_publish(),
 'can_comment',coffee_private.can_comment(),
 'profile',(select to_jsonb(p)||jsonb_build_object('is_author',exists(select 1 from coffee_private.authors a where a.user_id=p.user_id),'is_admin',exists(select 1 from coffee_private.admins adm where adm.user_id=p.user_id),'comments_approved',exists(select 1 from coffee_private.comment_permissions permission where permission.user_id=p.user_id)) from coffee_private.profiles p where p.user_id=auth.uid()),
 'profiles',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('is_author',exists(select 1 from coffee_private.authors a where a.user_id=p.user_id),'is_admin',exists(select 1 from coffee_private.admins adm where adm.user_id=p.user_id),'comments_approved',exists(select 1 from coffee_private.comment_permissions permission where permission.user_id=p.user_id))) from coffee_private.profiles p where coffee_private.is_admin()),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from coffee_private.requests r where r.user_id=auth.uid() or coffee_private.is_admin()),'[]'::jsonb));
end $$;

create or replace function public.coffee_comment_add(p_id uuid,p_page text,p_body text) returns void language plpgsql security definer set search_path='' as $$
declare v_name text;
begin
 if auth.uid() is null then raise exception 'Entre para comentar.'; end if;
 if not coffee_private.can_comment() then raise exception 'Seu cadastro aguarda aprovação do administrador para comentar.';end if;
 if not exists(select 1 from coffee_private.posts where id=p_page and published) then raise exception 'Esta página não está publicada.'; end if;
 if length(trim(coalesce(p_body,''))) not between 1 and 500 then raise exception 'Escreva de 1 a 500 caracteres.'; end if;
 if not exists(select 1 from coffee_private.profiles where user_id=auth.uid()) then
  select left(trim(coalesce(nullif(raw_user_meta_data->>'name',''),nullif(raw_user_meta_data->>'full_name',''),'Cafeteiro')),40) into v_name from auth.users where id=auth.uid();
  insert into coffee_private.profiles(user_id,name,icon) values(auth.uid(),coalesce(nullif(v_name,''),'Cafeteiro'),'🦊') on conflict do nothing;
 end if;
 if exists(select 1 from coffee_private.comments where id=p_id and user_id=auth.uid()) then return; end if;
 insert into coffee_private.comments(id,page_id,user_id,body) values(p_id,p_page,auth.uid(),trim(p_body));
end $$;

revoke all on function public.coffee_comment_permission_set(uuid,boolean) from public,anon,authenticated;
grant execute on function public.coffee_comment_permission_set(uuid,boolean) to authenticated;
revoke all on function coffee_private.can_comment() from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
