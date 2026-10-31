-- Requer 008; funciona também após 009. Acrescenta apenas os indicadores públicos de função.
-- Não concede permissões nem expõe e-mails/IDs de contas.
begin;

create or replace function public.coffee_account() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.';end if;
 return jsonb_build_object(
 'can_publish',coffee_private.can_publish(),
 'profile',(select to_jsonb(p)||jsonb_build_object('is_author',exists(select 1 from coffee_private.authors a where a.user_id=p.user_id),'is_admin',exists(select 1 from coffee_private.admins adm where adm.user_id=p.user_id)) from coffee_private.profiles p where p.user_id=auth.uid()),
 'profiles',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('is_author',exists(select 1 from coffee_private.authors a where a.user_id=p.user_id),'is_admin',exists(select 1 from coffee_private.admins adm where adm.user_id=p.user_id))) from coffee_private.profiles p where coffee_private.is_admin()),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from coffee_private.requests r where r.user_id=auth.uid() or coffee_private.is_admin()),'[]'::jsonb));
end $$;

create or replace function public.coffee_read() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('admin',coffee_private.is_admin(),'state',
 (select jsonb_build_object('version',s.version,'queue',s.queue,'participants',coalesce((
 select jsonb_agg(case when pr.user_id is null then entry.value else entry.value||jsonb_build_object('name',pr.name,'icon',pr.icon,'photo',pr.photo,'is_author',exists(select 1 from coffee_private.authors a where a.user_id=pr.user_id),'is_admin',exists(select 1 from coffee_private.admins adm where adm.user_id=pr.user_id)) end order by entry.ordinality)
 from jsonb_array_elements(s.participants) with ordinality entry(value,ordinality)
 left join coffee_private.profiles pr on pr.participant_id=entry.value->>'id'),'[]'::jsonb)) from coffee_private.state s),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from coffee_private.history h),'[]'::jsonb))
$$;

create or replace function public.coffee_posts_read() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item.record order by item.published_on desc,item.created_at desc,item.id),'[]'::jsonb) from (
 select p.id,p.published_on,p.created_at,(to_jsonb(p)-'created_by')||jsonb_build_object(
 'publisher_name',pr.name,
 'publisher_is_author',exists(select 1 from coffee_private.authors a where a.user_id=p.created_by),
 'publisher_is_admin',exists(select 1 from coffee_private.admins adm where adm.user_id=p.created_by),
 'is_mine',coalesce(p.created_by=auth.uid(),false),
 'can_delete',coffee_private.can_publish() and (coffee_private.is_admin() or coalesce(p.created_by=auth.uid(),false))) as record
 from coffee_private.posts p left join coffee_private.profiles pr on pr.user_id=p.created_by where p.published
 ) item
$$;

create or replace function public.coffee_comments_read(p_page text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at,item.id),'[]'::jsonb) from (
 select c.id,c.body,c.created_at,coalesce(p.name,'Cafeteiro') as name,coalesce(p.icon,'🦊') as icon,p.photo,
 exists(select 1 from coffee_private.admins adm where adm.user_id=c.user_id) as is_admin,
 exists(select 1 from coffee_private.authors a where a.user_id=c.user_id) as is_author,
 (c.user_id=auth.uid() or coffee_private.is_admin()) as can_delete
 from coffee_private.comments c left join coffee_private.profiles p on p.user_id=c.user_id
 where c.page_id=p_page and exists(select 1 from coffee_private.posts pub where pub.id=c.page_id and pub.published)
 order by c.created_at desc,c.id desc limit 100
 ) item
$$;

create or replace function public.coffee_comment_publish(p_id uuid,p_page text,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_comment jsonb;
begin
 perform public.coffee_comment_add(p_id,p_page,p_body);
 select jsonb_build_object('id',c.id,'body',c.body,'created_at',c.created_at,'name',coalesce(p.name,'Cafeteiro'),'icon',coalesce(p.icon,'🦊'),'photo',p.photo,'is_admin',exists(select 1 from coffee_private.admins adm where adm.user_id=c.user_id),'is_author',exists(select 1 from coffee_private.authors a where a.user_id=c.user_id),'can_delete',true) into v_comment
 from coffee_private.comments c left join coffee_private.profiles p on p.user_id=c.user_id
 where c.id=p_id and c.user_id=auth.uid() and c.page_id=p_page;
 if v_comment is null then raise exception 'O comentário não foi confirmado. Tente novamente.';end if;
 return v_comment;
end $$;

notify pgrst, 'reload schema';
commit;
