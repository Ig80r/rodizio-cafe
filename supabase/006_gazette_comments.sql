begin;
-- Requer 005. A leitura não esconde comentários de perfis antigos.
create or replace function public.coffee_comments_read(p_page text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at,item.id),'[]'::jsonb) from (
 select c.id,c.body,c.created_at,coalesce(p.name,'Cafeteiro') as name,coalesce(p.icon,'🦊') as icon,p.photo,
 (c.user_id=auth.uid() or coffee_private.is_admin()) as can_delete
 from coffee_private.comments c left join coffee_private.profiles p on p.user_id=c.user_id
 where c.page_id=p_page and exists(select 1 from coffee_private.posts pub where pub.id=c.page_id and pub.published)
 order by c.created_at desc,c.id desc limit 100
 ) item
$$;
-- Returns the actual saved comment in the same transaction, not just a success flag.
create or replace function public.coffee_comment_publish(p_id uuid,p_page text,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_comment jsonb;
begin
 perform public.coffee_comment_add(p_id,p_page,p_body);
 select jsonb_build_object('id',c.id,'body',c.body,'created_at',c.created_at,'name',coalesce(p.name,'Cafeteiro'),'icon',coalesce(p.icon,'🦊'),'photo',p.photo,'can_delete',true) into v_comment
 from coffee_private.comments c left join coffee_private.profiles p on p.user_id=c.user_id
 where c.id=p_id and c.user_id=auth.uid() and c.page_id=p_page;
 if v_comment is null then raise exception 'O comentário não foi confirmado. Tente novamente.';end if;
 return v_comment;
end $$;
create or replace function public.coffee_posts_read() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(p) order by p.published_on desc,p.created_at desc,p.id),'[]'::jsonb) from coffee_private.posts p where p.published or coffee_private.is_admin()
$$;
revoke all on function public.coffee_comment_publish(uuid,text,text) from public,anon,authenticated;
grant execute on function public.coffee_comment_publish(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
