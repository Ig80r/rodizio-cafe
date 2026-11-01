begin;
-- Requer 015. A autoria original continua imutável.
alter table coffee_private.posts add column if not exists edit_version integer not null default 0;
alter table coffee_private.posts add column if not exists updated_at timestamptz;

create or replace function public.coffee_post_update(
 p_id text,p_version integer,p_title text,p_quote text,p_author text,p_date date,
 p_body text,p_image text,p_caption text,p_align text,p_font_size integer
) returns integer language plpgsql security definer set search_path='' as $$
declare v_post coffee_private.posts;v_version integer;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta para editar.';end if;
 perform 1 from auth.users where id=auth.uid() for key share;
 if not found then raise exception 'Esta conta não está mais disponível.';end if;
 if not coffee_private.can_publish() then raise exception 'Você precisa da insígnia de autor para editar.';end if;
 select * into v_post from coffee_private.posts where id=p_id and created_by=auth.uid() and published for update;
 if not found then raise exception 'Somente quem publicou pode editar esta matéria.';end if;
 if p_version is distinct from v_post.edit_version then raise exception 'Esta matéria mudou em outra aba. Reabra a edição para carregar a versão atual.';end if;
 if length(trim(coalesce(p_title,''))) not between 1 and 120 or length(trim(coalesce(p_quote,''))) not between 1 and 1000 or length(trim(coalesce(p_author,''))) not between 1 and 80 or p_date is null then raise exception 'Confira título, frase do dia, autor da frase e data.';end if;
 if length(coalesce(p_body,''))>3000 or length(coalesce(p_caption,''))>200 then raise exception 'Texto ou legenda acima do limite.';end if;
 if p_image is not null and (length(p_image)>1200000 or p_image !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$') then raise exception 'Imagem inválida ou muito grande.';end if;
 if p_align is null or p_align not in ('left','center','right','justify') or p_font_size is null or p_font_size not in (14,16,18,20,22,24) then raise exception 'Formatação inválida.';end if;
 update coffee_private.posts set title=trim(p_title),quote=trim(p_quote),author=trim(p_author),published_on=p_date,
 body=coalesce(p_body,''),image=p_image,caption=coalesce(p_caption,''),body_align=p_align,body_font_size=p_font_size,
 edit_version=edit_version+1,updated_at=now()
 where id=p_id and created_by=auth.uid() and published returning edit_version into v_version;
 return v_version;
end $$;

create or replace function public.coffee_posts_read() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item.record order by item.published_on desc,item.created_at desc,item.id),'[]'::jsonb) from (
 select p.id,p.published_on,p.created_at,(to_jsonb(p)-'created_by')||jsonb_build_object(
 'publisher_name',pr.name,
 'publisher_is_author',exists(select 1 from coffee_private.authors a where a.user_id=p.created_by),
 'publisher_is_admin',exists(select 1 from coffee_private.admins adm where adm.user_id=p.created_by),
 'is_mine',coalesce(p.created_by=auth.uid(),false),
 'can_edit',coffee_private.can_publish() and coalesce(p.created_by=auth.uid(),false),
 'can_delete',coffee_private.can_publish() and (coffee_private.is_admin() or coalesce(p.created_by=auth.uid(),false))) as record
 from coffee_private.posts p left join coffee_private.profiles pr on pr.user_id=p.created_by where p.published
 ) item
$$;
revoke all on function public.coffee_post_update(text,integer,text,text,text,date,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.coffee_post_update(text,integer,text,text,text,date,text,text,text,text,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
