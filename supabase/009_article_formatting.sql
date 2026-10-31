begin;
-- Requer 008_authors.sql. Os textos existentes mantêm o formato padrão.
alter table coffee_private.posts add column if not exists body_align text not null default 'left' check(body_align in ('left','center','right','justify'));
alter table coffee_private.posts add column if not exists body_font_size integer not null default 18 check(body_font_size in (14,16,18,20,22,24));
create or replace function public.coffee_post_publish_formatted(p_id text,p_title text,p_quote text,p_author text,p_date date,p_body text,p_image text,p_caption text,p_align text,p_font_size integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coffee_private.can_publish() then raise exception 'Você precisa da insígnia de autor para publicar.';end if;
 if p_align is null or p_align not in ('left','center','right','justify') or p_font_size is null or p_font_size not in (14,16,18,20,22,24) then raise exception 'Formatação inválida.';end if;
 perform public.coffee_post_publish(p_id,p_title,p_quote,p_author,p_date,p_body,p_image,p_caption);
 update coffee_private.posts set body_align=p_align,body_font_size=p_font_size where id=p_id and created_by=auth.uid() and published;
 if not found then raise exception 'Não foi possível aplicar a formatação.';end if;
end $$;
revoke all on function public.coffee_post_publish_formatted(text,text,text,text,date,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.coffee_post_publish_formatted(text,text,text,text,date,text,text,text,text,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
